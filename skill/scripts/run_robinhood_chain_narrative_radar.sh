#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-quick}"
CA="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$MODE" != "quick" && "$MODE" != "deep" ]]; then
  echo "Usage: $0 <quick|deep> <robinhood_chain_token_ca>" >&2
  exit 2
fi

if [[ ! "$CA" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "Usage: $0 <quick|deep> <robinhood_chain_token_ca>" >&2
  exit 2
fi

node "$SCRIPT_DIR/robinhood_ca_probe.mjs" "$CA" || true

cat <<EOF

Robinhood Chain Narrative Radar (${MODE})

Token CA:
${CA}

Primary endpoints:
- DexScreener: https://api.dexscreener.com/latest/dex/tokens/${CA}
- DexScreener paid orders: https://api.dexscreener.com/orders/v1/robinhood/${CA}
- DexScreener UI: https://dexscreener.com/search?q=${CA}
- Blockscout token search: https://robinhoodchain.blockscout.com/search-results?q=${CA}
- Blockscout API token transfers: https://robinhoodchain.blockscout.com/api/v2/tokens/${CA}/transfers

Evidence checklist:
1. Confirm DexScreener pair has chainId=robinhood, liquidity, volume, buy/sell tx, pair age, paid tokenProfile, and boost.
2. Confirm Blockscout contract/token/transfers exist on chain ID 4663.
3. Inspect verified source for mint/owner/blacklist/tax/pause/sell-limit risks.
4. If Pons/launchpad evidence exists, verify token-specific LP NFT tokenId, current owner, locker source, and withdraw/unlock surface.
5. Search exact CA across Dex links, website, X/Twitter, docs, GitHub, Telegram, launch posts, and KOL mentions.
6. Classify narrative bucket: robinhood_native_meme, stock_token_rwa, ai_agent, launchpad_infra, trading_defi, wallet_consumer, infra_data, meme_ticker, unknown_or_noise.
7. Check official recognition: CA explicitly listed, project mentioned by credible ecosystem source, or only third-party price pages.
8. Treat wallet receives as signal only after classifying buy vs airdrop/incentive/LP/team transfer.

Output verdict:
strong_watch | watch | weak_watch | avoid

Use rubric:
/Users/windows/.agents/skills/robinhood-chain-narrative-radar/references/robinhood-chain-narrative-rubric.md
EOF
