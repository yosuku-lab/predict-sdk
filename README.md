<div align="center">

# @yosuku/deepbook-predict

### The first TypeScript SDK for [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/) — Sui's volatility-surface-priced prediction market.

[![npm](https://img.shields.io/npm/v/@yosuku/deepbook-predict?color=cb3837&logo=npm)](https://www.npmjs.com/package/@yosuku/deepbook-predict)
[![types](https://img.shields.io/badge/types-included-3178c6?logo=typescript&logoColor=white)](https://www.npmjs.com/package/@yosuku/deepbook-predict)
[![Sui](https://img.shields.io/badge/Sui-testnet-4DA2FF)](https://sui.io)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)

**Price any strike. Open a position. Crank gas-negative redeems.** In a handful of lines —
with pricing math cross-checked against the chain's own `get_trade_amounts`.

[**npm**](https://www.npmjs.com/package/@yosuku/deepbook-predict) · [**Repo**](https://github.com/yosuku-lab/predict-sdk) · [**DeepBook Predict docs**](https://docs.sui.io/onchain-finance/deepbook-predict/)

<sub>_Formerly published as `@yosuku/predict` — same SDK, clearer name._</sub>

</div>

---

## Why this exists

DeepBook Predict prices **every** strike and expiry off a live SVI volatility surface — there's no "odds" endpoint to fetch. To trade it from TypeScript, you'd be reimplementing, by hand, from Move source:

- the SVI surface decode + the Black-Scholes digital `N(d2)`,
- the Bernoulli round-trip spread,
- `market_key` / `range_key` construction, and
- the exact PTB argument order for every `mint` / `redeem` / `supply` call.

The official `@mysten/deepbook-v3` SDK ships **none** of it. `@yosuku/deepbook-predict` is that missing layer — and the pricing engine is **cross-checked against the contract's own `get_trade_amounts`**, so the number you show a user is the number the chain charges.

## Install

```bash
npm install @yosuku/deepbook-predict @mysten/sui
```

> **Peer dep:** requires `@mysten/sui` `^2.17.0` — the SDK builds PTBs and runs `devInspect` through it.
> **Zero config otherwise:** the verified testnet deployment (package, `Predict` object, registry, DUSDC type, clock, indexer) is baked in, so `new PredictClient()` just works.

## Before you start

DeepBook Predict is testnet-only and settles in **DUSDC** (*not* DEEP, *not* Spot's DBUSDC). Three one-time prerequisites for the examples below:

1. **Get DUSDC** from the [faucet](https://tally.so/r/Xx102L) → gives you a `Coin<DUSDC>` (`depositCoinId` is its object id).
2. **Create a `PredictManager`** once — it holds your positions. `createManager` mutates a tx; the id comes from the executed result:

```ts
import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();
predict.createManager(tx);          // mutates tx (returns void)
const res = await signAndExecute(tx);
const manager = res.objectChanges
  ?.find((c) => c.type === 'created' && c.objectType.includes('::predict_manager::PredictManager'))
  ?.objectId;                        // reuse this id forever
```

## Quote a market → open a position

```ts
import { PredictClient, usdToScaled, contracts } from '@yosuku/deepbook-predict';

const predict = new PredictClient();                          // testnet config baked in
const oracle  = (await predict.indexer.activeOracles())[0];   // a live BTC market

// 1 · price it — off-chain SVI / N(d2). No funds, no signing.
const q = await predict.quote(oracle.oracle_id, 63_000);
//   → { fair: 0.487 (≈ 48.7% / $0.487 a contract), upAsk, upBid, dnAsk, dnBid, roundTrip, forward }

// 2 · open UP in one self-contained PTB.
const tx = predict.openUp({
  manager,                          // your PredictManager id (from "Before you start")
  oracle: oracle.oracle_id,
  expiry: BigInt(oracle.expiry),    // expiry is unix-ms; BigInt() because the Move call takes a u64
  strike: usdToScaled(63_000),      // 1e9-scaled strike
  quantity: contracts(1),           // position size: 1 contract = $1 max payout
  depositCoinId,                    // object id of a Coin<DUSDC> you own
  depositAmount: 10_000_000n,       // collateral in µDUSDC (6 decimals → 10 DUSDC); only needs to cover the cost
  // isUp: false,                   // ← bet DOWN in the same one call
});

// sign + send with your wallet or keypair — done.
```

That's a real, executable PTB — the same shape that has minted live on testnet.

## What you get

| | |
|---|---|
| **`PredictClient`** | One object — a typed indexer, a pricing engine, and ready-to-sign PTB fragments. |
| **Pricing engine** | Live SVI surface → `N(d2)` digital → Bernoulli spread. The pure math is also importable on its own from `@yosuku/deepbook-predict/pricing`. **Matched to the chain to a fraction of a cent across the normal regime.** |
| **PTB builders** | `createManager`, `deposit`/`managerWithdraw`, `mint`/`redeem`/`redeemPermissionless`, `mintRange`, `supply`/`withdrawPlp`, plus inline `marketKey`/`rangeKey`. Arg order verified against the Move source. |
| **Typed indexer** | Oracles, prices, the SVI surface, positions, managers, vault summary — only the endpoints that actually return data, typed to match the server (numbers are typed as numbers). |

## Pricing you can trust

Don't take the price on faith. `quoteOnChain` reads the contract's authoritative cost via `devInspect` (read-only, no funds, no signing) — so you can cross-check the engine against the chain in a single call:

```ts
import { SuiGrpcClient } from '@mysten/sui/grpc';

const rpcUrl = 'https://fullnode.testnet.sui.io:443';
const client = new SuiGrpcClient({ network: 'testnet', baseUrl: rpcUrl });

const onchain = await predict.quoteOnChain(client, rpcUrl, {
  oracleId: oracle.oracle_id, expiry: BigInt(oracle.expiry),
  strike: usdToScaled(63_000), isUp: true, quantity: contracts(1),
});
//   → { mintCost, redeemPayout }   ← straight from predict::get_trade_amounts
```

> `client` (a `SuiGrpcClient`) only encodes the call; `rpcUrl` is the JSON-RPC fullnode that runs the read-only `devInspect`.

Across the **normal regime** (`0.01 < fair < 0.99`) the off-chain engine and the on-chain quote agree to **a fraction of a cent** (~0.03¢ across live BTC markets in testing — the residual is mostly spot drift between the two reads, not model error). At the deep-ITM/OTM wings the spread model is clamped so the book never crosses (`roundTrip ≥ 0`).

## Compose your own PTB

Need the steps à la carte? Every fragment takes *your* `Transaction`:

```ts
import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();
const [chip] = tx.splitCoins(tx.object(depositCoinId), [tx.pure.u64(10_000_000n)]);
predict.deposit(tx, manager, chip);
const key = predict.marketKeyUp(tx, oracle.oracle_id, BigInt(oracle.expiry), usdToScaled(63_000));
predict.mint(tx, { manager, oracle: oracle.oracle_id, key, quantity: contracts(1) });
```

## The gas-negative keeper crank

`redeemPermissionless` settles a fully-closed winner for **anyone** — and on full close it's **gas-negative** (the storage rebate exceeds the gas). A keeper that claims winners literally pays for itself:

```ts
for (const o of await predict.indexer.settledOracles()) {
  const tx = new Transaction();
  const key = predict.marketKeyUp(tx, o.oracle_id, BigInt(o.expiry), strike);
  predict.redeemPermissionless(tx, { manager, oracle: o.oracle_id, key, quantity });
  // sign + send — the crank funds itself.
}
```

## Scaling cheatsheet

The one rule to remember: **read APIs take human USD; on-chain calls take the contract's `1e9`-scaled `bigint`.** Helpers convert both ways.

| You have | You want | Use |
|---|---|---|
| `63000` (USD) | a strike for `openUp` / builders | `usdToScaled(63000)` |
| a `1e9`-scaled strike | USD | `scaledToUsd(s)` |
| `1` contract ($1 max payout) | size in base units | `contracts(1)` → `1_000_000n` |
| µDUSDC (e.g. `488934`) | DUSDC | `dusdc(488934)` → `0.488934` |

## API at a glance

**`PredictClient`**
- **read** — `indexer.*` · `quote(oracleId, strikeUsd)` · `quoteOnChain(client, rpcUrl, args)`
- **build** — `openUp(args)` · `createManager` · `deposit` · `managerWithdraw` · `mint` · `mintRange` · `redeem` · `redeemPermissionless` · `supply` · `withdrawPlp`
- **keys** — `marketKeyUp` · `marketKeyDown` · `rangeKey`

**Pricing primitives** — tree-shakable, also at `@yosuku/deepbook-predict/pricing`:

```ts
import { decodeSvi, digitalUp, quote, normalCdf } from '@yosuku/deepbook-predict/pricing';
```

**Scaling helpers** (main entry `@yosuku/deepbook-predict` only) — `usdToScaled` · `scaledToUsd` · `contracts` · `dusdc`.

## Good to know

- **Testnet only.** DeepBook Predict is testnet-only (pinned to branch `predict-testnet-4-16`). At mainnet, override the IDs: `new PredictClient({ pkg, predict, registry, ... })`.
- **Node and browser.** `quoteOnChain` is `Buffer`-free, so it runs in a web app or a keeper alike.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) — `0.1.0 → 0.1.8`, each release a focused correctness pass (the pricing engine hasn't needed a change since `0.1.0`).

## License

MIT © yosuku

<div align="center">

Built for [Sui Overflow](https://sui.io) · [github.com/yosuku-lab/predict-sdk](https://github.com/yosuku-lab/predict-sdk)

**予測**

</div>
