import * as dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value || value.trim().length === 0) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

function optionalNumber(name: string, defaultValue: number): number {
	const raw = process.env[name];
	if (!raw || raw.trim().length === 0) return defaultValue;
	const value = Number(raw);
	if (!Number.isFinite(value)) throw new Error(`Invalid number for env var ${name}: ${raw}`);
	return value;
}

function optionalString(name: string): string | undefined {
	const value = process.env[name];
	if (!value || value.trim().length === 0) return undefined;
	return value;
}

function optionalBoolean(name: string, defaultValue: boolean): boolean {
	const raw = process.env[name];
	if (!raw || raw.trim().length === 0) return defaultValue;
	switch (raw.trim().toLowerCase()) {
		case '1':
		case 'true':
		case 'yes':
		case 'on':
			return true;
		case '0':
		case 'false':
		case 'no':
		case 'off':
			return false;
		default:
			return defaultValue;
	}
}

function csvToSet(raw: string | undefined): Set<string> {
	if (!raw) return new Set();
	const values = raw
		.split(',')
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
	return new Set(values);
}

export const config = {
	bot: {
		showSources: optionalBoolean('SHOW_SOURCES', false),
	},
	discord: {
		token: requireEnv('DISCORD_TOKEN'),
		clientId: requireEnv('CLIENT_ID'),
		guildId: optionalString('GUILD_ID'),
		allowedChannelIds: csvToSet(optionalString('ALLOWED_CHANNEL_IDS')),
	},
	corp: {
		configPath: optionalString('CORP_CONFIG_PATH') ?? 'corpConfig.json',
	},
	llama: {
		baseUrl: (optionalString('LLAMA_BASE_URL') ?? 'http://127.0.0.1:8080').replace(/\/$/, ''),
		apiKey: optionalString('LLAMA_API_KEY'),
		model: optionalString('LLAMA_MODEL'),
		temperature: optionalNumber('LLAMA_TEMPERATURE', 0.2),
		maxTokens: optionalNumber('LLAMA_MAX_TOKENS', 512),
	},
	knowledge: {
		dir: optionalString('KNOWLEDGE_DIR') ?? 'knowledge',
		topK: optionalNumber('KNOWLEDGE_TOP_K', 5),
	},
};
