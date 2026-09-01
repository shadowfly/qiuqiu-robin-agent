import { createHash } from "node:crypto";
import { createSearchCache } from "./cache.mjs";

export const DEFAULT_GROK_API_URL = "https://ai.taosu.xyz/v1/chat/completions";
export const DEFAULT_GROK_SEARCH_MODEL = "grok-chat-fast";

const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeError(value, secret) {
  let text = String(value || "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (secret) text = text.split(secret).join("[redacted]");
  return text.length > 240 ? text.slice(0, 240) + "…" : text;
}

function classifyStatus(status, body) {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404 || (status === 400 && /model|not found|unsupported/i.test(body))) return "model_unavailable";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_error";
  return "http_" + status;
}

function thrownKind(error) {
  const text = String(error?.name || "") + " " + String(error?.message || error || "");
  if (/abort|timeout/i.test(text)) return "timeout";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed/i.test(text)) return "network_unreachable";
  return "request_error";
}

// A thrown timeout means the model is still working, not that the request was
// lost: retrying spends the budget twice and fails the same way. Retry only the
// kinds a second attempt can actually fix.
function retryable(kind) {
  return ["rate_limited", "upstream_error", "network_unreachable"].includes(kind);
}

function cacheKey(url, body) {
  return createHash("sha256").update(url).update("\0").update(JSON.stringify(body)).digest("hex");
}

export function createGrokSearchClient({
  apiKey = process.env.GROK_API_KEY,
  apiUrl = process.env.GROK_API_URL || DEFAULT_GROK_API_URL,
  model = process.env.GROK_SEARCH_MODEL || DEFAULT_GROK_SEARCH_MODEL,
  fetchImpl = globalThis.fetch,
  // A research call asks for a synthesized, sourced answer: the gateway routinely
  // needs 30-60s to produce one, so a 30s ceiling failed every real query while
  // a trivial ping returned in 3s. Override with GROK_SEARCH_TIMEOUT_MS.
  timeoutMs = Number(process.env.GROK_SEARCH_TIMEOUT_MS) || 90000,
  maxRetries = 1,
  sleep = sleepDefault,
  cache = createSearchCache(),
  now = () => Date.now(),
} = {}) {
  async function search(messages, { maxTokens = 2500 } = {}) {
    if (!apiKey) {
      return {
        ok: false,
        model,
        attempts: 0,
        latencyMs: 0,
        errorKind: "missing_api_key",
        error: "GROK_API_KEY is not configured",
      };
    }

    const body = { model, messages, stream: false, temperature: 0.1, max_tokens: maxTokens };
    const key = cacheKey(apiUrl, body);
    const startedAt = now();
    const cached = await cache?.get(key);
    if (cached) {
      return {
        ok: true,
        model,
        attempts: 0,
        latencyMs: Math.max(0, now() - startedAt),
        cacheHit: true,
        statusCode: cached.statusCode || 200,
        data: cached.data,
      };
    }

    let attempt = 0;
    while (attempt <= maxRetries) {
      let response;
      try {
        response = await fetchImpl(apiUrl, {
          method: "POST",
          headers: {
            authorization: "Bearer " + apiKey,
            "content-type": "application/json",
            accept: "application/json",
            "user-agent": "ca-agent/grok-search-adapter",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const errorKind = thrownKind(error);
        if (attempt < maxRetries && retryable(errorKind)) {
          await sleep(250 * 2 ** attempt);
          attempt += 1;
          continue;
        }
        return {
          ok: false,
          model,
          attempts: attempt + 1,
          latencyMs: Math.max(0, now() - startedAt),
          errorKind,
          error: sanitizeError(error?.message || error, apiKey),
        };
      }

      if (!response.ok) {
        const rawBody = await response.text().catch(() => "");
        const errorBody = sanitizeError(rawBody, apiKey);
        const errorKind = classifyStatus(response.status, errorBody);
        if (attempt < maxRetries && retryable(errorKind)) {
          const retryAfter = Number(response.headers?.get?.("retry-after"));
          await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 5000) : 250 * 2 ** attempt);
          attempt += 1;
          continue;
        }
        return {
          ok: false,
          model,
          attempts: attempt + 1,
          latencyMs: Math.max(0, now() - startedAt),
          statusCode: response.status,
          errorKind,
          error: errorBody || errorKind,
        };
      }

      try {
        const data = await response.json();
        await cache?.set(key, { statusCode: response.status, data }).catch(() => {});
        return {
          ok: true,
          model,
          attempts: attempt + 1,
          latencyMs: Math.max(0, now() - startedAt),
          statusCode: response.status,
          cacheHit: false,
          data,
        };
      } catch (error) {
        return {
          ok: false,
          model,
          attempts: attempt + 1,
          latencyMs: Math.max(0, now() - startedAt),
          statusCode: response.status,
          errorKind: "invalid_json",
          error: sanitizeError(error?.message || error, apiKey),
        };
      }
    }
  }

  return { search, model, configured: Boolean(apiKey), apiUrl };
}
