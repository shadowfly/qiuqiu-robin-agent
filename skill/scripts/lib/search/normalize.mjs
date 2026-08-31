const INVISIBLE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

export function sanitizeSearchText(value, max = 12000) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(INVISIBLE_CHARS, "").replace(/\r\n?/g, "\n").trim();
  return text.length > max ? text.slice(0, max) + "\n…[truncated]" : text;
}

export function sanitizeSearchQuery(value, max = 300) {
  const text = sanitizeSearchText(value, max)?.replace(/\s+/g, " ").trim();
  return text || null;
}

function sanitizeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function sourceFrom(value) {
  if (typeof value === "string") return { url: sanitizeUrl(value), title: null, publishedAt: null, snippet: null };
  return {
    url: sanitizeUrl(value?.url ?? value?.link ?? value?.uri),
    title: sanitizeSearchText(value?.title ?? value?.name, 240),
    publishedAt: sanitizeSearchText(value?.publishedAt ?? value?.published_at ?? value?.date, 80),
    snippet: sanitizeSearchText(value?.snippet ?? value?.description ?? value?.text, 600),
  };
}

function parseJsonContent(content) {
  const trimmed = String(content || "").trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function urlsFromText(content) {
  return [...String(content || "").matchAll(/https?:\/\/[^\s)\]}>"']+/g)].map((match) => sourceFrom(match[0]));
}

export function normalizeGrokResponse(raw) {
  const message = raw?.choices?.[0]?.message || {};
  const content = typeof message.content === "string" ? message.content : message.content?.[0]?.text || "";
  const parsed = parseJsonContent(content);
  const declaredSources = [
    ...(Array.isArray(parsed?.sources) ? parsed.sources : []),
    ...(Array.isArray(message?.citations) ? message.citations : []),
    ...(Array.isArray(raw?.citations) ? raw.citations : []),
  ].map(sourceFrom);
  const sources = uniqueSources([...declaredSources, ...urlsFromText(content)]);
  return {
    answer: sanitizeSearchText(parsed ? parsed.answer ?? parsed.summary : content),
    sources,
    queriesUsed: (Array.isArray(parsed?.queriesUsed) ? parsed.queriesUsed : [])
      .map((query) => sanitizeSearchQuery(query))
      .filter(Boolean)
      .slice(0, 20),
    structured: Boolean(parsed),
    responseId: sanitizeSearchText(raw?.id, 100),
    usage: {
      promptTokens: Number(raw?.usage?.prompt_tokens) || null,
      completionTokens: Number(raw?.usage?.completion_tokens) || null,
      totalTokens: Number(raw?.usage?.total_tokens) || null,
    },
  };
}
