/**
 * Typed client over the DeepBook Predict REST indexer.
 * Only the endpoints VERIFIED to return data are exposed here (DEEPBOOK_RESEARCH
 * §3.6). The known-null endpoints (/pnl, /summary, /positions/summary,
 * /oracles/:id/ask-bounds) are deliberately omitted — derive those yourself.
 */
import type { RawSvi } from './pricing.ts';
import { TESTNET } from './constants.ts';

export interface Oracle {
  predict_id: string;
  oracle_id: string;
  oracle_cap_id: string;
  underlying_asset: string;
  // The live server returns these as JS numbers (expiry ms, min_strike/tick_size
  // 1e9-scaled, settlement_price 1e9-scaled). Typed as unions so string methods
  // don't blow up; absent values are real `null`, never the string "null".
  expiry: string | number;
  min_strike: string | number;
  tick_size: string | number;
  status: 'inactive' | 'active' | 'pending_settlement' | 'settled';
  activated_at: number | null;
  settlement_price: number | null;
  settled_at: number | null;
  created_checkpoint: string | number;
}

export interface OraclePrice {
  // The live server returns these as raw numbers (e.g. 63722019970063), not
  // strings — typed as the union so callers don't `.toFixed()` a string.
  spot: string | number;
  forward: string | number;
  onchain_timestamp: string | number;
}

export interface MintedPosition {
  oracle_id: string;
  manager_id: string;
  /** Address that minted the position (the server field is `trader`, not `owner`). */
  trader: string;
  is_up: boolean;
  // Numeric fields arrive as JS numbers (quantity/cost in 6-dec µDUSDC,
  // strike/expiry 1e9-scaled & ms) — typed as the union so `.toFixed()`-style
  // calls don't blow up. Use `dusdc()` / `scaledToUsd()` to convert.
  quantity: string | number;
  cost: string | number;
  ask_price: string | number;
  strike: string | number;
  expiry: string | number;
  /** Mint transaction digest. */
  digest: string;
}

export interface RedeemedPosition {
  oracle_id: string;
  manager_id: string;
  owner: string;
  /** Whoever cranked the redeem (may be a permissionless keeper, not the owner). */
  executor: string;
  is_up: boolean;
  quantity: string | number;
  payout: string | number;
  bid_price: string | number;
  strike: string | number;
  expiry: string | number;
  is_settled: boolean;
  /** Redeem transaction digest. */
  digest: string;
}

export interface VaultSummary {
  // Server returns every field as a JS number. The µ-denominated balances are
  // integers; plp_share_price and utilization are floats.
  vault_balance: string | number;
  vault_value: string | number;
  total_mtm: string | number;
  total_max_payout: string | number;
  available_withdrawal: string | number;
  plp_total_supply: string | number;
  plp_share_price: number;
  utilization: number;
}

export class PredictIndexer {
  private base: string;
  /** Defaults to the verified testnet indexer so `new PredictIndexer()` (incl.
   *  from JS, with no type-checking) never produces `undefined/oracles`. */
  constructor(base: string = TESTNET.server) {
    this.base = base;
  }

  /** Convenience: a testnet indexer client. */
  static testnet(): PredictIndexer {
    return new PredictIndexer(TESTNET.server);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`);
    if (!res.ok) throw new Error(`indexer ${res.status} ${path}`);
    return (await res.json()) as T;
  }

  /** List endpoints vary in their envelope: a bare array, `null`, `{ data: [...] }`,
   *  or `{ minted: [...], redeemed: [...] }` (the per-manager positions endpoint).
   *  Always normalize to an array so callers can iterate safely. `minted` is
   *  checked before `redeemed` so `managerPositions()` returns the minted set. */
  private async list<T>(path: string): Promise<T[]> {
    const r = await this.get<unknown>(path);
    if (Array.isArray(r)) return r as T[];
    if (r && typeof r === 'object') {
      const o = r as Record<string, unknown>;
      for (const k of ['data', 'positions', 'minted', 'redeemed', 'ranges', 'managers', 'supplies', 'withdrawals']) {
        if (Array.isArray(o[k])) return o[k] as T[];
      }
    }
    return [];
  }

  status() {
    // The head-of-chain field is `latest_onchain_checkpoint` (NOT `checkpoint`).
    return this.get<{
      status?: string;
      latest_onchain_checkpoint?: number;
      current_time_ms?: number;
      earliest_checkpoint?: number;
    }>('/status');
  }

  oracles() {
    return this.list<Oracle>('/oracles');
  }

  /** Active oracles only — `?status=` does NOT filter server-side, so we filter here. */
  async activeOracles(): Promise<Oracle[]> {
    return (await this.oracles()).filter((o) => o.status === 'active');
  }

  /** Settled oracles — the keeper's redeem set. */
  async settledOracles(): Promise<Oracle[]> {
    return (await this.oracles()).filter((o) => o.status === 'settled');
  }

  oracleState(oracleId: string) {
    // Server returns { oracle, latest_price, latest_svi, ask_bounds } — there is
    // NO `price` key. (The old `.price` typing crashed at runtime.)
    return this.get<{
      oracle: Oracle;
      latest_price: OraclePrice;
      latest_svi: RawSvi & { onchain_timestamp: string | number };
      ask_bounds: unknown;
    }>(`/oracles/${oracleId}/state`);
  }

  latestPrice(oracleId: string) {
    return this.get<OraclePrice>(`/oracles/${oracleId}/prices/latest`);
  }

  latestSvi(oracleId: string) {
    return this.get<RawSvi & { onchain_timestamp: string | number }>(`/oracles/${oracleId}/svi/latest`);
  }

  mintedPositions(oracleId?: string) {
    return this.list<MintedPosition>(`/positions/minted${oracleId ? `?oracle_id=${oracleId}` : ''}`);
  }

  redeemedPositions(oracleId?: string) {
    return this.list<RedeemedPosition>(`/positions/redeemed${oracleId ? `?oracle_id=${oracleId}` : ''}`,
    );
  }

  /** `?owner=` IS server-side filtered. */
  managers(owner?: string) {
    return this.list<{ manager_id: string; owner: string }>(
      `/managers${owner ? `?owner=${owner}` : ''}`,
    );
  }

  managerPositions(managerId: string) {
    return this.list<MintedPosition>(`/managers/${managerId}/positions`);
  }

  vaultSummary(predictId: string) {
    return this.get<VaultSummary>(`/predicts/${predictId}/vault/summary`);
  }
}
