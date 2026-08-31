import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const DEFAULT_TTL_MS = 15 * 60 * 1000;

function cacheFilename(key) {
  return createHash("sha256").update(key).digest("hex") + ".json";
}

export function createMoniCache({
  directory = process.env.MONI_CACHE_DIR || resolve(tmpdir(), "qiuqiu-robin-agent-moni-cache"),
  ttlMs = Number(process.env.MONI_CACHE_TTL_MS) || DEFAULT_TTL_MS,
  enabled = process.env.MONI_CACHE !== "0",
  now = () => Date.now(),
} = {}) {
  async function get(key) {
    if (!enabled || ttlMs <= 0) return null;
    try {
      const record = JSON.parse(await readFile(resolve(directory, cacheFilename(key)), "utf8"));
      if (!Number.isFinite(record?.storedAt) || now() - record.storedAt > ttlMs) return null;
      return record;
    } catch {
      return null;
    }
  }

  async function set(key, value) {
    if (!enabled || ttlMs <= 0) return;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const target = resolve(directory, cacheFilename(key));
    const temporary = target + "." + process.pid + ".tmp";
    await writeFile(temporary, JSON.stringify({ storedAt: now(), ...value }), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }

  return { get, set, directory, ttlMs, enabled };
}
