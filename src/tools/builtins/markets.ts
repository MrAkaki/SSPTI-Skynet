import type { LoadedTool, ToolContext } from '../toolConfig.js';

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

function requireJaniceApiKey(ctx: ToolContext): string {
	const apiKey = (ctx.env.JANICE_API_KEY ?? '').trim();
	if (!apiKey) throw new Error('Missing JANICE_API_KEY (required by Janice API)');
	return apiKey;
}

async function janiceGetJson(ctx: ToolContext, url: string): Promise<unknown> {
	const apiKey = requireJaniceApiKey(ctx);
	const res = await ctx.fetch(url, {
		method: 'GET',
		headers: {
			accept: 'application/json',
			'X-ApiKey': apiKey,
		},
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
				throw new Error(`Janice markets HTTP ${res.status}${msg ? `: ${msg}` : ''}`);
			}
		}
		throw new Error(`Janice markets HTTP ${res.status}: ${text.slice(0, 500)}`);
	}

	if (contentType.includes('application/json')) return tryParseJson(text) ?? text;
	return text;
}

async function runJaniceMarkets(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
	const marketId = asOptionalInt(args.marketId ?? (args as any).id);
	if (marketId !== undefined) {
		ctx.log(`[JaniceMarkets] fetching marketId=${marketId}`);
		return janiceGetJson(ctx, `https://janice.e-351.com/api/rest/v2/markets/${encodeURIComponent(String(marketId))}`);
	}

	ctx.log('[JaniceMarkets] fetching all markets');
	return janiceGetJson(ctx, 'https://janice.e-351.com/api/rest/v2/markets');
}

export const janiceMarketsTool: LoadedTool = {
	name: 'JaniceMarkets',
	description: 'Fetch Janice market list or a single market by id (args.marketId)',
	run: runJaniceMarkets,
};
