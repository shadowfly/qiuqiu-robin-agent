// A timestamp from an external API can be out of Date's representable range, or not a
// number at all. new Date(x).toISOString() throws on both, which would abort a probe
// that had already gathered every other piece of evidence. Absence of a formatted time
// is not evidence about the token, so a bad value becomes null rather than a crash.
export function isoTime(value) {
  // Number() reads null, "", [] and false as 0, which would turn a field the source
  // never filled in into 1970-01-01 -- a concrete observation nobody made. Only a
  // number or a non-empty numeric string counts as a timestamp that was actually read.
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = typeof value === "string" ? value.trim() : value;
  if (text === "") return null;
  const ms = Number(text);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
