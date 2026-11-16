// Fathom's value model. One snapshot in, one ranked board out.
//
// Implied value is a function of the snapshot's own TVL, seven-day change and listing age,
// times a category multiple (the snapshot's category, never a protocol name) and a public
// multiple. The public multiple is 1 unless a fetched record says otherwise: a DefiLlama
// hack, a DefiLlama stablecoin listing, or a Dexscreener pool whose token name matches the
// protocol name. A symbol-only pool (Axis Robotics versus Axis) does not count.
// GoPlus and honeypot.is are read only for those name matches.
//
// The same function scores every row. Nothing here is a hand-ordered list of slugs.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  size_exponent: number;
  size_floor: number;
  size_cap: number;
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  tenure_floor: number;
  tenure_rise: number;
  tenure_fade: number;
  tenure_peak_days: number;
  tenure_cap_days: number;
  tenure_min: number;
  unknown_tenure: number;
  chain_step: number;
  chain_extra_cap: number;
  unreported_confidence: number;
  drawdown_20: number;
  drawdown_35: number;
  hack_multiplier: number;
  listed_multiplier: number;
  honeypot_multiplier: number;
  market_multiplier: number;
  audit_multiplier: number;
  category_default: number;
  category_multiples: Record<string, number>;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.22,
  size_exponent: -0.12,
  size_floor: 0.5,
  size_cap: 1.35,
  growth_floor: -60,
  growth_cap: 80,
  growth_weight: 0.85,
  tenure_floor: 0.64,
  tenure_rise: 0.46,
  tenure_fade: 0.28,
  tenure_peak_days: 420,
  tenure_cap_days: 1260,
  tenure_min: 0.78,
  unknown_tenure: 0.84,
  chain_step: 0.025,
  chain_extra_cap: 5,
  unreported_confidence: 0.92,
  drawdown_20: 0.78,
  drawdown_35: 0.58,
  hack_multiplier: 0.28,
  listed_multiplier: 0.2,
  honeypot_multiplier: 0.12,
  market_multiplier: 0.42,
  audit_multiplier: 1.05,
  category_default: 1,
  category_multiples: {
    Dexs: 1.22,
    Derivatives: 1.2,
    Lending: 1.18,
    Yield: 1.12,
    'Yield Aggregator': 1.1,
    Restaking: 1.16,
    'Basis Trading': 1.08,
    'Leveraged Farming': 1.06,
    Farm: 1.1,
    'Prediction Market': 1.08,
    'Collateral Markets': 1.05,
    CDP: 1,
    Insurance: 0.98,
    RWA: 0.92,
    Indexes: 0.9,
    CeDeFi: 0.9,
    'Liquidity Manager': 0.88,
    'Governance Incentives': 0.86,
    'Crypto Card Issuer': 0.84,
    'Onchain Capital Allocator': 0.8,
    'Risk Curators': 0.76,
    'Decentralized BTC': 0.7,
    'Dual-Token Stablecoin': 0.7,
    'Staking Pool': 0.64,
    'Stablecoin Wrapper': 0.62,
    'Anchor BTC': 0.58,
    Payments: 0.5,
    Chain: 0.48,
    Bridge: 0.3,
    'Canonical Bridge': 0.28,
    'Liquid Staking': 0.34,
    'Liquid Restaking': 0.34,
    'Restaked BTC': 0.36,
    CEX: 0.2,
  },
};

export const MODEL_VERSION = 'fathom-1';

export type PublicClass = 'unlisted' | 'hacked' | 'listed-stable' | 'market-name' | 'lookalike-honeypot';

interface Fee {
  transfer_usd: number;
  swap_usd: number;
  deposit_usd: number;
  source: string;
  gwei?: number;
  sat_per_vbyte?: number;
}

interface PublicInfo {
  url: string | null;
  twitter: string | null;
  audits: number;
  audit_links?: number;
  hacks?: number;
  hack_names?: string[];
}

interface PublicFile {
  fetched_at: string;
  gas_units: { transfer: number; swap: number; deposit: number };
  fee_by_chain: Record<string, Fee>;
  parent: Record<string, string>;
  info: Record<string, PublicInfo>;
  stable: Record<string, { symbol: string | null; name: string | null; gecko_id: string | null; circulating_usd: number | null }>;
  market: Record<string, { chain: string | null; dex: string | null; symbol: string; name: string; liquidity_usd: number; address: string | null }>;
  security: Record<string, { goplus_honeypot: boolean | null; honeypot_is: boolean | null; buy_tax: number | null; sell_tax: number | null }>;
}

export interface Factors {
  size_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  tenure_multiplier: number;
  category_multiplier: number;
  chain_multiplier: number;
  confidence_multiplier: number;
  public_multiplier: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  public_class: PublicClass;
  public_note: string;
  audits: number;
  hacks: number;
  host: string | null;
  factors: Factors;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  public_class: PublicClass;
  public_note: string;
  audits: number;
  hacks: number;
  host: string | null;
  factors: Factors;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  fetched_at: string;
  model: ModelConstants;
  model_version: string;
  counts: {
    protocols: number;
    watchlist: number;
    board: number;
    early: number;
    set_aside_child: number;
    set_aside_wrapper: number;
    live_on_record: number;
    hacked: number;
    listed_stable: number;
    market_name: number;
  };
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAP_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const EXCLUDED_CATEGORY = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

function normName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function loadPublic(): PublicFile {
  const raw = JSON.parse(readFileSync(join(here, 'public.json'), 'utf8')) as PublicFile;
  return raw;
}

export function sizeMultiple(tvl: number, floor: number, model: ModelConstants): number {
  const ratio = Math.max(tvl, 1) / floor;
  const raw = ratio ** model.size_exponent;
  return Math.min(model.size_cap, Math.max(model.size_floor, raw));
}

export function growthOf(change: number | null, model: ModelConstants): { pct: number; mult: number } {
  const raw = change === null ? 0 : change;
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
  return { pct, mult: 1 + (pct / 100) * model.growth_weight };
}

export function tenureOf(age: number | null, model: ModelConstants): number {
  if (age === null) return model.unknown_tenure;
  const x = Math.min(Math.max(age, 0), model.tenure_cap_days) / model.tenure_peak_days;
  const up = Math.min(x, 1);
  const down = Math.max(0, x - 1);
  return Math.max(model.tenure_min, model.tenure_floor + up * model.tenure_rise - down * model.tenure_fade);
}

export function categoryOf(category: string | null, model: ModelConstants): number {
  if (category === null) return model.category_default;
  const found = model.category_multiples[category];
  return found === undefined ? model.category_default : found;
}

export function chainOf(count: number, model: ModelConstants): number {
  const extra = Math.min(model.chain_extra_cap, Math.max(count, 1) - 1);
  return 1 + extra * model.chain_step;
}

export function confidenceOf(change: number | null, model: ModelConstants): number {
  if (change === null) return model.unreported_confidence;
  if (change <= -35) return model.drawdown_35;
  if (change <= -20) return model.drawdown_20;
  return 1;
}

export function publicMultiplier(cls: PublicClass, audits: number, model: ModelConstants): number {
  if (cls === 'hacked') return model.hack_multiplier;
  if (cls === 'listed-stable') return model.listed_multiplier;
  if (cls === 'lookalike-honeypot') return model.honeypot_multiplier;
  if (cls === 'market-name') return model.market_multiplier;
  return audits >= 1 ? model.audit_multiplier : 1;
}

/** Why a pre-token protocol outside the watchlist is not ranked. */
function wrapperReason(p: SnapshotProtocol, parent: string | undefined): string | null {
  if (parent) return 'parent';
  if (p.category !== null && EXCLUDED_CATEGORY.has(p.category)) return 'category';
  if (VERSIONED.test(p.name)) return 'version';
  if (WRAP_WORD.test(p.name)) return 'wrapped-word';
  if (EXCHANGES.some((name) => p.name.startsWith(name))) return 'exchange';
  return null;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function compactUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(a)}`;
}

function boolText(value: boolean | null): string {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'no answer';
}

interface PublicRead {
  cls: PublicClass;
  note: string;
  audits: number;
  hacks: number;
  host: string | null;
  url: string | null;
}

function readPublic(p: SnapshotProtocol, pub: PublicFile): PublicRead {
  const info = pub.info[p.slug];
  const audits = info && typeof info.audits === 'number' ? info.audits : 0;
  const hacks = info && typeof info.hacks === 'number' ? info.hacks : 0;
  const hackNames = info && Array.isArray(info.hack_names) ? info.hack_names.filter((n) => typeof n === 'string') : [];
  const url = info && typeof info.url === 'string' ? info.url : null;
  const host = hostOf(url);
  const stable = pub.stable[p.slug];
  const market = pub.market[p.slug];
  const nameMatch = market !== undefined && normName(market.name) === normName(p.name);
  const security = nameMatch ? pub.security[p.slug] : undefined;
  const honeypot = security !== undefined && (security.goplus_honeypot === true || security.honeypot_is === true);

  const where = host ? ` Official host ${host}.` : '';
  let cls: PublicClass = 'unlisted';
  let note = `DefiLlama's snapshot records no token for ${p.name}.${audits > 0 ? ` Its protocol page lists ${audits} audit${audits === 1 ? '' : 's'}.` : ' Its protocol page lists no audit.'}${where}`;

  if (nameMatch && market) {
    const sec = security
      ? ` GoPlus is_honeypot=${boolText(security.goplus_honeypot)}; honeypot.is isHoneypot=${boolText(security.honeypot_is)}.`
      : ' No GoPlus or honeypot.is reading was returned for that chain.';
    note = `Dexscreener lists a token named ${market.name} (${market.symbol}) on ${market.chain ?? 'an unnamed chain'} with ${compactUsd(market.liquidity_usd)} of liquidity${market.address ? ` at ${market.address}` : ''}.${sec} The snapshot still records no token.`;
    cls = honeypot ? 'lookalike-honeypot' : 'market-name';
  }
  if (stable) {
    note = `DefiLlama stablecoins lists ${stable.symbol ?? stable.name ?? p.name}${stable.gecko_id ? ` (gecko ${stable.gecko_id})` : ''} with ${stable.circulating_usd === null ? 'no circulating figure' : `${compactUsd(stable.circulating_usd)} circulating`}. The snapshot still records no token.`;
    cls = 'listed-stable';
  }
  if (hacks > 0) {
    const names = hackNames.length > 0 ? hackNames.join(', ') : p.name;
    note = `DefiLlama's protocol page records ${hacks} hack${hacks === 1 ? '' : 's'} (${names}). ${note}`;
    cls = 'hacked';
  }
  return { cls, note, audits, hacks, host, url };
}

function feeFor(chains: string[], pub: PublicFile): { chain: string; fee: Fee | null } {
  for (const chain of chains) {
    const fee = pub.fee_by_chain[chain];
    if (fee && typeof fee.deposit_usd === 'number') return { chain, fee };
  }
  return { chain: chains[0] ?? 'its chain', fee: null };
}

function gasClause(kind: 'transfer' | 'swap' | 'deposit', chain: string, fee: Fee | null, units: PublicFile['gas_units']): string {
  if (!fee) return `the fee the wallet quotes on ${chain}, because the public fetch has no gas sample for ${chain}`;
  const amount = kind === 'transfer' ? fee.transfer_usd : kind === 'swap' ? fee.swap_usd : fee.deposit_usd;
  const unit = kind === 'transfer' ? units.transfer : kind === 'swap' ? units.swap : units.deposit;
  const rate = typeof fee.gwei === 'number' ? `${fee.gwei} gwei` : typeof fee.sat_per_vbyte === 'number' ? `${fee.sat_per_vbyte} sat/vB` : 'the sampled fee';
  const priced = amount < 0.01 ? 'under $0.01' : `about $${amount.toFixed(2)}`;
  return `${priced} on ${chain} (${rate}, ${unit} gas units, ${fee.source})`;
}

function capitalFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  if (tvl >= 20_000_000) return 50;
  return 25;
}

function holdFor(age: number | null): number {
  if (age === null || age < 120) return 45;
  if (age < 420) return 30;
  return 21;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string, host: string | null): string {
  const site = host ? `${p.name} (${host})` : p.name;
  const c = (p.category ?? '').toLowerCase();
  if (c === 'chain') return `Bond or delegate $${capital} with ${site} on ${chain} and keep the receipt in that wallet.`;
  if (c === 'payments') return `Fund a $${capital} balance on ${site} on ${chain} and send one payment to a second address you control.`;
  if (c.includes('lend') || c === 'cdp') return `Supply $${capital} of USDC to ${site} on ${chain} and keep the receipt in that wallet.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('farm')) return `Add $${capital} of liquidity to the deepest pool ${site} shows on ${chain}, and keep the position token.`;
  if (c.includes('restak') || c.includes('stak')) return `Restake or stake $${capital} through ${site} on ${chain} and keep the receipt.`;
  if (c.includes('deriv') || c.includes('basis') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin on ${site} on ${chain} and open one hedged position under 2x.`;
  if (c.includes('rwa') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a vault ${site} offers on ${chain} and keep the shares.`;
  if (c.includes('predict')) return `Fund $${capital} on ${site} and take one quoted market on ${chain}.`;
  if (c.includes('insur')) return `Buy $${capital} of cover from ${site} on ${chain} and keep the policy.`;
  return `Deposit $${capital} into ${site} on ${chain} and keep the position in that wallet.`;
}

function boundStep(text: string): string {
  let s = text.replace(/\s+/g, ' ').trim();
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Check the position the next day.`;
  return s;
}

function farmSteps(p: SnapshotProtocol, age: number | null, read: PublicRead, pub: PublicFile): string[] {
  const { chain, fee } = feeFor(p.chains, pub);
  const units = pub.gas_units;
  const capital = read.cls === 'hacked' ? Math.min(25, capitalFor(p.tvl_usd)) : capitalFor(p.tvl_usd);
  const hold = holdFor(age);
  const host = read.host;
  const site = read.url ?? (host ? host : 'the host on its DefiLlama page');
  const transfer = gasClause('transfer', chain, fee, units);
  const deposit = gasClause('deposit', chain, fee, units);
  const swap = gasClause('swap', chain, fee, units);
  const withdraw = gasClause('deposit', chain, fee, units);

  if (read.cls === 'hacked') {
    return [
      boundStep(`Do not deposit new money. ${read.note} Cost: $0. Time: 10 minutes to read that hack record before opening the app.`),
      boundStep(`If a balance is already there, withdraw it to a fresh wallet you control. Cost: ${withdraw}. Time: 15 minutes.`),
      boundStep(`Refuse any claim page that asks for a deposit first, and type ${site} yourself rather than following a reply. Cost: $0. Time: 5 minutes.`),
      boundStep(`If you still touch the app after that, cap the trial at $${capital} on ${chain}. Cost: $${capital} plus ${deposit}. Time: 20 minutes.`),
      boundStep(`Leave no approval sitting on the contract: revoke it the same day you withdraw. Cost: ${transfer}. Time: 10 minutes.`),
      boundStep(`Write the wallet, the hack name and the withdraw transaction in a log. Cost: $0. Time: 5 minutes.`),
    ];
  }

  if (read.cls === 'listed-stable' || read.cls === 'market-name' || read.cls === 'lookalike-honeypot') {
    const buy = read.cls === 'lookalike-honeypot'
      ? `Do not buy the same-name token. ${read.note}`
      : `Do not treat this as a token that has not launched. ${read.note}`;
    return [
      boundStep(`${buy} Cost: $0 to look the record up. Time: 10 minutes.`),
      boundStep(`Use a fresh wallet funded with a transfer, and keep the seed offline. Cost: ${transfer}. Time: 5 minutes.`),
      boundStep(`Only if you still want app activity, ${actionFor(p, capital, chain, host)} Cost: $${capital} of capital plus ${deposit}. Time: 20 minutes.`),
      boundStep(`Do not add to a pool other than the one the official host links. Cost: $0 to compare the address with the host. Time: 10 minutes.`),
      boundStep(`Hold any app position ${hold} days, then withdraw if TVL is 25% under the snapshot's ${compactUsd(p.tvl_usd)}. Cost: the $${capital} stays in until then, plus ${withdraw} to leave. Time: ${hold} days, then 15 minutes.`),
      boundStep(`Log the wallet, the pool address and the dates. Cost: $0. Time: 5 minutes.`),
    ];
  }

  return [
    boundStep(`Use a fresh wallet and send only the farming funds to it. Cost: ${transfer}. Time: 5 minutes.`),
    boundStep(`${actionFor(p, capital, chain, host)} Cost: $${capital} of capital plus ${deposit}. Time: 20 minutes.`),
    boundStep(`Once a week, do one more small action on ${site}: a swap, a repay, or a deposit of at least $10. Cost: ${swap} each week. Time: 10 minutes a week.`),
    boundStep(`Hold the position at least ${hold} days so the activity spans more than one snapshot. Cost: the $${capital} stays in the position and there is no extra fee to wait. Time: ${hold} days.`),
    boundStep(`Withdraw if TVL prints 25% under the snapshot figure of ${compactUsd(p.tvl_usd)}, and claim only on ${site}. Cost: ${withdraw}. Time: 15 minutes.`),
    boundStep(`Write the wallet, the host and every transaction into a farm log before you reuse the address. Cost: $0. Time: 5 minutes.`),
  ];
}

function factorsFor(p: SnapshotProtocol, age: number | null, cls: PublicClass, audits: number, snapshot: Snapshot, model: ModelConstants): Factors {
  const growth = growthOf(p.change_7d, model);
  return {
    size_multiple: round4(sizeMultiple(p.tvl_usd, snapshot.floor_usd, model)),
    growth_pct: round4(growth.pct),
    growth_multiplier: round4(growth.mult),
    tenure_multiplier: round4(tenureOf(age, model)),
    category_multiplier: round4(categoryOf(p.category, model)),
    chain_multiplier: round4(chainOf(p.chains.length, model)),
    confidence_multiplier: round4(confidenceOf(p.change_7d, model)),
    public_multiplier: round4(publicMultiplier(cls, audits, model)),
  };
}

export function impliedFrom(p: SnapshotProtocol, age: number | null, cls: PublicClass, audits: number, snapshot: Snapshot, model: ModelConstants): number {
  const f = factorsFor(p, age, cls, audits, snapshot, model);
  const base = p.tvl_usd * model.base_multiple * f.size_multiple;
  const raw = base * f.growth_multiplier * f.tenure_multiplier * f.category_multiplier * f.chain_multiplier * f.confidence_multiplier * f.public_multiplier;
  return Math.max(1, Math.round(raw));
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const pub = loadPublic();
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  let setAsideChild = 0;
  let setAsideWrapper = 0;
  let liveOnRecord = 0;

  for (const slug of snapshot.watchlist) {
    const p = snapshot.protocols.find((row) => row.slug === slug);
    if (p) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) {
      liveOnRecord += 1;
      continue;
    }
    if (chosen.has(p.slug)) continue;
    const reason = wrapperReason(p, pub.parent[p.slug]);
    if (reason === 'parent') {
      setAsideChild += 1;
      continue;
    }
    if (reason !== null) {
      setAsideWrapper += 1;
      continue;
    }
    chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const read = readPublic(p, pub);
    const factors = factorsFor(p, age, read.cls, read.audits, snapshot, model);
    const implied = impliedFrom(p, age, read.cls, read.audits, snapshot, model);
    return { p, age, read, factors, implied };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watch.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    public_class: s.read.cls,
    public_note: s.read.note,
    audits: s.read.audits,
    hacks: s.read.hacks,
    host: s.read.host,
    factors: s.factors,
    farm_steps: farmSteps(s.p, s.age, s.read, pub),
  }));

  const live = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));

  const countClass = (cls: PublicClass) => board.filter((row) => row.public_class === cls).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    fetched_at: pub.fetched_at,
    model,
    model_version: MODEL_VERSION,
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      board: board.length,
      early: board.filter((row) => !row.watchlist).length,
      set_aside_child: setAsideChild,
      set_aside_wrapper: setAsideWrapper,
      live_on_record: liveOnRecord,
      hacked: countClass('hacked'),
      listed_stable: countClass('listed-stable'),
      market_name: countClass('market-name') + countClass('lookalike-honeypot'),
    },
    rows: board.map((row) => ({
      rank: row.rank,
      slug: row.slug,
      name: row.name,
      category: row.category,
      chains: row.chains,
      tvl_usd: row.tvl_usd,
      change_7d: row.change_7d,
      listed_at: row.listed_at,
      age_days: row.age_days,
      implied_value_usd: row.implied_value_usd,
      watchlist: row.watchlist,
      public_class: row.public_class,
      public_note: row.public_note,
      audits: row.audits,
      hacks: row.hacks,
      host: row.host,
      factors: row.factors,
      farm_steps: row.farm_steps,
    })),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board length ${board.length}`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `missing watchlist ${missing.slice(0, 5).join(', ')}`;
  if (slugs.size !== board.length) return 'duplicate slug';
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${i + 1} outranks rank ${i}`;
  if (byRank.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) return 'every implied value is the same';
  for (const r of board) {
    if (!r.name) return `${r.slug} has an empty name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} implied ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} steps`;
    for (const step of r.farm_steps) {
      const t = step.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} step length ${t.length}`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
