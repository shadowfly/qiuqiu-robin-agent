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
        +-- contract-risk.mjs     verified-source scan
        +-- pons.mjs              launch, graduation and LP evidence
        +-- holders.mjs           role-aware concentration and balances
        +-- narrative.mjs         safe research-query generation
        +-- sanitize.mjs          per-probe untrusted-input boundary
        +-- evm.mjs               address and decoded-event helpers
```

Transport modules know URLs and HTTP behavior but make no safety claims. Domain modules interpret already-fetched data and do not know CLI arguments. `probe.mjs` is the only composition root and preserves source completeness independently for every provider.

## Extension Rules

- Add a new explorer or RPC behind a provider interface; do not call `fetch` from domain modules.
- Inject providers into `createRobinhoodCaProbe` for tests and alternative deployments.
- Preserve tri-state results: checked/present, checked/absent, and unknown/not retrieved.
- Keep attacker-controlled names, URLs, symbols and metadata inside the per-probe sanitizer boundary.
- Do not let a fallback provider silently replace provenance. Add a source status and label the provider used.
- Changes to the public JSON shape require coordinated updates to `SKILL.md`, all READMEs, fixtures, and Research Bundle consumers.

## Verification

Use `node --test skill/tests/onchain-*.test.mjs` for focused domain and orchestration regression tests. Tests cover anomalous Dex pools, inherited Solidity source, Pons token-specific LP locks, holder roles, source failure, and sanitizer isolation. Follow with the full test suite and a live CA smoke test when network access is available.
