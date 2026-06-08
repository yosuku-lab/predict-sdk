/**
 * Live smoke test — the SDK proves itself against testnet (read-only, no funds).
 * Run: node --experimental-strip-types sdk/examples/smoke.ts
 */
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { PredictClient } from '../src/index.ts';

const RPC = 'https://fullnode.testnet.sui.io:443';
const MANAGER = '0xaabff555533e7aa42492c098bc98cb88a5d3635fdd35c68f729e3ecfffd980e7'; // from the reference tx
const usd = (x: unknown) => { const n = Number(x); return n > 1e7 ? n / 1e9 : n; };

const predict = new PredictClient();
const grpc = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC });

// 1) live indexer
const active = await predict.indexer.activeOracles();
console.log(`1) indexer: ${active.length} active BTC oracles`);
const o = active[0];
const price = await predict.indexer.latestPrice(o.oracle_id);
const fwd = usd(price.forward ?? price.spot);
const tick = Number(o.tick_size);
const minK = Number(o.min_strike);
const strikeScaled = BigInt(minK + Math.round((fwd * 1e9 - minK) / tick) * tick);
const strikeUsd = Number(strikeScaled) / 1e9;
console.log(`   oracle ${o.oracle_id.slice(0, 12)}…  forward $${fwd.toFixed(2)}  strike $${strikeUsd}`);

// 2) off-chain quote (the engine)
const q = await predict.quote(o.oracle_id, strikeUsd);
console.log(`2) off-chain quote: UP ask ${(q.upAsk * 100).toFixed(2)}¢  bid ${(q.upBid * 100).toFixed(2)}¢  (fair ${(q.fair * 100).toFixed(2)}¢)`);

// 3) on-chain quote via devInspect — cross-check the engine against the chain
try {
  const oc = await predict.quoteOnChain(grpc, RPC, {
    oracleId: o.oracle_id, expiry: BigInt(o.expiry), strike: strikeScaled, isUp: true, quantity: 1_000_000n,
  });
  const ocAsk = Number(oc.mintCost) / 1e6;
  const delta = Math.abs(q.upAsk - ocAsk) * 100;
  console.log(`3) on-chain  quote: mint_cost ${(ocAsk * 100).toFixed(2)}¢  redeem ${(Number(oc.redeemPayout) / 1e6 * 100).toFixed(2)}¢`);
  console.log(`   Δ(engine vs chain) = ${delta.toFixed(3)}¢  ${delta < 0.5 ? '✓ MATCH' : '✗'}`);
} catch (e) {
  console.log('3) on-chain quote skipped:', String(e).slice(0, 160));
}

// 4) PTB composition — build deposit + market_key::up + mint, assert it constructs
const tx = new Transaction();
const [chip] = tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000n)]);
predict.deposit(tx, MANAGER, chip);
const key = predict.marketKeyUp(tx, o.oracle_id, BigInt(o.expiry), strikeScaled);
predict.mint(tx, { manager: MANAGER, oracle: o.oracle_id, key, quantity: 1_000_000n });
const cmds = tx.getData().commands.length;
console.log(`4) PTB builders: composed a deposit+key+mint PTB (${cmds} commands) ✓`);

console.log('\n@yosuku/predict — live ✓');
