# On-chain Architecture

The public contract remains `node scripts/robinhood_ca_probe.mjs <CA>`. The CLI is deliberately thin: validate the address, call the application service, print JSON, and map total source failure to exit code 1.

## Layers

```text
robinhood_ca_probe.mjs            CLI boundary
        |
lib/onchain/probe.mjs             application orchestration
        |
        +-- providers.mjs         DexScreener / Blockscout adapters
        +-- http-client.mjs       timeout, retry, transport errors
        +-- dexscreener.mjs       pair screening and aggregation
        +-- contract-risk.mjs     verified-source scan (token and v4 hook)
        +-- quote-token.mjs       identity of the asset the pool prices against
        +-- pons.mjs              launch, graduation and LP evidence
        +-- holders.mjs           role-aware concentration and balances
        +-- narrative.mjs         safe research-query generation
        +-- sanitize.mjs          per-probe untrusted-input boundary
        +-- evm.mjs               address and decoded-event helpers
        +-- time.mjs              timestamps that stay null instead of throwing
```

Transport modules know URLs and HTTP behavior but make no safety claims. Domain modules interpret already-fetched data and do not know CLI arguments. `probe.mjs` is the only composition root and preserves source completeness independently for every provider. It wraps the injected provider in a source ledger, so every follow-up read a verdict depends on is recorded under `secondarySources` and a failure there downgrades `completeness` to `partial`.

## Extension Rules

- Add a new explorer or RPC behind a provider interface; do not call `fetch` from domain modules.
- Inject providers into `createRobinhoodCaProbe` for tests and alternative deployments.
- Preserve tri-state results: checked/present, checked/absent, and unknown/not retrieved. A verdict must require a positive answer, never merely the absence of a negative one: when the input is unknown, the derived field is `null` and the reason is named in a `blockedBy`-style list.
- An `ok` response with the wrong shape is a failure, not an empty result. Guard every array the schema depends on and report `unknown_malformed_response` rather than reading it as zero.
- Keep attacker-controlled names, URLs, symbols and metadata inside the per-probe sanitizer boundary.
- Do not let a fallback provider silently replace provenance. Add a source status and label the provider used.
- Changes to the public JSON shape require coordinated updates to `SKILL.md`, all READMEs, fixtures, and Research Bundle consumers.

## Verification

Use `node --test skill/tests/onchain-*.test.mjs` for focused domain and orchestration regression tests. Tests cover anomalous Dex pools, inherited Solidity source and its depth limit, Pons token-specific LP locks, unread lockers, incomplete launch traces, poolId disagreement, holder roles and unknown percentages, source failure, malformed-but-ok responses, and sanitizer isolation. Follow with the full test suite and a live CA smoke test when network access is available.
