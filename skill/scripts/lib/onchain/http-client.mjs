const DEFAULT_TIMEOUT_MS = 10000;
const TRANSIENT_ERRORS = new Set(["timeout", "rate_limited", "network_unreachable"]);

const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
};

function truncate(value, max = 200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) + "... [truncated]" : text;
}

function classifyHttpError(status, body) {
  if (/Just a moment|cf-chl|challenge-platform/i.test(body)) return "cloudflare_challenge";
  if (status === 429) return "rate_limited";
  if (status === 404) return "not_found";
  return "http_" + status;
}

function classifyThrownError(error) {
  const message = String(error?.message || error || "");
  if (/timeout|aborted|AbortError/i.test(message)) return "timeout";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed/i.test(message)) return "network_unreachable";
  return "request_error";
}

export function sourceStatus(result) {
  return result.ok
    ? { status: "ok" }
    : { status: result.errorKind || "error", httpStatus: result.status ?? null, detail: result.error ?? null };
}

export function createJsonClient({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  headers = DEFAULT_HEADERS,
  maxRetries = 1,
  retryDelayMs = 1500,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  async function once(url) {
    try {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        const body = await response.text();
        return {
          ok: false,
          status: response.status,
          errorKind: classifyHttpError(response.status, body),
          error: truncate(body),
        };
      }
      return { ok: true, data: await response.json() };
    } catch (error) {
      return { ok: false, errorKind: classifyThrownError(error), error: truncate(error?.message || error) };
    }
  }

  async function getJson(url) {
    let attempt = 0;
    let result = await once(url);
    while (!result.ok && TRANSIENT_ERRORS.has(result.errorKind) && attempt < maxRetries) {
      await sleep(retryDelayMs * 2 ** attempt);
      attempt += 1;
      result = await once(url);
    }
    return result;
  }

  return { getJson };
}
