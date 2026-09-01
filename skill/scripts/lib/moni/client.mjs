import { classifyHttpStatus, classifyThrownError, isRetryable, sanitizeError } from "./errors.mjs";
import { createMoniCache } from "./cache.mjs";

export const DEFAULT_MONI_BASE_URL = "https://api.discover.getmoni.io/api/v3/";

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(baseUrl, path, query = {}) {
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  const url = new URL(String(path || "").replace(/^\/+/, ""), base);
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 5000);
  return Math.min(250 * 2 ** attempt, 2000);
}

export function createMoniClient({
  apiKey = process.env.MONI_API_KEY,
  baseUrl = DEFAULT_MONI_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
  maxRetries = 1,
  sleep = defaultSleep,
  now = () => Date.now(),
  cache = createMoniCache(),
} = {}) {
  const safeError = (value) => {
    const sanitized = sanitizeError(value);
    return apiKey ? sanitized.split(apiKey).join("[redacted]") : sanitized;
  };

  async function request(name, path, { query = {}, estimatedPoints = 0 } = {}) {
    const endpoint = String(path || "");
    if (!apiKey) {
      return {
        ok: false,
        name,
        endpoint,
        estimatedPoints,
        attempts: 0,
        latencyMs: 0,
        errorKind: "missing_api_key",
        error: "MONI_API_KEY is not configured",
      };
    }

    const url = buildUrl(baseUrl, endpoint, query);
    const startedAt = now();
    const cached = await cache?.get(url.toString());
    if (cached) {
      return {
        ok: true,
        name,
        endpoint,
        estimatedPoints,
        attempts: 0,
        latencyMs: Math.max(0, now() - startedAt),
        statusCode: cached.statusCode || 200,
        cacheHit: true,
        data: cached.data,
      };
    }
    let attempt = 0;

    while (attempt <= maxRetries) {
      let response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: {
            "Api-Key": apiKey,
            accept: "application/json",
            "user-agent": "ca-agent/moni-adapter",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const errorKind = classifyThrownError(error);
        if (attempt < maxRetries && isRetryable(errorKind)) {
          await sleep(250 * 2 ** attempt);
          attempt += 1;
          continue;
        }
        return {
          ok: false,
          name,
          endpoint,
          estimatedPoints,
          attempts: attempt + 1,
          latencyMs: Math.max(0, now() - startedAt),
          errorKind,
          error: safeError(error?.message || error),
        };
      }

      if (!response.ok) {
        const errorKind = classifyHttpStatus(response.status);
        const body = safeError(await response.text().catch(() => ""));
        if (attempt < maxRetries && isRetryable(errorKind)) {
          await sleep(retryDelay(response, attempt));
          attempt += 1;
          continue;
        }
        return {
          ok: false,
          name,
          endpoint,
          estimatedPoints,
          attempts: attempt + 1,
          latencyMs: Math.max(0, now() - startedAt),
          statusCode: response.status,
          errorKind,
          error: body || errorKind,
        };
      }

      try {
        const data = await response.json();
        await cache?.set(url.toString(), { statusCode: response.status, data }).catch(() => {});
        return {
          ok: true,
          name,
          endpoint,
          estimatedPoints,
          attempts: attempt + 1,
          latencyMs: Math.max(0, now() - startedAt),
          statusCode: response.status,
          cacheHit: false,
          data,
        };
      } catch (error) {
        return {
          ok: false,
          name,
          endpoint,
          estimatedPoints,
          attempts: attempt + 1,
          latencyMs: Math.max(0, now() - startedAt),
          statusCode: response.status,
          errorKind: "invalid_json",
          error: safeError(error?.message || error),
        };
      }
    }
  }

  return { request, baseUrl, configured: Boolean(apiKey) };
}
