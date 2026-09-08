const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PROXY_URL,
  buildChildEnvironment,
  normalizeProxyUrl,
} = require("../electron/proxy-env.cjs");

test("proxy URL validation accepts local HTTP proxies and normalizes trailing slash", () => {
  assert.equal(normalizeProxyUrl(" http://127.0.0.1:10808/ "), DEFAULT_PROXY_URL);
  assert.equal(normalizeProxyUrl("https://proxy.example:8443"), "https://proxy.example:8443");
  assert.throws(() => normalizeProxyUrl("socks5://127.0.0.1:10808"), /http:\/\/ or https:\/\//);
  assert.throws(() => normalizeProxyUrl("http://user:secret@127.0.0.1:10808"), /credentials/);
});

test("enabled launcher proxy is injected into runtime and tunnel child environments", () => {
  const env = buildChildEnvironment(
    { proxyEnabled: true, proxyUrl: DEFAULT_PROXY_URL },
    { PATH: "test", NO_PROXY: "example.local" },
  );
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    assert.equal(env[key], DEFAULT_PROXY_URL);
  }
  assert.equal(env.NO_PROXY, "127.0.0.1,localhost,example.local");
  assert.equal(env.no_proxy, env.NO_PROXY);
  assert.equal(env.PATH, "test");
});

test("disabled launcher proxy leaves inherited environment unchanged", () => {
  const base = { HTTP_PROXY: "http://system-proxy:8080", PATH: "test" };
  assert.deepEqual(buildChildEnvironment({ proxyEnabled: false, proxyUrl: DEFAULT_PROXY_URL }, base), base);
});
