const DEFAULT_PROXY_URL = "http://127.0.0.1:10808";

function normalizeProxyUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Proxy URL is required");
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Proxy URL must be a valid http:// or https:// URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Proxy URL must use http:// or https://");
  }
  if (!parsed.hostname) throw new Error("Proxy URL must include a host");
  if (parsed.username || parsed.password) {
    throw new Error("Proxy credentials are not supported in launcher settings");
  }
  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error("Proxy URL must not include a path, query, or fragment");
  }
  return parsed.origin;
}

function mergeNoProxy(env) {
  const values = ["127.0.0.1", "localhost"];
  for (const raw of [env.NO_PROXY, env.no_proxy]) {
    if (typeof raw !== "string") continue;
    for (const item of raw.split(",")) {
      const value = item.trim();
      if (value) values.push(value);
    }
  }
  return [...new Set(values)].join(",");
}

function buildChildEnvironment(state, baseEnvironment = process.env) {
  const env = { ...baseEnvironment };
  if (!state?.proxyEnabled) return env;

  const proxyUrl = normalizeProxyUrl(state.proxyUrl || DEFAULT_PROXY_URL);
  const noProxy = mergeNoProxy(env);
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    env[key] = proxyUrl;
  }
  env.NO_PROXY = noProxy;
  env.no_proxy = noProxy;
  return env;
}

module.exports = {
  DEFAULT_PROXY_URL,
  buildChildEnvironment,
  normalizeProxyUrl,
};
