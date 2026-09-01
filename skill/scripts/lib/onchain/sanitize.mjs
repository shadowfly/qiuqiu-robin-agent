const INVISIBLE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

const INJECTION_HINT =
  /ignore\s+(all\s+)?(previous|prior|above)|disregard\s+(all|previous|prior)|system\s*prompt|you\s+are\s+now|new\s+instructions?|<\s*\/?\s*(system|assistant|user)\s*>|\bverdict\s*[:=]|strong_watch|忽略[^。]{0,10}指令|你现在是/i;

export function createSanitizer() {
  const notes = [];

  function sanitizeText(value, field, max = 120) {
    if (value === null || value === undefined) return null;
    const raw = String(value);
    const stripped = raw.replace(INVISIBLE_CHARS, "");
    let output = stripped.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const flags = [];
    if (stripped.length !== raw.length) flags.push("hidden_chars_removed");
    if (/[\r\n]/.test(raw)) flags.push("newlines_collapsed");
    if (output.length > max) {
      output = output.slice(0, max) + "…[truncated]";
      flags.push("over_length");
    }
    if (INJECTION_HINT.test(output)) flags.push("looks_like_prompt_injection");
    if (flags.length) notes.push({ field, flags, originalLength: raw.length });
    return output;
  }

  function sanitizeUrl(value, field) {
    const text = sanitizeText(value, field, 300);
    if (!text) return null;
    try {
      const url = new URL(text);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        notes.push({ field, flags: ["non_http_scheme"], scheme: url.protocol });
        return null;
      }
      return url.toString();
    } catch {
      notes.push({ field, flags: ["unparseable_url"] });
      return null;
    }
  }

  // Keys are attacker-controlled too: a decoded struct field, a counter name or a
  // DexScreener boost key is a string the deployer or the API chose. Sanitizing only the
  // values leaves an unchecked channel that reaches the agent verbatim.
  function sanitizeDecoded(value, field, depth = 0) {
    if (depth > 6) return null;
    if (typeof value === "string") return sanitizeText(value, field, 300);
    if (Array.isArray(value)) return value.map((item, index) => sanitizeDecoded(item, `${field}[${index}]`, depth + 1));
    if (value && typeof value === "object") {
      // Two raw keys can sanitize down to the same string -- "risk" and "ri\u200Bsk"
      // differ only by a character this sanitizer strips. Building the object in one
      // pass would let the later entry silently overwrite the earlier one, which is a
      // way to make a "present" finding disappear behind a clean-looking duplicate.
      // Both values are kept, the collision is suffixed so the shadowing is visible,
      // and it is recorded as a note because a deployer does not collide keys by
      // accident.
      const output = {};
      const seen = new Map();
      for (const [key, item] of Object.entries(value)) {
        const safeKey = sanitizeText(key, `${field}.<key>`, 64) || "unnamed_key";
        const collisions = (seen.get(safeKey) || 0) + 1;
        seen.set(safeKey, collisions);
        if (collisions > 1) notes.push({ field: `${field}.<key>`, flags: ["key_collision_after_sanitizing"], key: safeKey });
        const finalKey = collisions > 1 ? `${safeKey}#${collisions}` : safeKey;
        output[finalKey] = sanitizeDecoded(item, `${field}.${key}`, depth + 1);
      }
      return output;
    }
    return value;
  }

  return { sanitizeText, sanitizeUrl, sanitizeDecoded, notes };
}
