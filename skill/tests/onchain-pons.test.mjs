import test from "node:test";
import assert from "node:assert/strict";
import { createPonsAnalyzer } from "../scripts/lib/onchain/pons.mjs";
import { createSanitizer } from "../scripts/lib/onchain/sanitize.mjs";

const CA = "0x1111111111111111111111111111111111111111";
const DEPLOYER = "0x2222222222222222222222222222222222222222";
const FACTORY = "0x3333333333333333333333333333333333333333";
const POOL = "0x4444444444444444444444444444444444444444";
const POSITION_MANAGER = "0x5555555555555555555555555555555555555555";
const LOCKER = "0x6666666666666666666666666666666666666666";

const event = (name, parameters) => ({
  decoded: {
    method_call: name + "()",
    parameters: Object.entries(parameters).map(([parameterName, value]) => ({ name: parameterName, value })),
  },
});

test("Pons analyzer proves a token-specific direct LP lock", async () => {
  const launchLogs = [
    event("TokenLaunched", {
      token: CA,
      positionId: "7",
      positionManager: POSITION_MANAGER,
      pool: POOL,
      restrictionsEndBlock: "100",
    }),
    event("PositionLocked", { token: CA, positionId: "7", positionManager: POSITION_MANAGER, pool: POOL }),
  ];
  const blockscout = {
    transactionLogs: async () => ({ ok: true, data: { items: launchLogs } }),
    nftInstance: async () => ({ ok: true, data: { owner: { hash: LOCKER, name: "Pons Locker", is_verified: true } } }),
    contract: async () => ({
      ok: true,
      data: {
        name: "PermanentLocker",
        is_verified: true,
        source_code: "contract PermanentLocker { function collectFees() external {} }",
        decoded_constructor_args: [],
      },
    }),
    stats: async () => ({ ok: true, data: { total_blocks: 200 } }),
  };
  const sanitizer = createSanitizer();
  const analyzer = createPonsAnalyzer({ blockscout, sanitizeText: sanitizer.sanitizeText });
  const output = await analyzer.probe(
    CA,
    { decoded_constructor_args: [[DEPLOYER, { name: "deployer_" }]] },
    { creator_address_hash: FACTORY, creation_transaction_hash: "0xlaunch" },
    { pairAddress: POOL, dexId: "uniswap", labels: ["v3"] }
  );

  assert.equal(output.launchModel, "direct_lp");
  assert.equal(output.restrictionWindow.expired, true);
  assert.equal(output.lpLockVerification.poolMatch, "main_pool_lock_verified");
  assert.equal(output.lpLockVerification.claimAllowed, true);
  assert.deepEqual(output.lockerRisk.exitSurfaces, []);
});

const CURVE = "0x7777777777777777777777777777777777777777";
const QUOTE = "0x8888888888888888888888888888888888888888";
const HOOKS = "0x9999999999999999999999999999999999999999";
const POOL_ID = "0xdba909ac1600a59685928cf317fb953d518d405b4748371889e3cb2932adf4c2";
const POOL_TX = "0xpool";

// The curve only sweeps its proceeds here: no pool, no position, no lock. A probe
// that reads this transaction alone concludes the LP is unverified.
const curveCompletedLogs = [event("CurveCompleted", { recipient: LOCKER, quoteOut: "10", tokenOut: "20" })];

// salt is the position id in hex: 0x89dbc == 564668.
const poolLogs = [
  event("TokenSupplyLocked", { token: CA, amount: "816" }),
  event("GraduationTokensPermanentlyLocked", { token: CA, amount: "816" }),
  event("Initialize", { id: POOL_ID, currency0: QUOTE, currency1: CA, hooks: HOOKS }),
  event("PoolRegistered", { poolId: POOL_ID, memecoin: CA, quoteToken: QUOTE }),
  event("PoolGraduated", { token: CA, positionId: "564668" }),
  event("PositionLocked", { token: CA, tokenId: "564668" }),
  event("ModifyLiquidity", { id: POOL_ID, sender: POSITION_MANAGER, salt: "0x89dbc" }),
];

const curveLaunchLogs = [event("TokenLaunched", { token: CA, curve: CURVE, pairToken: QUOTE })];

function graduationBlockscout({ topicRows, addressLogs }) {
  return {
    logsByTopic: async () => ({ ok: true, data: { status: topicRows.length ? "1" : "0", result: topicRows } }),
    transactionLogs: async (hash) => ({
      ok: true,
      data: { items: hash === POOL_TX || hash === "0xatomic" ? poolLogs : curveLaunchLogs },
    }),
    addressLogs,
    nftInstance: async () => ({
      ok: true,
      data: { owner: { hash: LOCKER, name: "V2LaunchLocker", is_verified: true } },
    }),
    contract: async () => ({
      ok: true,
      data: {
        name: "V2LaunchLocker",
        is_verified: true,
        source_code: "contract V2LaunchLocker { /* permanent custody */ }",
        decoded_constructor_args: [],
      },
    }),
    stats: async () => ({ ok: true, data: { total_blocks: 200 } }),
  };
}

const runGraduation = (blockscout) => {
  const sanitizer = createSanitizer();
  return createPonsAnalyzer({ blockscout, sanitizeText: sanitizer.sanitizeText }).probe(
    CA,
    { decoded_constructor_args: [[DEPLOYER, { name: "deployer_" }]] },
    { creator_address_hash: FACTORY, creation_transaction_hash: "0xlaunch" },
    { pairAddress: POOL_ID, dexId: "uniswap", labels: ["v4"] }
  );
};

test("Pons analyzer follows a V2 graduation into its separate pool transaction", async () => {
  const output = await runGraduation(
    graduationBlockscout({
      topicRows: [{ transactionHash: POOL_TX }],
      addressLogs: async () => {
        throw new Error("the curve scan must not run once the topic lookup has answered");
      },
    })
  );

  assert.equal(output.launchModel, "bonding_curve");
  assert.equal(output.graduation.status, "graduated");
  assert.equal(output.graduation.poolEvidenceFrom, "pool_graduated_event");
  assert.equal(output.graduation.graduationTx, POOL_TX);
  assert.equal(output.graduation.poolId, POOL_ID);
  assert.equal(output.graduation.positionId, "564668");
  assert.equal(output.graduation.positionManager, POSITION_MANAGER);
  assert.equal(output.graduation.hooks, HOOKS);
  assert.equal(output.graduation.permanentlyLockedAmount, "816");
  assert.equal(output.lpLockVerification.poolMatch, "main_pool_lock_verified");
  assert.equal(output.lpLockVerification.claimAllowed, true);
});

test("Pons analyzer still reads an atomic graduation from the CurveCompleted tx", async () => {
  const output = await runGraduation(
    graduationBlockscout({
      topicRows: [],
      addressLogs: async () => ({
        ok: true,
        data: { items: [{ ...curveCompletedLogs[0], transaction_hash: "0xatomic" }] },
      }),
    })
  );

  assert.equal(output.graduation.poolEvidenceFrom, "curve_completed_tx");
  assert.equal(output.graduation.graduationTx, "0xatomic");
  assert.equal(output.lpLockVerification.poolMatch, "main_pool_lock_verified");
  assert.equal(output.lpLockVerification.claimAllowed, true);
});

test("Pons analyzer reports a token still on the curve rather than guessing a lock", async () => {
  const output = await runGraduation(
    graduationBlockscout({ topicRows: [], addressLogs: async () => ({ ok: true, data: { items: [] } }) })
  );

  assert.equal(output.graduation.status, "not_graduated");
  // DexScreener lists a pool the launchpad never opened, so nothing about it is locked.
  assert.equal(output.lpLockVerification.poolMatch, "dex_pool_not_from_launchpad");
  assert.equal(output.lpLockVerification.claimAllowed, false);
});
