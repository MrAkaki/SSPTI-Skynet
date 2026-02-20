import { promises as fs } from 'node:fs';

export interface CorpConfig {
	discord: {
		channels: Record<string, string>;
		roles: Record<string, string>;
		users: Record<string, string>;
		recruiters: Record<string, string>;
	};
}

const EMPTY: CorpConfig = {
	discord: {
		channels: {},
		roles: {},
		users: {},
		recruiters: {},
	},
};

function asStringRecord(value: unknown): Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (typeof v === 'string' && v.trim().length > 0) out[k] = v.trim();
	}
	return out;
}

export async function loadCorpConfig(filePath: string): Promise<CorpConfig> {
	const trimmed = filePath.trim();
	if (trimmed.length === 0) return EMPTY;

	let raw: string;
	try {
		raw = await fs.readFile(trimmed, 'utf8');
	} catch {
		return EMPTY;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid corp config JSON (${trimmed}): ${message}`);
	}

	const discord = (parsed as any)?.discord;
	const recruitersRaw = discord?.recruiters ?? discord?.recrutiers;
	return {
		discord: {
			channels: asStringRecord(discord?.channels),
			roles: asStringRecord(discord?.roles),
			users: asStringRecord(discord?.users),
			recruiters: asStringRecord(recruitersRaw),
		},
	};
}
