import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  normalizeAccount,
  normalizeEvents,
  normalizeHistory,
  normalizeSmartMentions,
  sanitizeExternalText,
  sanitizeXHandle,
} from "../scripts/lib/moni/normalize.mjs";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/moni");
const fixture = async (name) => JSON.parse(await readFile(resolve(FIXTURES, name), "utf8"));

test("normalizes account metrics into the stable schema", async () => {
  const account = normalizeAccount(await fixture("full-account.json"), "RobinResearch");

  assert.equal(account.username, "RobinResearch");
  assert.equal(account.moniScore, 78.5);
  assert.equal(account.smartMentionsCount, 47);
  assert.deepEqual(account.tags, ["research", "defi"]);
  assert.deepEqual(account.chains, ["robinhood"]);
});

test("normalizes histories, mentions and events", async () => {
  const history = normalizeHistory(await fixture("mentions-history.json"));
  const mentions = normalizeSmartMentions(await fixture("smart-mentions.json"));
  const events = normalizeEvents(await fixture("events.json"));

  assert.equal(history.length, 2);
  assert.equal(history[1].count, 21);
  assert.equal(mentions[0].author.smartTier, 3);
  assert.equal(mentions[0].text, "Research update for Robinhood Chain");
  assert.equal(events[0].type, "NEW_BIO");
});

test("sanitizes external text and rejects invalid handles", () => {
  assert.equal(sanitizeExternalText("first\nsecond\u202e"), "first second");
  assert.equal(sanitizeXHandle("@valid_name"), "valid_name");
  assert.equal(sanitizeXHandle("not-valid-name"), null);
});

// The live v3 API splits the account across meta/smartEngagement/smartProfile,
// returns history as [epochSeconds, count] pairs, and nests feed posts under data.
// Read with the flat key list alone, every one of these fields came back null.
test("normalizes the live v3 account shape", async () => {
  const account = normalizeAccount(await fixture("full-account-v3.json"), "longbowlend");

  assert.equal(account.id, "2082494363481800704");
  assert.equal(account.username, "longbowlend");
  assert.equal(account.moniScore, 618);
  assert.equal(account.smartsCount, 57);
  assert.equal(account.mentionsCount, 197);
  assert.equal(account.smartMentionsCount, 61);
  assert.equal(account.accountAgeDays, 32);
  assert.deepEqual(account.tags, ["DeFi", "RWA"]);
  assert.deepEqual(account.chains, ["Ethereum"]);
  // Absent from this endpoint: null must mean "not provided", never zero.
  assert.equal(account.followersCount, null);
  assert.equal(account.smartTier, null);
});

test("normalizes a v3 chart of epoch-second pairs", async () => {
  const history = normalizeHistory(await fixture("mentions-history-v3.json"));

  assert.equal(history.length, 3);
  assert.deepEqual(history[0], { at: "2026-08-01T11:35:33.000Z", count: 17 });
  assert.equal(history[2].count, 274);
});

test("normalizes a v3 smart-mention feed item", async () => {
  const [mention] = normalizeSmartMentions(await fixture("smart-mentions-v3.json"));

  assert.equal(mention.id, "2094288652612579587");
  assert.equal(mention.createdAt, "2026-08-31T04:58:19.000Z");
  assert.equal(mention.url, "https://x.com/1499879157672648708/status/2094288652612579587");
  assert.equal(mention.author.username, "graildoteth");
  // The feed carries no post text; null must not be reported as an empty post.
  assert.equal(mention.text, null);
});

test("normalizes v3 account events with readable timestamps", async () => {
  const [event] = normalizeEvents(await fixture("events-v3.json"));

  assert.equal(event.type, "NEW_BIO");
  assert.equal(event.occurredAt, "2026-08-27T19:17:29.000Z");
});
