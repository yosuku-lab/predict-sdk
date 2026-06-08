# @yosuku/predict

**The first TypeScript SDK for [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/)** — Sui's vol-surface-priced prediction-market protocol.

The official `@mysten/deepbook-v3` SDK has **zero** Predict support. This fills the gap: composable PTB builders, a typed indexer client, and an SVI/`N(d2)` pricing engine **verified against the on-chain quote to within a fraction of a cent** (≤ 0.5¢, often < 0.1¢) — and against a real signed mint.

```bash
npm install @yosuku/predict @mysten/sui
```

## Place a bet in 6 lines

```ts
import { PredictClient, usdToScaled, contracts } from '@yosuku/predict';

const predict = new PredictClient();                       // verified testnet config baked in
const oracle = (await predict.indexer.activeOracles())[0]; // a live BTC oracle
const q = await predict.quote(oracle.oracle_id, 63000);    // off-chain N(d2): { upAsk, upBid, fair }
```

**Bet UP — one self-contained tx** (`depositCoinId` is a `Coin<DUSDC>` you own):

```ts
const tx = predict.openUp({
  manager, oracle: oracle.oracle_id, expiry: BigInt(oracle.expiry),
  strike: usdToScaled(63000), quantity: contracts(1),
  depositCoinId, depositAmount: 10_000_000n,   // split 10 DUSDC out of your coin
});
// sign + execute tx with your wallet / keypair
```

**Or compose it inline** (this is exactly the PTB that executed on testnet):

```ts
import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();
const [chip] = tx.splitCoins(tx.object(depositCoinId), [tx.pure.u64(10_000_000n)]);
predict.deposit(tx, manager, chip);
const key = predict.marketKeyUp(tx, oracle.oracle_id, BigInt(oracle.expiry), usdToScaled(63000));
predict.mint(tx, { manager, oracle: oracle.oracle_id, key, quantity: contracts(1) });
// sign + execute
```

> **A note on scaling.** Read APIs (`quote`, surface viewers) take **human USD** (e.g. `63000`). On-chain calls (`openUp`, the builders) take the **1e9-scaled `bigint`** the contract uses — use `usdToScaled(63000)` for strikes and `contracts(1)` for size (1 contract = $1 max payout = `1_000_000` base units). `scaledToUsd()` goes back.

## What's in it

- **`PredictClient`** — PTB fragments for `create_manager`, `deposit`/`withdraw`, `mint`/`redeem`/`redeem_permissionless`, `mint_range`, `supply`/`withdraw` (PLP), and inline `market_key`/`range_key` builders. Verified arg order against the Move source.
- **Pricing engine** (`@yosuku/predict/pricing`) — decode the live SVI surface, compute the Black-Scholes digital `N(d2)`, the Bernoulli spread, and σ-annualized for surface viewers. Proven against `get_trade_amounts` and a live mint.
- **Typed indexer** — only the endpoints that actually return data (oracles, prices, SVI, positions, managers, vault summary); the known-null endpoints are omitted by design.
- **On-chain quote** — `quoteOnChain(...)` reads `get_trade_amounts` via devInspect (no funds) to cross-check the engine.

## The gas-negative keeper crank

```ts
for (const o of await predict.indexer.settledOracles()) {
  // diff minted − redeemed, then for each open winner:
  const tx = new Transaction();
  const key = predict.marketKeyUp(tx, o.oracle_id, BigInt(o.expiry), strike);
  predict.redeemPermissionless(tx, { manager, oracle: o.oracle_id, key, quantity });
  // redeem-on-full-close is gas-NEGATIVE — the crank funds itself.
}
```

## Notes

- Testnet only (Predict is testnet-only; pinned to branch `predict-testnet-4-16`). IDs change at mainnet — override via `new PredictClient({ pkg, predict, ... })`.
- Quote asset is **DUSDC** (not DEEP, not Spot's DBUSDC); faucet is a [Tally form](https://tally.so/r/Xx102L).
- MIT.
