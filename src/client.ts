/**
 * PredictClient — the one object you hold to build PTBs, read state, and price
 * markets on DeepBook Predict. Defaults to verified testnet config.
 *
 *   const predict = new PredictClient();
 *   const oracle  = (await predict.indexer.activeOracles())[0];
 *   const q       = await predict.quote(oracle.oracle_id, 63000);   // off-chain N(d2)
 *   const tx = predict.openUp({ manager, oracle, expiry, strike, quantity, depositCoinId });
 */
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { TESTNET, type PredictConfig } from './constants.ts';
import { PredictIndexer } from './indexer.ts';
import * as keys from './keys.ts';
import * as build from './builders.ts';
import { getTradeAmountsOnChain, type TradeAmounts } from './quote.ts';
import { decodeSvi, digitalUp, quote, type Quote } from './pricing.ts';

const usd = (x: unknown) => {
  const n = Number(x);
  return n > 1e7 ? n / 1e9 : n;
};

export class PredictClient {
  readonly cfg: PredictConfig;
  readonly indexer: PredictIndexer;

  constructor(overrides: Partial<PredictConfig> = {}) {
    this.cfg = { ...TESTNET, ...overrides };
    this.indexer = new PredictIndexer(this.cfg.server);
  }

  // ── key builders ──
  marketKeyUp = (tx: Transaction, o: string, e: bigint, s: bigint) => keys.marketKeyUp(tx, this.cfg, o, e, s);
  marketKeyDown = (tx: Transaction, o: string, e: bigint, s: bigint) => keys.marketKeyDown(tx, this.cfg, o, e, s);
  rangeKey = (tx: Transaction, o: string, e: bigint, l: bigint, h: bigint) => keys.rangeKey(tx, this.cfg, o, e, l, h);

  // ── PTB fragments ──
  createManager = (tx: Transaction) => build.createManager(tx, this.cfg);
  deposit = (tx: Transaction, m: string, c: TransactionObjectArgument) => build.deposit(tx, this.cfg, m, c);
  managerWithdraw = (tx: Transaction, m: string, a: bigint) => build.managerWithdraw(tx, this.cfg, m, a);
  mint = (tx: Transaction, a: Parameters<typeof build.mint>[2]) => build.mint(tx, this.cfg, a);
  mintRange = (tx: Transaction, a: Parameters<typeof build.mintRange>[2]) => build.mintRange(tx, this.cfg, a);
  redeem = (tx: Transaction, a: Parameters<typeof build.redeem>[2]) => build.redeem(tx, this.cfg, a);
  redeemPermissionless = (tx: Transaction, a: Parameters<typeof build.redeemPermissionless>[2]) =>
    build.redeemPermissionless(tx, this.cfg, a);
  supply = (tx: Transaction, c: TransactionObjectArgument) => build.supply(tx, this.cfg, c);
  withdrawPlp = (tx: Transaction, c: TransactionObjectArgument) => build.withdrawPlp(tx, this.cfg, c);

  /**
   * A ready-to-sign tx: split DUSDC from one of your coin objects, deposit it
   * into `manager`, then mint UP/DOWN — all in one self-contained PTB.
   *
   * Pass a `depositCoinId` (a `Coin<DUSDC>` object you own). `depositAmount`
   * (base units, ≥ mint_cost) splits off exactly that much; omit it to deposit
   * the whole coin. Self-contained — never references another transaction.
   */
  openUp(a: {
    manager: string;
    oracle: string;
    expiry: bigint;
    strike: bigint;
    quantity: bigint;
    depositCoinId: string;
    depositAmount?: bigint;
    isUp?: boolean;
  }): Transaction {
    const tx = new Transaction();
    const coin: TransactionObjectArgument =
      a.depositAmount === undefined
        ? tx.object(a.depositCoinId)
        : tx.splitCoins(tx.object(a.depositCoinId), [tx.pure.u64(a.depositAmount)])[0];
    build.deposit(tx, this.cfg, a.manager, coin);
    const key = keys.marketKey(tx, this.cfg, a.oracle, a.expiry, a.strike, a.isUp ?? true);
    build.mint(tx, this.cfg, { manager: a.manager, oracle: a.oracle, key, quantity: a.quantity });
    return tx;
  }

  /** Off-chain fair price + quote for a strike (USD), from the live SVI surface. */
  async quote(oracleId: string, strikeUsd: number): Promise<Quote & { forward: number }> {
    const [svi, px] = await Promise.all([
      this.indexer.latestSvi(oracleId),
      this.indexer.latestPrice(oracleId),
    ]);
    const forward = usd(px.forward ?? px.spot);
    return { ...quote(digitalUp(decodeSvi(svi), forward, strikeUsd)), forward };
  }

  /** Authoritative on-chain quote (devInspect). Pass a SuiGrpcClient + RPC url. */
  quoteOnChain(
    client: { core: unknown },
    rpcUrl: string,
    a: { oracleId: string; expiry: bigint; strike: bigint; isUp: boolean; quantity: bigint },
  ): Promise<TradeAmounts> {
    return getTradeAmountsOnChain(client, rpcUrl, this.cfg, a);
  }
}
