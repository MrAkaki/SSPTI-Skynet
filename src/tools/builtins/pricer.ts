import type { LoadedTool, ToolContext } from '../toolConfig.js';

function asNonEmptyString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const t = value.trim();
	return t.length > 0 ? t : null;
}

function asOptionalInt(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const n = Number(trimmed);
		if (Number.isFinite(n)) return Math.trunc(n);
	}
	return undefined;
}

function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

type JaniceMarket = { id?: number; name?: string | null };

let cachedMarkets: { fetchedAtMs: number; markets: JaniceMarket[] } | null = null;
const MARKETS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchMarkets(ctx: ToolContext): Promise<JaniceMarket[]> {
	const now = Date.now();
	if (cachedMarkets && now - cachedMarkets.fetchedAtMs < MARKETS_CACHE_TTL_MS) return cachedMarkets.markets;

	const apiKey = (ctx.env.JANICE_API_KEY ?? '').trim();
	if (!apiKey) throw new Error('Missing JANICE_API_KEY (required by Janice API)');

	const res = await ctx.fetch('https://janice.e-351.com/api/rest/v2/markets', {
		method: 'GET',
		headers: {
			accept: 'application/json',
			'X-ApiKey': apiKey,
		},
	});

	const contentType = res.headers.get('content-type') ?? '';
	const text = await res.text();
	if (!res.ok) throw new Error(`Janice markets HTTP ${res.status}: ${text.slice(0, 500)}`);
	if (!contentType.includes('application/json')) throw new Error('Janice markets: expected JSON response');

	const json = tryParseJson(text);
	const markets = Array.isArray(json) ? (json as JaniceMarket[]) : [];
	cachedMarkets = { fetchedAtMs: now, markets };
	return markets;
}

async function parseMarketId(value: unknown, ctx: ToolContext): Promise<number | undefined> {
	const asInt = asOptionalInt(value);
	if (asInt !== undefined) return asInt;
	if (typeof value === 'string') {
		const v = value.trim().toLowerCase();
		if (!v) return undefined;
		// Janice Swagger default: 2 (Jita)
		if (v === 'jita') return 2;

		const markets = await fetchMarkets(ctx);
		const exact = markets.find((m) => typeof m.name === 'string' && m.name.trim().toLowerCase() === v);
		if (exact && typeof exact.id === 'number' && Number.isFinite(exact.id)) return Math.trunc(exact.id);
	}
	return undefined;
}

async function runPricer(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
	const items = asNonEmptyString(args.items) ?? asNonEmptyString(args.text) ?? asNonEmptyString((args as any).item) ?? '';
	if (!items) throw new Error('Missing args.items (string). You can also pass args.item for a single item.');

	const marketArg = args.market;
	const market = marketArg === undefined ? 2 : await parseMarketId(marketArg, ctx);
	if (market === undefined) {
		throw new Error('Invalid args.market. Use a numeric market id (e.g. 2) or a market name (e.g. "Jita", "Dodixie").');
	}
	const qs = new URLSearchParams();
	qs.set('market', String(market));
	const url = `https://janice.e-351.com/api/rest/v2/pricer?${qs.toString()}`;
	const headers: Record<string, string> = {
		'content-type': 'text/plain; charset=utf-8',
		accept: 'application/json',
	};

	// Swagger security scheme: ApiKey in header "X-ApiKey"
	const apiKey = (ctx.env.JANICE_API_KEY ?? '').trim();
	if (!apiKey) throw new Error('Missing JANICE_API_KEY (required by Janice API)');
	headers['X-ApiKey'] = apiKey;

	ctx.log(`[Pricer] pricing ${items.split('\n').filter(Boolean).length} lines market=${market}`);

	const res = await ctx.fetch(url, {
		method: 'POST',
		headers,
		body: items,
	});

	const contentType = res.headers.get('content-type') ?? '';
	const text = await res.text();
	if (!res.ok) {
		if (contentType.includes('application/json')) {
			const json = tryParseJson(text) as any;
			if (json && typeof json === 'object') {
				const title = typeof json.title === 'string' ? json.title : undefined;
				const detail = typeof json.detail === 'string' ? json.detail : undefined;
				const msg = [title, detail].filter(Boolean).join(': ');
				throw new Error(`Janice pricer HTTP ${res.status}${msg ? `: ${msg}` : ''}`);
			}
		}
		throw new Error(`Janice pricer HTTP ${res.status}: ${text.slice(0, 500)}`);
	}

	if (contentType.includes('application/json')) return tryParseJson(text) ?? text;
	return text;
}

export const pricerTool: LoadedTool = {
	name: 'Pricer',
	description: 'Price items via Janice pricer API',
	run: runPricer,
};
