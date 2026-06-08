/** Verified DeepBook Predict deployment config (testnet, branch predict-testnet-4-16). */
export interface PredictConfig {
  /** Predict Move package id. */
  pkg: string;
  /** Shared `Predict` object. */
  predict: string;
  /** Shared `Registry` object. */
  registry: string;
  /** Quote/collateral coin type (DUSDC — NOT Spot's DBUSDC). */
  dusdc: string;
  /** PLP LP-share coin type. */
  plp: string;
  /** Public REST indexer base. */
  server: string;
  /** Clock object. */
  clock: string;
}

/** Verified live testnet config (June 2026). */
export const TESTNET: PredictConfig = {
  pkg: '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138',
  predict: '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
  registry: '0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64',
  dusdc: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
  plp: '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::plp::PLP',
  server: 'https://predict-server.testnet.mystenlabs.com',
  clock: '0x6',
};

/** DUSDC has 6 decimals; 1 contract = 1_000_000 base units = $1 max payout. */
export const DUSDC_DECIMALS = 6;
export const CONTRACT_UNIT = 1_000_000n;

/** Oracle/price scaling: strikes, prices, SVI params are all 1e9-scaled on-chain. */
export const FLOAT_SCALING = 1_000_000_000;

/** USD (e.g. a $63,000 strike) → the 1e9-scaled `bigint` the PTB builders expect. */
export const usdToScaled = (usd: number): bigint => BigInt(Math.round(usd * FLOAT_SCALING));

/** 1e9-scaled strike/price → human USD. Also normalizes the indexer's
 *  raw-number forwards/spots (it returns them unscaled in some fields). */
export const scaledToUsd = (scaled: bigint | number): number => Number(scaled) / FLOAT_SCALING;

/** Contracts → DUSDC base units (6-dec). 1 contract = $1 max payout = 1_000_000. */
export const contracts = (n: number): bigint => BigInt(Math.round(n * 1_000_000));

/** Micro-DUSDC base units (6-dec) → human DUSDC. e.g. dusdc("488934") === 0.488934.
 *  NOTE: `cost`/`payout` are micro-DUSDC (÷1e6); `ask_price` is 1e9-scaled (use scaledToUsd). */
export const dusdc = (microUnits: bigint | number | string): number => Number(microUnits) / 1_000_000;
