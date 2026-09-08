import { expect, test } from "bun:test";
import { IMAGE_PREVIEW_HTML } from "../src/standalone/image-preview";

interface FakeElement {
  hidden: boolean;
  disabled: boolean;
  textContent: string;
  src: string;
  alt: string;
  listeners: Map<string, Array<() => void>>;
  addEventListener(type: string, listener: () => void): void;
}

function createElement(): FakeElement {
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    src: "",
    alt: "",
    listeners: new Map(),
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    },
  };
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
}

function mountPreview(
  openai?: Record<string, unknown>,
  storage = { localStorage: createStorage(), sessionStorage: createStorage() },
) {
  const elements = Object.fromEntries(
    ["card", "preview", "name", "detail", "status", "statusText", "retry"].map(id => [id, createElement()]),
  ) as Record<string, FakeElement>;
  const listeners = new Map<string, Array<(event: { source?: unknown; data?: unknown; detail?: unknown }) => void>>();
  const messages: Array<Record<string, unknown>> = [];
  const parent = { postMessage(message: Record<string, unknown>) { messages.push(message); } };
  let nextTimer = 1;
  const timers = new Map<number, () => void>();
  const fakeWindow = {
    ...(openai ? { openai } : {}),
    ...storage,
    parent,
    addEventListener(type: string, listener: (event: { source?: unknown; data?: unknown; detail?: unknown }) => void) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
  };
  const fakeDocument = {
    referrer: "https://chatgpt.com/c/test-conversation",
    getElementById(id: string) { return elements[id]; },
  };
  const script = /<script>([\s\S]*)<\/script>/.exec(IMAGE_PREVIEW_HTML)?.[1];
  if (!script) throw new Error("Image preview script is missing");
  const execute = new Function("window", "document", "setTimeout", "clearTimeout", script);
  execute(
    fakeWindow,
    fakeDocument,
    (callback: () => void) => {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    (id: number) => timers.delete(id),
  );
  return {
    elements,
    messages,
    dispatchMessage(data: Record<string, unknown>) {
      for (const listener of listeners.get("message") ?? []) listener({ source: parent, data });
    },
    dispatchGlobals(globals: unknown) {
      for (const listener of listeners.get("openai:set_globals") ?? []) listener({ detail: { globals } });
    },
    runTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(callback => callback());
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("image preview persists a small widget snapshot and restores after iframe recreation", async () => {
  const previewId = "11111111-1111-4111-8111-111111111111";
  const dataUrl = "data:image/png;base64,aW1hZ2U=";
  let widgetState: unknown;
  const first = mountPreview({
    toolResponseMetadata: {
      mcp_tool_result: {
        _meta: {
          webgpt_image_preview: {
            preview_id: previewId,
            name: "refresh.png",
            mime_type: "image/png",
            bytes: 5,
            width: 1,
            height: 1,
            data_url: dataUrl,
          },
        },
      },
    },
    setWidgetState(value: unknown) { widgetState = value; },
  });
  expect(first.elements.preview.src).toBe(dataUrl);
  expect(widgetState).toEqual({
    webgpt_image_preview: {
      preview_id: previewId,
      name: "refresh.png",
      mime_type: "image/png",
      bytes: 5,
      width: 1,
      height: 1,
    },
  });

  expect(first.messages.some(message => message.method === "ui/initialize")).toBe(false);

  const restoredOpenai = {
    widgetState,
    async callTool(name: string, args: unknown) {
      expect(name).toBe("file_image_preview_restore");
      expect(args).toEqual({ preview_id: previewId });
      return {
      structuredContent: { preview_id: previewId, name: "refresh.png", mime_type: "image/png", bytes: 5 },
      _meta: {
        webgpt_image_preview: {
          preview_id: previewId,
          name: "refresh.png",
          mime_type: "image/png",
          bytes: 5,
          data_url: dataUrl,
        },
      },
      };
    },
  };
  const restored = mountPreview(restoredOpenai);
  await flushPromises();
  expect(restored.messages.some(message => message.method === "ui/initialize")).toBe(false);
  expect(restored.messages.some(message => message.method === "tools/call")).toBe(false);
  expect(restored.elements.preview.src).toBe(dataUrl);
  expect(restored.elements.card.hidden).toBe(false);
  expect(restored.elements.status.hidden).toBe(true);
});

test("image preview keeps the standard MCP Apps initialization fallback", async () => {
  const mounted = mountPreview();
  const initialize = mounted.messages.find(message => message.method === "ui/initialize");
  expect(initialize).toMatchObject({
    method: "ui/initialize",
    params: {
      protocolVersion: "2025-06-18",
      appCapabilities: {},
      appInfo: { name: "webgpt-image-preview", version: "0.3.0" },
    },
  });
  expect(initialize?.params).not.toHaveProperty("capabilities");
  expect(initialize?.params).not.toHaveProperty("clientInfo");
  mounted.dispatchMessage({ jsonrpc: "2.0", id: initialize?.id, result: {} });
  await flushPromises();
  expect(mounted.messages.some(message => message.method === "ui/notifications/initialized")).toBe(true);
});

test("standard MCP Apps do not restore unrelated historical preview ids", async () => {
  const previewId = "33333333-3333-4333-8333-333333333333";
  const storage = { localStorage: createStorage(), sessionStorage: createStorage() };
  storage.localStorage.setItem(
    "webgpt-image-preview-ledger:ui://webgpt-luna/image-preview-v12.html:test-conversation",
    JSON.stringify([previewId]),
  );

  const mounted = mountPreview(undefined, storage);
  const initialize = mounted.messages.find(message => message.method === "ui/initialize");
  mounted.dispatchMessage({ jsonrpc: "2.0", id: initialize?.id, result: {} });
  await flushPromises();
  mounted.runTimers();
  await flushPromises();

  expect(mounted.messages.some(message => message.method === "tools/call")).toBe(false);
  expect(mounted.elements.preview.src).toBe("");
  expect(mounted.elements.statusText.textContent).toBe("当前工具结果没有可显示的图片。");
});

test("image preview persists once the ChatGPT widget-state bridge becomes available", () => {
  const previewId = "22222222-2222-4222-8222-222222222222";
  let widgetState: unknown;
  const openai: Record<string, unknown> = {
    toolResponseMetadata: {
      mcp_tool_result: {
        _meta: {
          webgpt_image_preview: {
            preview_id: previewId,
            name: "delayed.png",
            mime_type: "image/png",
            bytes: 5,
            data_url: "data:image/png;base64,aW1hZ2U=",
          },
        },
      },
    },
  };
  const mounted = mountPreview(openai);
  expect(widgetState).toBeUndefined();

  openai.setWidgetState = (value: unknown) => { widgetState = value; };
  mounted.dispatchGlobals({});
  expect(widgetState).toEqual({
    webgpt_image_preview: {
      preview_id: previewId,
      name: "delayed.png",
      mime_type: "image/png",
      bytes: 5,
    },
  });
});

test("image preview widget state persistence is safe under synchronous host reentry", () => {
  const previewId = "44444444-4444-4444-8444-444444444444";
  const openai: Record<string, unknown> = {
    toolResponseMetadata: {
      mcp_tool_result: {
        _meta: {
          webgpt_image_preview: {
            preview_id: previewId,
            name: "reentrant.png",
            mime_type: "image/png",
            bytes: 5,
            data_url: "data:image/png;base64,aW1hZ2U=",
          },
        },
      },
    },
  };
  const mounted = mountPreview(openai);
  let calls = 0;
  openai.setWidgetState = () => {
    calls += 1;
    mounted.dispatchGlobals({});
  };

  expect(() => mounted.dispatchGlobals({})).not.toThrow();
  expect(calls).toBe(1);
});

