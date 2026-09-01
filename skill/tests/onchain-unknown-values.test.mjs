import test from "node:test";
import assert from "node:assert/strict";
import { isoTime } from "../scripts/lib/onchain/time.mjs";
import { createSanitizer } from "../scripts/lib/onchain/sanitize.mjs";

test("an absent timestamp formats to null, never to the Unix epoch", () => {
  // Number(null), Number("") and Number([]) are all 0, so a coercing formatter turns a
  // field the source never filled in into a concrete observation of 1970-01-01.
  for (const value of [null, undefined, "", "   ", [], false, true, {}, "not-a-date"]) {
    assert.equal(isoTime(value), null, `isoTime(${JSON.stringify(value)})`);
  }
});

test("a timestamp that was actually read still formats, in or out of range", () => {
  assert.equal(isoTime(1735689600000), "2025-01-01T00:00:00.000Z");
  assert.equal(isoTime("1735689600000"), "2025-01-01T00:00:00.000Z");
  // An explicit zero is a value the source returned, not an absent one.
  assert.equal(isoTime(0), "1970-01-01T00:00:00.000Z");
  // Out of Date's representable range: unformattable, but still not a crash.
  assert.equal(isoTime(1e18), null);
});

test("keys that collide after sanitizing keep both values instead of overwriting", () => {
  const sanitizer = createSanitizer();
  // The second key differs from the first only by a zero-width space, which the
  // sanitizer strips. Assembling the object in one pass let the later entry replace the
  // earlier one, so a "present" finding could be hidden behind a clean-looking twin.
  const output = sanitizer.sanitizeDecoded({ risk: "present", "ri​sk": "absent" }, "decoded");

  assert.equal(output.risk, "present");
  assert.equal(output["risk#2"], "absent");
  const collisions = sanitizer.notes.filter((note) => note.flags.includes("key_collision_after_sanitizing"));
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].key, "risk");
});

test("distinct keys are left alone by the collision handling", () => {
  const sanitizer = createSanitizer();
  const output = sanitizer.sanitizeDecoded({ risk: "present", other: "absent", nested: { risk: "absent" } }, "decoded");

  assert.deepEqual(output, { risk: "present", other: "absent", nested: { risk: "absent" } });
  assert.deepEqual(
    sanitizer.notes.filter((note) => note.flags.includes("key_collision_after_sanitizing")),
    []
  );
});
