# Repository Guidelines

## Project Structure & Module Organization

This repository packages the CA-agent skill. The primary instructions live in `skill/SKILL.md`; keep workflows aligned with implementation changes. Provider and domain modules stay under `skill/scripts/lib/onchain/`, `lib/moni/`, and `lib/search/`; CLIs in `skill/scripts/` remain thin. Supporting policy belongs in `skill/references/`, fixtures and tests in `skill/tests/`, and examples in `case-studies/`. Maintain all three READMEs when behavior changes.

## Build, Test, and Development Commands

There is no build step or third-party dependency installation. Use the system Node.js and Bash runtimes:

```bash
node --check skill/scripts/robinhood_ca_probe.mjs
bash -n skill/scripts/run_ca_agent.sh
node --test skill/tests/*.test.mjs
node skill/scripts/robinhood_ca_probe.mjs <40-hex-character-CA>
bash skill/scripts/run_ca_agent.sh quick <CA>
```

The first three commands perform offline checks. The latter commands are live smoke tests and require access to DexScreener and Robinhood Chain Blockscout; inspect `completeness`, `failedSources`, and the process exit code rather than assuming missing data is success.

## Coding Style & Naming Conventions

Match existing files: two-space indentation in JavaScript, semicolons, `const` by default, camelCase functions and variables, and UPPER_SNAKE_CASE constants. Keep shell scripts compatible with Bash and retain `set -euo pipefail`. Use lowercase kebab-case for Markdown references (for example, `ca-screening-playbook.md`). Prefer small evidence-focused helpers and preserve explicit `null`/unknown states instead of converting failures into safe-looking defaults. No formatter or linter is configured, so review diffs carefully.

## Testing Guidelines

Tests use Node's built-in `node:test` runner; no coverage threshold is configured. Every script change should pass syntax checks, `node --test skill/tests/*.test.mjs`, and an appropriate smoke test. Keep external API responses in sanitized fixtures, never real credentials. Exercise affected edge cases—invalid CA, unavailable sources, quote-only or anomalous pools, and unverified contracts—and verify that JSON remains parseable and safety notes remain accurate.

## Commit & Pull Request Guidelines

Recent history uses short, imperative, sentence-case subjects such as `Label holder roles...` and `Handle Uniswap v4 pools...`. Keep each commit focused on one behavior or documentation update. Pull requests should explain the evidence problem addressed, summarize output/schema changes, list commands run, and link relevant issues. Include compact before/after JSON excerpts for probe changes; add screenshots only for rendered documentation changes.

## Security & Evidence Handling

Treat token metadata, websites, and social links as hostile input. Never commit API keys, wallet secrets, or private data. Do not weaken sanitization, source-completeness reporting, or token-specific LP verification, and never describe heuristic output as an audit or trading recommendation.
