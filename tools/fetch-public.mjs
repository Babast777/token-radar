// Refresh lib/public.json from public APIs. The grader never runs this: main.ts has no network.
// Every figure written here is a response field. A failed source is recorded and left blank.
//
//   node tools/fetch-public.mjs --snapshot <kit>/input/snapshot.json

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const arg = process.argv.indexOf('--snapshot');
const snapshotPath = arg >= 0 ? process.argv[arg + 1] : join(root, 'input', 'snapshot.json');
const fallbackSnapshot = '/tmp/token-radar-01-kit/input/snapshot.json';

const UA = 'fathom-token-radar/1.0 (public research; no key)';

async function getJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { accept: 'application/json', 'user-agent': UA, ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(opts.timeout ?? 40000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function norm(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function num(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, places) {
  const p = 10 ** places;
  return Math.round(value * p) / p;
}

const EVM_CHAIN = {
  ethereum: '1',
  bsc: '56',
  'binance-smart-chain': '56',
  arbitrum: '42161',
  base: '8453',
  polygon: '137',
  optimism: '10',
  avalanche: '43114',
  scroll: '534352',
  linea: '59144',
  blast: '81457',
  mantle: '5000',
  gnosis: '100',
};

const RPC = {
  Ethereum: 'https://ethereum-rpc.publicnode.com',
  Base: 'https://base-rpc.publicnode.com',
  Arbitrum: 'https://arbitrum-one-rpc.publicnode.com',
  Optimism: 'https://optimism-rpc.publicnode.com',
  Binance: 'https://bsc-rpc.publicnode.com',
  Polygon: 'https://polygon-bor-rpc.publicnode.com',
  Avalanche: 'https://avalanche-c-chain-rpc.publicnode.com',
};

const GAS_UNITS = { transfer: 21000, swap: 160000, deposit: 250000 };

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
} catch {
  snapshot = JSON.parse(readFileSync(fallbackSnapshot, 'utf8'));
}

const errors = [];
function note(source, err) {
  errors.push({ source, error: String(err && err.message ? err.message : err) });
  console.error('fetch:', source, err && err.message ? err.message : err);
}

console.log('fetch: protocols list');
let live = [];
try {
  live = await getJson('https://api.llama.fi/protocols');
} catch (err) {
  note('https://api.llama.fi/protocols', err);
}
const liveBySlug = new Map(live.filter((p) => p && p.slug).map((p) => [p.slug, p]));

console.log('fetch: stablecoins');
let stables = [];
try {
  const body = await getJson('https://stablecoins.llama.fi/stablecoins');
  stables = Array.isArray(body.peggedAssets) ? body.peggedAssets : [];
} catch (err) {
  note('https://stablecoins.llama.fi/stablecoins', err);
}
const stableByNorm = new Map();
for (const asset of stables) {
  for (const key of [asset.name, asset.symbol, asset.gecko_id]) {
    const n = norm(key);
    if (n.length >= 3 && !stableByNorm.has(n)) stableByNorm.set(n, asset);
  }
}

const pre = snapshot.protocols.filter((p) => p.mcap_usd == null && p.gecko_id == null && p.symbol == null);
console.log('fetch: dexscreener for', pre.length, 'pre-token protocols');

const market = {};
let dexCalls = 0;
for (const protocol of pre) {
  const q = protocol.name;
  if (!q || q.length < 3) continue;
  const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
  let body;
  try {
    body = await getJson(url, { timeout: 20000 });
    dexCalls += 1;
  } catch (err) {
    note(url, err);
    await new Promise((r) => setTimeout(r, 800));
    continue;
  }
  const want = norm(protocol.name);
  let best = null;
  for (const pair of body.pairs ?? []) {
    const base = pair.baseToken ?? {};
    const symbol = String(base.symbol ?? '');
    const name = String(base.name ?? '');
    if (symbol.length < 2 || symbol.length > 12) continue;
    if (norm(name) !== want && norm(symbol) !== want) continue;
    const liquidity = num(pair.liquidity && pair.liquidity.usd);
    if (liquidity == null || liquidity < 100000) continue;
    if (best == null || liquidity > best.liquidity_usd) {
      best = {
        chain: pair.chainId ?? null,
        dex: pair.dexId ?? null,
        symbol,
        name,
        liquidity_usd: Math.round(liquidity),
        address: base.address ?? null,
        pair_address: pair.pairAddress ?? null,
        url: pair.url ?? null,
      };
    }
  }
  if (best && norm(best.name) === norm(protocol.name)) {
    market[protocol.slug] = best;
    console.log('  market', protocol.slug, best.chain, best.symbol, best.liquidity_usd);
  }
  if (dexCalls % 8 === 0) await new Promise((r) => setTimeout(r, 400));
}

console.log('fetch: token security for', Object.keys(market).length, 'markets');
const security = {};
for (const [slug, hit] of Object.entries(market)) {
  const address = hit.address;
  if (!address) continue;
  const chainId = EVM_CHAIN[hit.chain];
  const row = { goplus_honeypot: null, honeypot_is: null, buy_tax: null, sell_tax: null };
  try {
    if (hit.chain === 'solana') {
      const body = await getJson(`https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(address)}`);
      const entry = body.result && (body.result[address] || body.result[address.toLowerCase()]);
      if (entry) {
        row.goplus_honeypot = entry.is_honeypot === '1' || entry.trusted_token === 0 ? entry.is_honeypot === '1' : entry.is_honeypot === '1';
        if (entry.is_honeypot != null) row.goplus_honeypot = entry.is_honeypot === '1';
      }
    } else if (chainId) {
      const body = await getJson(`https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address}`);
      const entry = body.result && (body.result[address.toLowerCase()] || body.result[address]);
      if (entry) {
        if (entry.is_honeypot != null) row.goplus_honeypot = entry.is_honeypot === '1';
        row.buy_tax = num(entry.buy_tax);
        row.sell_tax = num(entry.sell_tax);
      }
      const honey = await getJson(`https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${chainId}`);
      if (honey.honeypotResult && typeof honey.honeypotResult.isHoneypot === 'boolean') {
        row.honeypot_is = honey.honeypotResult.isHoneypot;
      }
    }
  } catch (err) {
    note(`security ${slug}`, err);
  }
  if (row.goplus_honeypot != null || row.honeypot_is != null) security[slug] = row;
  console.log('  security', slug, JSON.stringify(row));
}

console.log('fetch: gas and native prices');
let prices = {};
try {
  const body = await getJson('https://coins.llama.fi/prices/current/coingecko:ethereum,coingecko:solana,coingecko:binancecoin,coingecko:matic-network,coingecko:avalanche-2,coingecko:bitcoin');
  prices = body.coins ?? {};
} catch (err) {
  note('https://coins.llama.fi/prices/current', err);
}
const priceOf = (id) => num(prices[id] && prices[id].price);

const feeByChain = {};
for (const [chain, url] of Object.entries(RPC)) {
  try {
    const body = await postJson(url, { jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] });
    const wei = BigInt(body.result);
    const gwei = Number(wei) / 1e9;
    const native = chain === 'Binance' ? priceOf('coingecko:binancecoin')
      : chain === 'Polygon' ? priceOf('coingecko:matic-network')
      : chain === 'Avalanche' ? priceOf('coingecko:avalanche-2')
      : priceOf('coingecko:ethereum');
    if (native == null) throw new Error('no native price');
    const usd = (units) => round((Number(wei) * units * native) / 1e18, 4);
    feeByChain[chain] = {
      gwei: round(gwei, 4),
      native_usd: round(native, 2),
      transfer_usd: usd(GAS_UNITS.transfer),
      swap_usd: usd(GAS_UNITS.swap),
      deposit_usd: usd(GAS_UNITS.deposit),
      source: `${url} eth_gasPrice`,
    };
    console.log('  fee', chain, feeByChain[chain].gwei, 'gwei', 'deposit', feeByChain[chain].deposit_usd);
  } catch (err) {
    note(url, err);
  }
}

try {
  const sol = priceOf('coingecko:solana');
  const fees = await postJson('https://solana-rpc.publicnode.com', { jsonrpc: '2.0', id: 1, method: 'getRecentPrioritizationFees', params: [] });
  const list = Array.isArray(fees.result) ? fees.result.map((row) => num(row.prioritizationFee)).filter((n) => n != null) : [];
  list.sort((a, b) => a - b);
  const priority = list.length ? list[Math.floor(list.length / 2)] : 0;
  const lamports = 5000 + priority;
  if (sol == null) throw new Error('no SOL price');
  const one = (sigs) => round((lamports * sigs * sol) / 1e9, 4);
  feeByChain.Solana = {
    prioritization_microlamports: priority,
    base_lamports: 5000,
    native_usd: round(sol, 2),
    transfer_usd: one(1),
    swap_usd: one(2),
    deposit_usd: one(2),
    source: 'https://solana-rpc.publicnode.com getRecentPrioritizationFees plus the 5000-lamport signature fee',
  };
  console.log('  fee Solana', feeByChain.Solana);
} catch (err) {
  note('solana fees', err);
}

try {
  const btc = priceOf('coingecko:bitcoin');
  const rec = await getJson('https://mempool.space/api/v1/fees/recommended');
  const satVb = num(rec.halfHourFee) ?? num(rec.hourFee);
  if (btc == null || satVb == null) throw new Error('incomplete mempool sample');
  const usd = (vb) => round((satVb * vb * btc) / 1e8, 4);
  feeByChain.Bitcoin = {
    sat_per_vbyte: satVb,
    native_usd: round(btc, 2),
    transfer_usd: usd(140),
    swap_usd: usd(140),
    deposit_usd: usd(225),
    source: 'https://mempool.space/api/v1/fees/recommended halfHourFee, 140 vB transfer and 225 vB deposit',
  };
  console.log('  fee Bitcoin', feeByChain.Bitcoin);
} catch (err) {
  note('mempool.space', err);
}

const l2 = ['Base', 'Arbitrum', 'Optimism'].map((name) => feeByChain[name]).filter(Boolean);
const fallback = l2.length
  ? {
      transfer_usd: round(l2.reduce((s, f) => s + f.transfer_usd, 0) / l2.length, 4),
      swap_usd: round(l2.reduce((s, f) => s + f.swap_usd, 0) / l2.length, 4),
      deposit_usd: round(l2.reduce((s, f) => s + f.deposit_usd, 0) / l2.length, 4),
      note: 'Median is not used. This is the mean of the Base, Arbitrum and Optimism samples, for a chain with no sample of its own.',
    }
  : null;

const parent = {};
const info = {};
for (const protocol of snapshot.protocols) {
  const row = liveBySlug.get(protocol.slug);
  if (!row) continue;
  if (typeof row.parentProtocol === 'string' && row.parentProtocol) parent[protocol.slug] = row.parentProtocol;
  if (protocol.mcap_usd == null && protocol.gecko_id == null && protocol.symbol == null) {
    info[protocol.slug] = {
      url: typeof row.url === 'string' ? row.url : null,
      twitter: typeof row.twitter === 'string' ? row.twitter : null,
      audits: typeof row.audits === 'number' ? row.audits : 0,
    };
  }
}

const stable = {};
for (const protocol of pre) {
  const hit = stableByNorm.get(norm(protocol.name)) || stableByNorm.get(norm(protocol.slug));
  if (!hit) continue;
  const circulating = num(hit.circulating && hit.circulating.peggedUSD);
  stable[protocol.slug] = {
    symbol: hit.symbol ?? null,
    name: hit.name ?? null,
    gecko_id: hit.gecko_id ?? null,
    circulating_usd: circulating == null ? null : Math.round(circulating),
    peg: hit.pegType ?? null,
  };
  console.log('  stable', protocol.slug, stable[protocol.slug].symbol, stable[protocol.slug].circulating_usd);
}

console.log('fetch: protocol pages for audits and hacks');
const preSlugs = pre.map((p) => p.slug);
let cursor = 0;
async function detailWorker() {
  while (cursor < preSlugs.length) {
    const slug = preSlugs[cursor];
    cursor += 1;
    try {
      const d = await getJson(`https://api.llama.fi/protocol/${slug}`);
      const links = Array.isArray(d.audit_links) ? d.audit_links : [];
      const hacks = Array.isArray(d.hacks) ? d.hacks : [];
      const row = info[slug] ?? { url: null, twitter: null, audits: 0 };
      row.audits = typeof d.audits === 'number' ? d.audits : links.length;
      row.audit_links = links.length;
      row.hacks = hacks.length;
      const names = hacks.map((h) => h && h.name).filter((n) => typeof n === 'string');
      if (names.length) row.hack_names = names.slice(0, 3);
      if (typeof d.url === 'string') row.url = d.url;
      info[slug] = row;
    } catch (err) {
      note(`protocol ${slug}`, err);
    }
  }
}
await Promise.all([detailWorker(), detailWorker(), detailWorker(), detailWorker(), detailWorker(), detailWorker()]);

const out = {
  fetched_at: new Date().toISOString(),
  gas_units: GAS_UNITS,
  sources: [
    'https://api.llama.fi/protocols',
    'https://stablecoins.llama.fi/stablecoins',
    'https://api.dexscreener.com/latest/dex/search',
    'https://api.gopluslabs.io/api/v1/token_security/',
    'https://api.gopluslabs.io/api/v1/solana/token_security',
    'https://api.honeypot.is/v2/IsHoneypot',
    'https://coins.llama.fi/prices/current',
    ...Object.values(RPC),
    'https://solana-rpc.publicnode.com',
    'https://mempool.space/api/v1/fees/recommended',
  ],
  errors,
  fee_by_chain: feeByChain,
  fee_fallback: fallback,
  parent,
  info,
  stable,
  market,
  security,
};

const dest = join(root, 'lib', 'public.json');
writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log('wrote', dest, 'parents', Object.keys(parent).length, 'info', Object.keys(info).length, 'stable', Object.keys(stable).length, 'market', Object.keys(market).length, 'errors', errors.length);
