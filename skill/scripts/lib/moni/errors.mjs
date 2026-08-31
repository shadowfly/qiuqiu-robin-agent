const MAX_ERROR_LENGTH = 240;

export function sanitizeError(value) {
  const text = String(value || "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > MAX_ERROR_LENGTH ? text.slice(0, MAX_ERROR_LENGTH) + "…" : text;
}

export function classifyHttpStatus(status) {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "account_not_indexed";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_error";
  return "http_" + status;
}

export function classifyThrownError(error) {
  const message = String(error?.name || "") + " " + String(error?.message || error || "");
  if (/abort|timeout/i.test(message)) return "timeout";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed/i.test(message)) return "network_unreachable";
  return "request_error";
}

export function isRetryable(errorKind) {
  return ["timeout", "rate_limited", "upstream_error", "network_unreachable"].includes(errorKind);
}
