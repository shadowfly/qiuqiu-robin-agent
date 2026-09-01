// A timestamp from an external API can be out of Date's representable range, or not a
// number at all. new Date(x).toISOString() throws on both, which would abort a probe
// that had already gathered every other piece of evidence. Absence of a formatted time
// is not evidence about the token, so a bad value becomes null rather than a crash.
export function isoTime(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
