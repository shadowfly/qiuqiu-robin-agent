const SOURCE_SCAN_LIMITS = { files: 12, bytes: 400000, matchesPerCheck: 3 };

const RISK_CHECKS = [
  [
    "mint",
    /function\s+(?!_)\w*[Mm]int\w*\s*\([^)]*\)\s*(?:external|public)/,
    "A mint entrypoint callable from outside the contract. The internal _mint() that every fixed-supply token runs once in its constructor does not match this, and is not a supply risk.",
  ],
  [
    "owner_admin",
    /\bonlyOwner\b|\bOwnable2?(?:Step)?\b|\bAccessControl\b|DEFAULT_ADMIN_ROLE|\bonlyRole\s*\(/,
    "A privileged role exists. Check what it can actually do, and whether ownership was renounced.",
  ],
  ["blacklist", /blacklist|blocklist|denylist|isBlacklisted|_?isBlocked\b/i, "An address-level transfer block, which can be used to freeze sellers."],
  ["pause", /\bPausable\b|function\s+_?(?:un)?pause\w*\s*\(|whenNotPaused/, "Transfers can be halted."],
  [
    "tax_fee",
    /buyTax|sellTax|transferTax|marketingFee|feeBps|\bsetTax\w*\s*\(|\bsetFee\w*\s*\(/i,
    "A transfer tax or an adjustable fee. Check whether the rate has a hard cap.",
  ],
  [
    "sell_limit",
    /maxTx\w*|maxWallet\w*|cooldown|antiBot|restrictionBlocks|restrictionsEndBlock|maxSell|sellLimit|tradingEnabled/i,
    "A trading restriction. Pons V1 tokens carry a launch-window limit that expires at a fixed block: read launchpad.pons.restrictionWindow before calling this a honeypot.",
  ],
  [
    "arbitrary_call",
    /\bdelegatecall\b|\.call\s*\{|function\s+execute\w*\s*\(/,
    "The contract can make calls chosen at runtime, which widens the blast radius of any admin role.",
  ],
];

const baseName = (path = "") => String(path).split("/").pop() || String(path);

export function stripSolidityComments(source = "") {
  return String(source || "")
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length));
}

export function resolveScanScope(contractData) {
  const main = String(contractData?.source_code || "");
  const additional = Array.isArray(contractData?.additional_sources) ? contractData.additional_sources : [];
  const additionalBytes = additional.reduce((number, file) => number + String(file?.source_code || "").length, 0);
  const empty = {
    files: [],
    inherits: [],
    unresolvedBases: [],
    additionalSourcesCount: additional.length,
    additionalSourcesBytes: additionalBytes,
    scannedBytes: 0,
  };
  if (!main) return empty;

  const byContractName = new Map();
  for (const file of additional) {
    const name = baseName(file?.file_path || "").replace(/\.sol$/i, "");
    if (name && !byContractName.has(name)) byContractName.set(name, file);
  }

  const files = [{ path: baseName(contractData?.file_path || "") || "(main)", code: main }];
  const inherits = [];
  const unresolved = [];
  const seen = new Set();
  let bytes = main.length;
  let frontier = [main];

  for (let depth = 0; depth < 3 && frontier.length; depth += 1) {
    const next = [];
    for (const code of frontier) {
      for (const match of code.matchAll(/\b(?:abstract\s+)?contract\s+\w+\s+is\s+([^{;]+)\{/g)) {
        for (const raw of match[1].split(",")) {
          const base = raw.trim().split(/[\s(]/)[0];
          if (!base || seen.has(base)) continue;
          seen.add(base);
          inherits.push(base);
          const file = byContractName.get(base);
          if (!file) {
            unresolved.push(base);
            continue;
          }
          const source = String(file.source_code || "");
          if (files.length >= SOURCE_SCAN_LIMITS.files || bytes + source.length > SOURCE_SCAN_LIMITS.bytes) {
            unresolved.push(base);
            continue;
          }
          files.push({ path: baseName(file.file_path || base), code: source });
          bytes += source.length;
          next.push(source);
        }
      }
    }
    frontier = next;
  }

  return {
    files,
    inherits,
    unresolvedBases: unresolved,
    additionalSourcesCount: additional.length,
    additionalSourcesBytes: additionalBytes,
    scannedBytes: bytes,
  };
}

export function keywordHits(scope, sanitizeText, checks = RISK_CHECKS) {
  const files = (scope?.files || []).map((file) => ({ path: file.path, code: stripSolidityComments(file.code) }));
  if (!files.length) {
    return Object.fromEntries(checks.map(([name, , why]) => [name, { status: "unknown", matches: [], why }]));
  }
  const output = {};
  for (const [name, pattern, why] of checks) {
    const present = files.some((file) => pattern.test(file.code));
    const matches = [];
    let more = false;
    outer: for (const file of files) {
      const lines = file.code.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        if (!pattern.test(lines[index])) continue;
        if (matches.length >= SOURCE_SCAN_LIMITS.matchesPerCheck) {
          more = true;
          break outer;
        }
        matches.push({
          file: file.path,
          line: index + 1,
          code: sanitizeText(lines[index].trim(), "keywordHits." + name, 160),
        });
      }
    }
    output[name] = {
      status: present ? "present" : "absent",
      matches,
      moreMatches: more,
      contextAvailable: !present || matches.length > 0,
      why,
    };
  }
  return output;
}

// A Uniswap v4 hook runs inside every swap on its pool, so it can refuse a trade,
// re-price it, or skim value out of it. That is a different question from whether the
// LP is locked: a perfectly locked position on a pool with a hostile hook is still a
// honeypot, which is why this is scanned and reported separately from the token.
const check = (name) => RISK_CHECKS.find((entry) => entry[0] === name);

const HOOK_RISK_CHECKS = [
  [
    "swap_entrypoint",
    /function\s+_?(?:before|after)Swap\s*\(/,
    "The hook executes on every swap in this pool. Presence is normal for a launchpad hook and is not itself a finding: it is the reason the checks below matter.",
  ],
  [
    "swap_block",
    // Deliberately narrow. Every hook is full of unrelated reverts -- NotFactory,
    // UnknownPool, OwnershipCannotBeRenounced -- and matching bare `revert` turns this
    // check into noise that gets repeated as "the hook can block sells". Only gates that
    // name trading itself count.
    /\b(?:tradingEnabled|tradingOpen|swapEnabled|swapsEnabled|swappingEnabled|tradingActive|isTradingOpen)\b|revert\s+\w*(?:Swap|Trad|Transfer)\w*(?:Disabled|Blocked|NotAllowed|NotOpen|Paused|Closed|Forbidden|Restricted)\w*|\b(?:whitelist|allowlist)\b/i,
    "The hook can refuse a swap under some condition. Read the condition before judging it: a launch-window guard that expires at a fixed block is normal, an owner-controlled switch is not. This check only matches gates that name trading, so absent means no such gate was found -- it does not mean the hook has no reverts at all.",
  ],
  [
    "swap_value_skim",
    /beforeSwapReturnDelta|afterSwapReturnDelta|LPFeeLibrary|OVERRIDE_FEE|DYNAMIC_FEE|setLPFee|lpFeeOverride/i,
    "The hook can change the fee per swap or take a delta out of the swap amount. This is how a v4 pool charges a tax without the token contract having one.",
  ],
  check("owner_admin"),
  check("blacklist"),
  check("pause"),
  check("tax_fee"),
  check("sell_limit"),
  check("arbitrary_call"),
].filter(Boolean);

export function buildHookRisk(hookAddress, contractData, sanitizeText) {
  if (!hookAddress) {
    return {
      address: null,
      scanStatus: "no_hook",
      note: "No hook was recorded for this pool. A Uniswap v3 pool has no hooks, and a v4 pool may use the zero address.",
    };
  }
  const source = contractData?.source_code || "";
  const scope = resolveScanScope(contractData);
  return {
    address: hookAddress,
    name: sanitizeText(contractData?.name, "hookRisk.name", 80),
    isVerified: contractData ? Boolean(contractData.is_verified) : null,
    sourceAvailable: Boolean(source),
    scanStatus: source ? "scanned" : "unknown_no_source",
    scanScope: { scannedFiles: scope.files.map((file) => file.path), scannedBytes: scope.scannedBytes, unresolvedBases: scope.unresolvedBases },
    keywordHits: keywordHits(scope, sanitizeText, HOOK_RISK_CHECKS),
    note:
      "The hook sits in the swap path of the pool people trade against, so it can block or tax a sell even when the token contract is clean and the LP is permanently locked. scanStatus=unknown_no_source means the hook is unverified and nothing here was checked: that is a red flag on its own, not a clean result. A launchpad ships one shared hook for every token it launches, so a finding here is usually a property of the launchpad rather than of this token -- say which one you mean.",
  };
}

export function buildContractRisk(contractData, sanitizeText) {
  const source = contractData?.source_code || "";
  const scope = resolveScanScope(contractData);
  return {
    sourceAvailable: Boolean(source),
    scanStatus: source ? "scanned" : "unknown_no_source",
    scanScope: {
      scannedFiles: scope.files.map((file) => file.path),
      scannedBytes: scope.scannedBytes,
      inherits: scope.inherits,
      unresolvedBases: scope.unresolvedBases,
      additionalSourcesCount: scope.additionalSourcesCount,
      additionalSourcesBytes: scope.additionalSourcesBytes,
      note:
        "The scan covers the token contract plus the base contracts it declares, resolved from additional_sources. It deliberately does not cover the rest of the verification bundle: a launchpad ships its factory, curve and hook sources alongside the token, and scanning those would report the launchpad's admin controls as if they were the token's. Anything in unresolvedBases was inherited but not found or not scanned, so a control living there would be missed.",
    },
    keywordHits: keywordHits(scope, sanitizeText),
    flagLegend:
      "status: present = pattern matched | absent = scanned, no match | unknown = source never retrieved. matches carry file and line for spot-checking; moreMatches means the list was capped. contextAvailable=false means the pattern matched across line breaks, so no single line is quoted.",
    note:
      "Heuristic keyword scan, not an audit. 'unknown' means the check did not run: never report it as 'no backdoor found'. A 'present' is a pointer to read, not a verdict -- read the quoted line and the surrounding function before making a safety claim, and check launchpad.pons.restrictionWindow before treating a sell_limit hit as active.",
  };
}
