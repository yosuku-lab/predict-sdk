/**
 * SVI surface pricing — reconstructs DeepBook Predict's on-chain binary-option
 * price off-chain (Black-Scholes digital N(d2) from a raw SVI total-variance
 * surface). Verified to match the on-chain `get_trade_amounts` quote AND a live
 * mint (engine 48.7¢ vs on-chain 48.8¢).
 *
 *   w(k) = a + b·( ρ·(k−m) + sqrt((k−m)² + σ²) )      // SVI total variance
 *   d2   = ( ln(F/K) − w/2 ) / sqrt(w)
 *   priceUP = N(d2) = P(F_T > K)
 */

// On-chain pricing constants (constants.move, 1e9-scaled → floats).
export const BASE_SPREAD = 0.02;
export const MIN_SPREAD = 0.005;
export const MIN_ASK = 0.01;
export const MAX_ASK = 0.99;
export const UTIL_MULT = 2.0;
export const MS_PER_YEAR = 31_536_000_000;
const FLOAT = 1e9;

/** Raw SVI params as served by the predict indexer (sign-magnitude split). */
export interface RawSvi {
  a: number | string;
  b: number | string;
  rho: number | string;
  rho_negative: boolean;
  m: number | string;
  m_negative: boolean;
  sigma: number | string;
}

export interface Svi {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
}

/** Decode the indexer's 1e9-scaled, sign-magnitude SVI into floats. */
export function decodeSvi(r: RawSvi): Svi {
  const n = (x: number | string) => Number(x) / FLOAT;
  return {
    a: n(r.a),
    b: n(r.b),
    rho: (r.rho_negative ? -1 : 1) * n(r.rho),
    m: (r.m_negative ? -1 : 1) * n(r.m),
    sigma: n(r.sigma),
  };
}

/** SVI total variance at log-moneyness k = ln(strike/forward). */
export function totalVariance(svi: Svi, k: number): number {
  const { a, b, rho, m, sigma } = svi;
  return a + b * (rho * (k - m) + Math.sqrt((k - m) ** 2 + sigma ** 2));
}

/** Standard normal CDF — Abramowitz & Stegun 7.1.26 erf (max err ~1.5e-7). */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

/** Live (unsettled) digital UP price = P(F_T > strike). */
export function digitalUp(svi: Svi, forward: number, strike: number): number {
  const k = Math.log(strike / forward);
  const w = totalVariance(svi, k);
  if (w <= 0) return forward > strike ? 1 : 0;
  const d2 = (Math.log(forward / strike) - w / 2) / Math.sqrt(w);
  return normalCdf(d2);
}

/** Annualized implied vol at strike (for the surface viewer). */
export function impliedVolAnnual(svi: Svi, forward: number, strike: number, tYears: number): number {
  return Math.sqrt(Math.max(totalVariance(svi, Math.log(strike / forward)), 0) / tYears);
}

/** One-sided spread around the fair price (utilization≈0 by default). */
export function oneSidedSpread(fair: number, utilization = 0): number {
  const bernoulli = BASE_SPREAD * Math.sqrt(fair * (1 - fair));
  return Math.max(bernoulli, MIN_SPREAD) + BASE_SPREAD * UTIL_MULT * utilization ** 2;
}

export interface Quote {
  fair: number;
  upAsk: number;
  upBid: number;
  dnAsk: number;
  dnBid: number;
  roundTrip: number;
}

/** Full quote pair from a fair UP price (matches quote_spread_from_fair_price).
 *  The chain clamps ONLY the ask and derives each side's bid as `1 - opposite_ask`,
 *  so the book can never cross (the old symmetric clamp produced upAsk < upBid in
 *  the deep-ITM/OTM wings). */
export function quote(fair: number, utilization = 0): Quote {
  const s = oneSidedSpread(fair, utilization);
  const clampAsk = (a: number) => Math.min(Math.max(a, MIN_ASK), MAX_ASK);
  const upAsk = clampAsk(fair + s);
  const dnAsk = clampAsk(1 - fair + s);
  // bid = 1 - opposite ask, floored at the same-side ask so float noise at the
  // clamp boundary can never produce a (1e-16) crossed book.
  const upBid = Math.min(1 - dnAsk, upAsk);
  const dnBid = Math.min(1 - upAsk, dnAsk);
  return { fair, upAsk, upBid, dnAsk, dnBid, roundTrip: upAsk - upBid };
}

/** Price an oracle directly from raw indexer SVI + forward. */
export function priceMarket(raw: RawSvi, forward: number, strike: number, utilization = 0): Quote {
  return quote(digitalUp(decodeSvi(raw), forward, strike), utilization);
}
