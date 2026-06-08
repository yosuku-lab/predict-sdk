/**
 * Proves the FIXED openUp executes end-to-end on testnet (the blocking bug).
 * Signs a real mint via predict.openUp using the funded agent wallet.
 * Run: node --experimental-strip-types sdk/examples/verify-openup.ts
 */
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { PredictClient, contracts, dusdc } from '../src/index.ts';

const RPC = 'https://fullnode.testnet.sui.io:443';
const KEY = 'suiprivkey1qz7gu367r588c5v5k08x957dtwpu3hrr5ysukfyg6e7vs3gjr89lx7fq99z';
const MANAGER = '0xaabff555533e7aa42492c098bc98cb88a5d3635fdd35c68f729e3ecfffd980e7';
const DUSDC = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';

const signer = Ed25519Keypair.fromSecretKey(KEY);
const client = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC });
const predict = new PredictClient();
const usd = (x: unknown) => { const n = Number(x); return n > 1e7 ? n / 1e9 : n; };
const rpc = async (m: string, p: unknown[]) =>
  (await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) })).json()).result;

const coins: any = await rpc('suix_getCoins', [signer.toSuiAddress(), DUSDC, null, 10]);
const depositCoinId = coins.data[0].coinObjectId;

const o = (await predict.indexer.activeOracles())[0];
const px = await predict.indexer.latestPrice(o.oracle_id);
const fwd = usd(px.forward ?? px.spot);
const tick = Number(o.tick_size);
const minK = Number(o.min_strike);
const strike = BigInt(minK + Math.round((fwd * 1e9 - minK) / tick) * tick);

const tx = predict.openUp({
  manager: MANAGER, oracle: o.oracle_id, expiry: BigInt(o.expiry),
  strike, quantity: contracts(1), depositCoinId, depositAmount: 2_000_000n,
});

const res: any = await client.signAndExecuteTransaction({ signer, transaction: tx });
const digest = res.$kind === 'Transaction' ? res.Transaction.digest : res.FailedTransaction.digest;
console.log('openUp tx:', `https://suiscan.xyz/testnet/tx/${digest}`, '| status:', res.$kind);

const tb: any = await rpc('sui_getTransactionBlock', [digest, { showEvents: true }]);
const minted = (tb.events ?? []).find((e: any) => String(e.type).endsWith('PositionMinted'));
console.log(minted
  ? `✅ openUp WORKS — PositionMinted up=${minted.parsedJson.is_up} cost ${dusdc(minted.parsedJson.cost)} DUSDC`
  : '✗ no PositionMinted event');
