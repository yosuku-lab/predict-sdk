/**
 * MarketKey / RangeKey builders. Both are `copy,drop,store` structs returned by
 * value — build them inline and thread the result straight into a trade call.
 */
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { PredictConfig } from './constants.ts';

/** market_key::up(oracle_id, expiry, strike) — UP (DIRECTION_UP=0). */
export function marketKeyUp(
  tx: Transaction,
  cfg: PredictConfig,
  oracleId: string,
  expiry: bigint,
  strike: bigint,
): TransactionObjectArgument {
  return tx.moveCall({
    target: `${cfg.pkg}::market_key::up`,
    arguments: [tx.pure.id(oracleId), tx.pure.u64(expiry), tx.pure.u64(strike)],
  });
}

/** market_key::down(...) — DOWN (DIRECTION_DOWN=1). */
export function marketKeyDown(
  tx: Transaction,
  cfg: PredictConfig,
  oracleId: string,
  expiry: bigint,
  strike: bigint,
): TransactionObjectArgument {
  return tx.moveCall({
    target: `${cfg.pkg}::market_key::down`,
    arguments: [tx.pure.id(oracleId), tx.pure.u64(expiry), tx.pure.u64(strike)],
  });
}

export function marketKey(
  tx: Transaction,
  cfg: PredictConfig,
  oracleId: string,
  expiry: bigint,
  strike: bigint,
  isUp: boolean,
): TransactionObjectArgument {
  return isUp
    ? marketKeyUp(tx, cfg, oracleId, expiry, strike)
    : marketKeyDown(tx, cfg, oracleId, expiry, strike);
}

/** range_key::new(oracle_id, expiry, lower_strike, higher_strike) — aborts if lower ≥ higher. */
export function rangeKey(
  tx: Transaction,
  cfg: PredictConfig,
  oracleId: string,
  expiry: bigint,
  lowerStrike: bigint,
  higherStrike: bigint,
): TransactionObjectArgument {
  return tx.moveCall({
    target: `${cfg.pkg}::range_key::new`,
    arguments: [
      tx.pure.id(oracleId),
      tx.pure.u64(expiry),
      tx.pure.u64(lowerStrike),
      tx.pure.u64(higherStrike),
    ],
  });
}
