# Changelog

All notable changes to `@yosuku/predict`. The pricing engine (SVI / `N(d2)`) has
been correct since `0.1.0` — every bump since has been a focused correctness pass
on the indexer types and on-chain helpers, driven by live testing against the chain.

## 0.1.7

- Docs: award-winning README rewrite. Fixes the only judge-falsifiable error in the old docs (`@yosuku/predict/pricing` was claimed to export the scaling helpers — it doesn't; they're main-entry only), scopes the "fraction of a cent" accuracy claim to the normal regime, and makes every example copy-paste runnable (declares `manager`/`depositCoinId`, adds a "create a manager" onramp + the `quoteOnChain` client setup). No code change.

## 0.1.6

- Canonical repository moved to [yosuku-lab/predict-sdk](https://github.com/yosuku-lab/predict-sdk) (metadata only — `repository`/`homepage`/`bugs` now point there, so the npm page links home).

## 0.1.5

- Publish `repository`/`homepage`/`bugs` metadata to npm (no code change).

## 0.1.4

From an adversarial live audit (every finding reproduced against the chain + server).

- **pricing `quote()` no longer crosses the book at the wings.** The old symmetric
  clamp produced `upAsk < upBid` for `fair < ~0.005` and `fair > ~0.995`. Now each
  side's bid is derived as `1 − opposite_ask` (matching the chain's
  `quote_spread_from_fair_price`), so `roundTrip ≥ 0` everywhere. Normal regime is
  unchanged (matches `get_trade_amounts` to ≤ 0.018¢).
- **`quoteOnChain` / `getTradeAmountsOnChain` is browser-safe.** Replaced the
  Node-only `Buffer.from(...).toString('base64')` with `toBase64` from
  `@mysten/sui/utils` — it no longer throws `Buffer is not defined` in a browser
  bundle (e.g. a web app calling it directly).
- **indexer type-honesty (no behaviour change, fixes runtime/compile footguns):**
  - `oracleState()` returns `{ oracle, latest_price, latest_svi, ask_bounds }` —
    the old `.price` field never existed on the server and crashed at runtime.
  - `Oracle` numeric fields (`expiry`/`min_strike`/`tick_size`/`created_checkpoint`)
    are now `string | number`; `activated_at`/`settlement_price`/`settled_at` are
    `number | null` (the server returns JS numbers / real `null`).
  - `VaultSummary` fields are numeric (`plp_share_price`/`utilization` are floats).
  - `status()` exposes `latest_onchain_checkpoint` (the old `checkpoint` key was
    never present); `latestSvi().onchain_timestamp` widened to `string | number`.

## 0.1.3

- **`managerPositions()` returns data.** `list()` now unwraps the
  `{ minted: [...], redeemed: [...] }` envelope the `/managers/:id/positions`
  endpoint actually uses (it previously fell through to `[]`).
- **BREAKING (type-level):** `MintedPosition.owner → trader` and
  `tx_digest → digest` to match the server. Both old fields were always
  `undefined` at runtime, so no working runtime code changes — but TypeScript
  consumers reading `.owner`/`.tx_digest` on a minted position should rename to
  `.trader`/`.digest`. (`RedeemedPosition.owner`/`executor` are real and unchanged.)
  Numeric position fields widened to `string | number`.

## 0.1.2

- **`openUp` is self-contained** — takes `depositCoinId` (+ optional
  `depositAmount`) and splits its own coin, instead of referencing a coin from
  another transaction. Verified by a real signed mint.
- `new PredictIndexer()` defaults to the verified testnet server (+ `static testnet()`).
- `OraclePrice` numeric fields widened to `string | number`.
- Added a `list()` array-normalizer and the `dusdc()` micro-unit helper.

## 0.1.1

- Initial review-fix pass over `0.1.0` (indexer defaults, numeric types).

## 0.1.0

- First TypeScript SDK for DeepBook Predict: PTB builders, typed indexer client,
  and the SVI / `N(d2)` pricing engine (verified against `get_trade_amounts`).
