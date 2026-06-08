/**
 * On-chain quote: read `predict::get_trade_amounts(predict, oracle, key, qty, clock)`
 * → (mint_cost, redeem_payout) via devInspect. Read-only, needs no funds. Use it
 * to cross-check the off-chain pricing engine against the authoritative chain.
 */
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { marketKey } from './keys.ts';
import type { PredictConfig } from './constants.ts';

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

function leU64(bytes: number[]): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(bytes[i] ?? 0) << BigInt(8 * i);
  return v;
}

export interface TradeAmounts {
  mintCost: bigint; // DUSDC base units to open `quantity`
  redeemPayout: bigint; // DUSDC base units to close `quantity` now
}

/**
 * @param client a SuiGrpcClient (used only to build the tx kind for devInspect)
 * @param rpcUrl JSON-RPC fullnode (for sui_devInspectTransactionBlock)
 */
export async function getTradeAmountsOnChain(
  client: { core: unknown },
  rpcUrl: string,
  cfg: PredictConfig,
  a: { oracleId: string; expiry: bigint; strike: bigint; isUp: boolean; quantity: bigint },
): Promise<TradeAmounts> {
  const tx = new Transaction();
  const key = marketKey(tx, cfg, a.oracleId, a.expiry, a.strike, a.isUp);
  tx.moveCall({
    target: `${cfg.pkg}::predict::get_trade_amounts`,
    arguments: [
      tx.object(cfg.predict),
      tx.object(a.oracleId),
      key,
      tx.pure.u64(a.quantity),
      tx.object(cfg.clock),
    ],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bytes: Uint8Array = await tx.build({ client: client as any, onlyTransactionKind: true });
  const b64 = toBase64(bytes); // browser-safe (no Node Buffer)
  const res = await (
    await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_devInspectTransactionBlock',
        params: [ZERO, b64],
      }),
    })
  ).json();
  if (res.error) throw new Error(`devInspect: ${JSON.stringify(res.error)}`);
  const rv = res.result?.results?.at(-1)?.returnValues;
  if (!rv || rv.length < 2) throw new Error(`no return values (status: ${res.result?.effects?.status?.status})`);
  return { mintCost: leU64(rv[0][0]), redeemPayout: leU64(rv[1][0]) };
}
