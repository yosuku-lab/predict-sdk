/**
 * Agent memory for DeepBook Predict — portable, encrypted, verifiable.
 *
 * A trading-shaped layer over Walrus Memory (MemWal): your agent remembers
 * every trade and settlement as a semantic memory, SEAL-encrypted and stored
 * on Walrus, owned by a Sui account you control. Recall is by meaning
 * ("what do I know about near-expiry BTC markets?"), not keywords.
 *
 * Design rule this module assumes: memory shapes what your strategy PROPOSES —
 * it must never be the thing that bounds what the agent can DO. Keep authority
 * in your caps/guards (on-chain where possible) and treat lessons as advisory.
 *
 * Requires the optional peer `@mysten-incubation/memwal` (loaded lazily — the
 * rest of this SDK works without it):
 *
 *   npm i @mysten-incubation/memwal
 *
 * One-time setup (creates the on-chain MemWalAccount + a delegate key):
 *
 *   const creds = await AgentMemory.setup({ suiPrivateKey, suiClient });
 *   // persist creds somewhere safe, then forever after:
 *   const memory = AgentMemory.create(creds);
 *
 *   await memory.rememberTrade({ oracle, strike: 63_000, side: 'up', qty: 1,
 *                                cost: 0.5069, edge: 0.012, reason: 'model > ask' });
 *   const lessons = await memory.recall('what edge do I need near ATM?');
 */

/** MemWal testnet deployment (Walrus Foundation hosted relayer, beta). */
export const MEMORY_TESTNET = {
  packageId: '0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6',
  registryId: '0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437',
  relayerUrl: 'https://relayer-staging.memory.walrus.xyz',
} as const;

/** MemWal mainnet deployment (Walrus Foundation hosted relayer). */
export const MEMORY_MAINNET = {
  packageId: '0xcee7a6fd8de52ce645c38332bde23d4a30fd9426bc4681409733dd50958a24c6',
  registryId: '0x0da982cefa26864ae834a8a0504b904233d49e20fcc17c373c8bed99c75a7edd',
  relayerUrl: 'https://relayer.memory.walrus.xyz',
} as const;

export interface MemoryCredentials {
  /** MemWalAccount object id (owned by your Sui key). */
  accountId: string;
  /** Hex ed25519 delegate private key registered on the account. */
  delegatePrivateKey: string;
  /** Relayer endpoint. Defaults to the testnet staging relayer. */
  relayerUrl?: string;
  /** Memory-space namespace; isolates this agent's memories. Default 'agent'. */
  namespace?: string;
}

export interface SetupOptions {
  /** Bech32 `suiprivkey…` of the account owner (pays gas, owns the memory). */
  suiPrivateKey: string;
  /** A SuiClient-compatible client. REQUIRED with @mysten/sui v2.6+ (e.g. `new SuiJsonRpcClient({...})`). */
  suiClient?: unknown;
  network?: 'testnet' | 'mainnet';
  /** Label shown on-chain for the delegate key. Default 'deepbook-agent'. */
  label?: string;
  namespace?: string;
}

export interface TradeMemory {
  oracle: string;
  /** Strike in whole USD (e.g. 63_000) or a display string. */
  strike: number | string;
  side: 'up' | 'down' | 'range';
  /** Contracts (1 contract = $1 max payout). */
  qty: number;
  /** DUSDC paid. */
  cost: number;
  /** Model edge over the quoted ask at entry (e.g. 0.012 = 1.2%). */
  edge?: number;
  expiry?: number | string;
  reason?: string;
  /** On-chain provenance: the tx digest of the mint this memory records.
   *  Links the lesson to the verifiable event that taught it. */
  txDigest?: string;
  /** Walrus blob id of the agent's DecisionRecord for this trade, if archived. */
  decisionBlobId?: string;
}

export interface OutcomeMemory {
  oracle: string;
  strike: number | string;
  side: 'up' | 'down' | 'range';
  /** Settlement print, if known. */
  settled?: number | string;
  /** DUSDC received (0 for a loss). */
  payout: number;
  /** Realized PnL in DUSDC. */
  pnl: number;
  note?: string;
  /** On-chain provenance: the redeem tx digest this outcome records. */
  txDigest?: string;
}

export interface Lesson {
  text: string;
  /** Relevance score from semantic search, when the relayer provides one. */
  score?: number;
}

async function loadMemwal(): Promise<any> {
  try {
    return await import('@mysten-incubation/memwal');
  } catch {
    throw new Error(
      "@yosuku/deepbook-predict/memory needs the optional peer '@mysten-incubation/memwal' — npm i @mysten-incubation/memwal",
    );
  }
}

export class AgentMemory {
  private constructor(private readonly mw: any) {}

  /**
   * One-time on-chain setup: creates a MemWalAccount owned by `suiPrivateKey`
   * and registers a fresh delegate key for the agent. Persist the returned
   * credentials — the delegate key is shown only once.
   */
  static async setup(opts: SetupOptions): Promise<Required<MemoryCredentials>> {
    const account = await import('@mysten-incubation/memwal/account').catch(() => {
      throw new Error(
        "@yosuku/deepbook-predict/memory needs the optional peer '@mysten-incubation/memwal' — npm i @mysten-incubation/memwal",
      );
    });
    const net = opts.network === 'mainnet' ? MEMORY_MAINNET : MEMORY_TESTNET;
    const created = await account.createAccount({
      packageId: net.packageId,
      registryId: net.registryId,
      suiPrivateKey: opts.suiPrivateKey,
      suiClient: opts.suiClient,
      suiNetwork: opts.network ?? 'testnet',
    });
    const delegate = await account.generateDelegateKey();
    await account.addDelegateKey({
      packageId: net.packageId,
      accountId: created.accountId,
      publicKey: delegate.publicKey,
      label: opts.label ?? 'deepbook-agent',
      suiPrivateKey: opts.suiPrivateKey,
      suiClient: opts.suiClient,
      suiNetwork: opts.network ?? 'testnet',
    });
    return {
      accountId: created.accountId,
      delegatePrivateKey: delegate.privateKey,
      relayerUrl: net.relayerUrl,
      namespace: opts.namespace ?? 'agent',
    };
  }

  /** Connect with existing credentials (from `setup()`). */
  static async create(creds: MemoryCredentials): Promise<AgentMemory> {
    const { MemWal } = await loadMemwal();
    const mw = MemWal.create({
      key: creds.delegatePrivateKey,
      accountId: creds.accountId,
      serverUrl: creds.relayerUrl ?? MEMORY_TESTNET.relayerUrl,
      namespace: creds.namespace ?? 'agent',
    });
    return new AgentMemory(mw);
  }

  /** Record an opened position. Resolves once the memory is durably stored. */
  async rememberTrade(t: TradeMemory): Promise<void> {
    const text =
      `Trade opened: ${t.side.toUpperCase()} strike ${t.strike}` +
      (t.expiry ? ` expiry ${t.expiry}` : '') +
      ` on oracle ${t.oracle} — qty ${t.qty}, cost ${t.cost} DUSDC` +
      (t.edge !== undefined ? `, model edge ${(t.edge * 100).toFixed(2)}%` : '') +
      (t.reason ? `. Reason: ${t.reason}` : '') +
      (t.txDigest ? ` [tx ${t.txDigest}]` : '') +
      (t.decisionBlobId ? ` [decision blob ${t.decisionBlobId}]` : '');
    await this.rememberText(text);
  }

  /** Record a settlement so the agent learns whether its edge was real. */
  async rememberOutcome(o: OutcomeMemory): Promise<void> {
    const text =
      `Trade settled: ${o.side.toUpperCase()} strike ${o.strike} on oracle ${o.oracle}` +
      (o.settled !== undefined ? ` — settlement ${o.settled}` : '') +
      `, payout ${o.payout} DUSDC, realized PnL ${o.pnl >= 0 ? '+' : ''}${o.pnl} DUSDC` +
      (o.note ? `. ${o.note}` : '') +
      (o.txDigest ? ` [tx ${o.txDigest}]` : '');
    await this.rememberText(text);
  }

  /** Store any free-form lesson. */
  async rememberText(text: string): Promise<void> {
    const job = await this.mw.remember(text);
    await this.mw.waitForRememberJob(job.job_id);
  }

  /** Semantic recall — ask in natural language, get the closest lessons. */
  async recall(query: string, limit = 5): Promise<Lesson[]> {
    const res = await this.mw.recall({ query, limit });
    return res.results.map((r: { text: string; score?: number }) => ({
      text: r.text,
      score: r.score,
    }));
  }

  /** Recall lessons about a specific oracle/market. */
  async recallFor(oracle: string, limit = 5): Promise<Lesson[]> {
    return this.recall(`trades, outcomes and lessons for oracle ${oracle}`, limit);
  }

  /** Relayer health check. */
  async health(): Promise<unknown> {
    return this.mw.health();
  }
}
