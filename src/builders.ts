/**
 * PTB builders for `predict` + `predict_manager`. Each mutates the passed
 * Transaction and (where relevant) returns the result handle. All quote-typed
 * calls use DUSDC. Verified arg order against the Move source (DEEPBOOK_RESEARCH §3.3).
 */
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { PredictConfig } from './constants.ts';

/** predict::create_manager(ctx) — shares a PredictManager; read its id from the
 *  PredictManagerCreated event or objectChanges of the executed tx. */
export function createManager(tx: Transaction, cfg: PredictConfig): void {
  tx.moveCall({ target: `${cfg.pkg}::predict::create_manager`, arguments: [] });
}

/** predict_manager::deposit<DUSDC>(manager, coin, ctx) — owner-gated. */
export function deposit(
  tx: Transaction,
  cfg: PredictConfig,
  manager: string,
  coin: TransactionObjectArgument,
): void {
  tx.moveCall({
    target: `${cfg.pkg}::predict_manager::deposit`,
    typeArguments: [cfg.dusdc],
    arguments: [tx.object(manager), coin],
  });
}

/** predict_manager::withdraw<DUSDC>(manager, amount, ctx): Coin<DUSDC> — owner-gated. */
export function managerWithdraw(
  tx: Transaction,
  cfg: PredictConfig,
  manager: string,
  amount: bigint,
): TransactionObjectArgument {
  return tx.moveCall({
    target: `${cfg.pkg}::predict_manager::withdraw`,
    typeArguments: [cfg.dusdc],
    arguments: [tx.object(manager), tx.pure.u64(amount)],
  });
}

interface TradeArgs {
  manager: string;
  oracle: string;
  /** MarketKey or RangeKey handle from keys.ts. */
  key: TransactionObjectArgument;
  quantity: bigint;
}

/** predict::mint<DUSDC>(predict, manager, oracle, key, quantity, clock, ctx) — returns nothing. */
export function mint(tx: Transaction, cfg: PredictConfig, a: TradeArgs): void {
  tx.moveCall({
    target: `${cfg.pkg}::predict::mint`,
    typeArguments: [cfg.dusdc],
    arguments: [
      tx.object(cfg.predict),
      tx.object(a.manager),
      tx.object(a.oracle),
      a.key,
      tx.pure.u64(a.quantity),
      tx.object(cfg.clock),
    ],
  });
}

/** predict::mint_range<DUSDC>(...) — same arg order, RangeKey. */
export function mintRange(tx: Transaction, cfg: PredictConfig, a: TradeArgs): void {
  tx.moveCall({
    target: `${cfg.pkg}::predict::mint_range`,
    typeArguments: [cfg.dusdc],
    arguments: [
      tx.object(cfg.predict),
      tx.object(a.manager),
      tx.object(a.oracle),
      a.key,
      tx.pure.u64(a.quantity),
      tx.object(cfg.clock),
    ],
  });
}

/** predict::redeem<DUSDC>(...) — owner-gated; deposits payout into the manager. */
export function redeem(tx: Transaction, cfg: PredictConfig, a: TradeArgs): void {
  tx.moveCall({
    target: `${cfg.pkg}::predict::redeem`,
    typeArguments: [cfg.dusdc],
    arguments: [
      tx.object(cfg.predict),
      tx.object(a.manager),
      tx.object(a.oracle),
      a.key,
      tx.pure.u64(a.quantity),
      tx.object(cfg.clock),
    ],
  });
}

/** predict::redeem_permissionless<DUSDC>(...) — requires a SETTLED oracle; NO owner check.
 *  The gas-negative keeper crank: anyone can redeem any winner into its manager. */
export function redeemPermissionless(tx: Transaction, cfg: PredictConfig, a: TradeArgs): void {
  tx.moveCall({
    target: `${cfg.pkg}::predict::redeem_permissionless`,
    typeArguments: [cfg.dusdc],
    arguments: [
      tx.object(cfg.predict),
      tx.object(a.manager),
      tx.object(a.oracle),
      a.key,
      tx.pure.u64(a.quantity),
      tx.object(cfg.clock),
    ],
  });
}

/** predict::supply<DUSDC>(predict, coin, clock, ctx): Coin<PLP> — be the house. */
export function supply(
  tx: Transaction,
  cfg: PredictConfig,
  coin: TransactionObjectArgument,
): TransactionObjectArgument {
  return tx.moveCall({
    target: `${cfg.pkg}::predict::supply`,
    typeArguments: [cfg.dusdc],
    arguments: [tx.object(cfg.predict), coin, tx.object(cfg.clock)],
  });
}

/** predict::withdraw<DUSDC>(predict, lp_coin, clock, ctx): Coin<DUSDC> — exit PLP. */
export function withdrawPlp(
  tx: Transaction,
  cfg: PredictConfig,
  lpCoin: TransactionObjectArgument,
): TransactionObjectArgument {
  return tx.moveCall({
    target: `${cfg.pkg}::predict::withdraw`,
    typeArguments: [cfg.dusdc],
    arguments: [tx.object(cfg.predict), lpCoin, tx.object(cfg.clock)],
  });
}
