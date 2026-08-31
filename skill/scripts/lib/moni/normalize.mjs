const INVISIBLE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

export function sanitizeExternalText(value, max = 500) {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .replace(INVISIBLE_CHARS, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max) + "…[truncated]" : text;
}

export function sanitizeXHandle(value) {
  const handle = String(value || "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

function sanitizeUrl(value) {
  const text = sanitizeExternalText(value, 300);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Moni v3 returns the account split across meta / smartEngagement / smartProfile
// rather than as one flat object. Searching those sub-objects too keeps a single
// key list working against both shapes; raw stays first, so a flat key still wins.
function containers(raw) {
  return [
    raw,
    raw?.data,
    raw?.result,
    raw?.account,
    raw?.profile,
    raw?.data?.account,
    raw?.data?.profile,
    raw?.meta,
    raw?.smartEngagement,
    raw?.smartProfile,
    raw?.data?.meta,
    raw?.data?.smartEngagement,
    raw?.data?.smartProfile,
  ].filter((value) => value && typeof value === "object" && !Array.isArray(value));
}

function pick(raw, keys) {
  for (const object of containers(raw)) {
    for (const key of keys) {
      if (object[key] !== null && object[key] !== undefined) return object[key];
    }
  }
  return null;
}

// Moni v3 timestamps are epoch seconds. Left raw they read as meaningless integers
// in the report, so anything that looks like a plausible epoch becomes an ISO string;
// anything else (already-formatted dates) is passed through as text.
function timestampOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) {
    const ms = number > 1e11 ? number : number * 1000;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return sanitizeExternalText(value, 80);
}

// Feed authors arrive only as a profile URL, so the handle has to come out of the path.
function handleFromXUrl(value) {
  const url = sanitizeUrl(value);
  if (!url) return null;
  try {
    return sanitizeXHandle(new URL(url).pathname.split("/").filter(Boolean)[0]);
  } catch {
    return null;
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringArray(value, maxItems = 30) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => sanitizeExternalText(typeof item === "object" ? item?.name || item?.slug || item?.title : item, 80))
    .filter(Boolean);
}

function nested(object, ...paths) {
  for (const path of paths) {
    let value = object;
    for (const key of path) value = value?.[key];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function listFrom(raw) {
  if (Array.isArray(raw)) return raw;
  for (const value of [
    raw?.data,
    raw?.items,
    raw?.chart,
    raw?.data?.chart,
    raw?.results,
    raw?.projects,
    raw?.events,
    raw?.feed,
    raw?.data?.items,
    raw?.data?.results,
    raw?.data?.projects,
    raw?.data?.events,
    raw?.data?.feed,
  ]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function normalizeAccount(raw, requestedHandle) {
  return {
    id: sanitizeExternalText(pick(raw, ["id", "account_id", "accountId", "observed_id", "observedId", "userId"]), 80),
    username: sanitizeXHandle(pick(raw, ["username", "screen_name", "screenName"])) || requestedHandle,
    name: sanitizeExternalText(pick(raw, ["name", "display_name", "displayName"]), 120),
    description: sanitizeExternalText(pick(raw, ["description", "bio"]), 500),
    followersCount: numberOrNull(pick(raw, ["followers_count", "followersCount"])),
    tweetsCount: numberOrNull(pick(raw, ["tweets_count", "tweetsCount", "statuses_count", "statusesCount"])),
    mentionsCount: numberOrNull(pick(raw, ["mentions_count", "mentionsCount", "total_mentions", "totalMentions"])),
    smartMentionsCount: numberOrNull(
      pick(raw, ["smart_mentions_count", "smartMentionsCount", "total_smart_mentions", "totalSmartMentions"])
    ),
    smartsCount: numberOrNull(pick(raw, ["smarts_count", "smartsCount", "smart_followers_count", "smartFollowersCount"])),
    moniScore: numberOrNull(pick(raw, ["moni_score", "moniScore"])),
    smartTier: numberOrNull(pick(raw, ["smart_tier", "smartTier", "tier", "level"])),
    tags: stringArray([...stringArray(pick(raw, ["tags", "categories", "smart_tags", "smartTags"])), ...stringArray(pick(raw, ["projectTags", "project_tags"]))]),
    chains: stringArray(pick(raw, ["chains", "blockchains", "project_chains", "projectChains"])),
    // How long the handle has existed. A token pointing at a days-old account is a
    // different claim from one pointing at an account with years of history.
    accountAgeDays: numberOrNull(pick(raw, ["accountAgeDays", "account_age_days"])),
  };
}

export function normalizeHistory(raw) {
  return listFrom(raw)
    .slice(0, 400)
    .map((item) =>
      // v3 returns a chart as [epochSeconds, count] pairs rather than objects.
      Array.isArray(item)
        ? { at: timestampOrNull(item[0]), count: numberOrNull(item[1]) }
        : {
            at: timestampOrNull(item?.date ?? item?.datetime ?? item?.timestamp ?? item?.created_at ?? item?.createdAt),
            count: numberOrNull(item?.count ?? item?.value ?? item?.mentions_count ?? item?.smart_mentions_count),
          }
    )
    .filter((item) => item.at !== null || item.count !== null);
}

export function normalizeSmartMentions(raw) {
  return listFrom(raw)
    .slice(0, 100)
    .map((item) => ({
      id: sanitizeExternalText(item?.id ?? item?.tweet_id ?? item?.tweetId ?? item?.data?.postId, 100),
      createdAt: timestampOrNull(item?.created_at ?? item?.createdAt ?? item?.date),
      // v3 feed items carry no post text, only a link. Null means "not provided",
      // not "empty tweet": follow the url to read what was actually said.
      text: sanitizeExternalText(item?.text ?? item?.content ?? item?.tweet?.text, 800),
      url: sanitizeUrl(item?.url ?? item?.tweet_url ?? item?.tweetUrl ?? item?.data?.postUrl),
      author: {
        username:
          sanitizeXHandle(item?.author?.username ?? item?.user?.username ?? item?.username) ??
          handleFromXUrl(item?.data?.mentionBy?.userUrl),
        name: sanitizeExternalText(item?.author?.name ?? item?.user?.name, 120),
        moniScore: numberOrNull(item?.author?.moni_score ?? item?.author?.moniScore ?? item?.moni_score),
        smartTier: numberOrNull(item?.author?.smart_tier ?? item?.author?.smartTier ?? item?.tier),
      },
      engagement: {
        likes: numberOrNull(item?.likes_count ?? item?.likesCount ?? item?.like_count),
        reposts: numberOrNull(item?.retweets_count ?? item?.retweetsCount ?? item?.reposts_count),
        replies: numberOrNull(item?.replies_count ?? item?.repliesCount ?? item?.reply_count),
      },
    }));
}

export function normalizeEvents(raw) {
  return listFrom(raw)
    .slice(0, 100)
    .map((item) => ({
      id: sanitizeExternalText(item?.id, 100),
      type: sanitizeExternalText(item?.type ?? item?.event_type ?? item?.eventType, 80),
      occurredAt: timestampOrNull(item?.date ?? item?.created_at ?? item?.createdAt ?? item?.timestamp),
      title: sanitizeExternalText(item?.title ?? item?.name, 200),
      summary: sanitizeExternalText(item?.summary ?? item?.description ?? item?.text, 800),
      url: sanitizeUrl(item?.url),
    }));
}

export function normalizeProjects(raw) {
  return listFrom(raw)
    .slice(0, 100)
    .map((item) => ({
      id: sanitizeExternalText(item?.id ?? item?.observed_id ?? item?.observedId, 100),
      username: sanitizeXHandle(nested(item, ["username"], ["account", "username"], ["profile", "username"])),
      name: sanitizeExternalText(nested(item, ["name"], ["account", "name"], ["profile", "name"]), 160),
      description: sanitizeExternalText(item?.description ?? item?.bio, 500),
      url: sanitizeUrl(item?.url ?? item?.website),
      contractAddress: sanitizeExternalText(item?.contract_address ?? item?.contractAddress, 100),
      tags: stringArray(item?.tags ?? item?.categories),
      chains: stringArray(item?.chains ?? item?.project_chains ?? item?.projectChains),
      followersCount: numberOrNull(item?.followers_count ?? item?.followersCount),
      smartFollowersCount: numberOrNull(item?.smart_followers_count ?? item?.smartFollowersCount ?? item?.smarts_count),
      smartMentionsCount: numberOrNull(item?.smart_mentions_count ?? item?.smartMentionsCount),
      moniScore: numberOrNull(item?.moni_score ?? item?.moniScore),
      createdAt: sanitizeExternalText(item?.created_at ?? item?.createdAt, 80),
    }));
}

export function normalizeGlobalSmartMentions(raw) {
  return listFrom(raw)
    .slice(0, 100)
    .map((item) => ({
      id: sanitizeExternalText(item?.id ?? item?.tweet_id ?? item?.tweetId, 100),
      createdAt: sanitizeExternalText(item?.created_at ?? item?.createdAt ?? item?.date, 80),
      text: sanitizeExternalText(item?.text ?? item?.content ?? item?.tweet?.text, 800),
      url: sanitizeUrl(item?.url ?? item?.tweet_url ?? item?.tweetUrl),
      mentionedAccount: {
        username: sanitizeXHandle(
          nested(item, ["mentioned", "username"], ["following", "username"], ["profile", "username"])
        ),
        name: sanitizeExternalText(nested(item, ["mentioned", "name"], ["following", "name"], ["profile", "name"]), 120),
        chains: stringArray(nested(item, ["mentioned", "chains"], ["following", "chains"], ["profile", "chains"])),
        followersCount: numberOrNull(
          nested(item, ["mentioned", "followers_count"], ["following", "followers_count"], ["profile", "followers_count"])
        ),
        smartFollowersCount: numberOrNull(
          nested(
            item,
            ["mentioned", "smart_followers_count"],
            ["following", "smart_followers_count"],
            ["profile", "smart_followers_count"]
          )
        ),
      },
      smartAuthor: {
        username: sanitizeXHandle(nested(item, ["author", "username"], ["follower", "username"], ["user", "username"])),
        name: sanitizeExternalText(nested(item, ["author", "name"], ["follower", "name"], ["user", "name"]), 120),
        topTags: stringArray(nested(item, ["author", "top_tags"], ["follower", "top_tags"])),
        moniScore: numberOrNull(nested(item, ["author", "moni_score"], ["follower", "moni_score"])),
      },
    }));
}

export function responseShape(raw) {
  if (Array.isArray(raw)) return { type: "array", itemCount: raw.length };
  if (!raw || typeof raw !== "object") return { type: typeof raw, topLevelKeys: [] };
  return { type: "object", topLevelKeys: Object.keys(raw).slice(0, 30) };
}
