import { promises as fs } from 'node:fs';
import type { Intent } from '../intent.js';

export interface SystemPromptTemplate {
	lines: string[];
}

const DEFAULT_TEMPLATE: SystemPromptTemplate = {
	lines: [
		'You are a Discord bot acting as a corporation Director for Suspicious Intentions (SSTPI).',
		'Your job is to provide useful, specific answers about corp/alliance rules, requirements, links, services, and onboarding.',
		'Respond about joining the corporation (Suspicious Intentions) first; alliance setup comes after you are accepted.',
		'For recruitment/onboarding questions, use the exact step-by-step process from the knowledge base (auth dashboard -> Character Audit -> Add Character -> Services -> add Discord -> DM recruiter -> interview).',
		'When referring to Discord roles, use these exact tokens so they can be linked: @Recruiting Officer, @Director.',
		'When referring to Discord channels, use #<key> where <key> is the channel key from corp config.',
		'{{channelHint}}',
		'Never invent role mentions (e.g. do not output @unknown-role). If you can’t point to a specific role/user from knowledge, say "DM a recruiter" without tagging.',
		'If a question is corp/alliance-specific (rules/links/requirements/PAPs/SIGs/how to join), ALWAYS call the search_knowledge tool first.',
		'If the knowledge base does not contain the answer, say what you do know and tell the user to DM a @Director.',
		'You may be a bit stern/sarcastic sometimes, but do not use slurs, hate, threats, or targeted harassment.',
		'Link always in plain text.',
	],
};

const cacheByPath = new Map<string, Promise<SystemPromptTemplate>>();

function asTemplate(value: unknown): SystemPromptTemplate | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const lines = (value as any).lines;
	if (!Array.isArray(lines)) return null;
	const normalized = lines.filter((v) => typeof v === 'string').map((v) => v.trimEnd());
	if (normalized.length === 0) return null;
	return { lines: normalized };
}

function resolvePromptPath(intent?: Intent): string {
	const forced = process.env.SYSTEM_PROMPT_PATH;
	if (forced && forced.trim().length > 0) return forced.trim();
	if (intent) return `prompts/systemPrompt.${intent}.json`;
	return 'prompts/systemPrompt.json';
}

async function readTemplate(path: string): Promise<SystemPromptTemplate> {
	try {
		const raw = await fs.readFile(path, 'utf8');
		const parsed = JSON.parse(raw) as unknown;
		return asTemplate(parsed) ?? DEFAULT_TEMPLATE;
	} catch {
		return DEFAULT_TEMPLATE;
	}
}

export async function loadSystemPromptTemplate(intent?: Intent): Promise<SystemPromptTemplate> {
	const primary = resolvePromptPath(intent);
	const fallback = 'prompts/systemPrompt.json';

	const ensure = (path: string) => {
		let cached = cacheByPath.get(path);
		if (!cached) {
			cached = readTemplate(path);
			cacheByPath.set(path, cached);
		}
		return cached;
	};

	const template = await ensure(primary);
	// If intent-specific file is missing/invalid and returned default, try base file once.
	if (primary !== fallback && template === DEFAULT_TEMPLATE) return ensure(fallback);
	return template;
}

function renderLine(line: string, vars: Record<string, string>): string {
	return line.replace(/\{\{(\w+)\}\}/g, (_m, key) => vars[key] ?? '');
}

export function renderSystemPrompt(template: SystemPromptTemplate, vars: Record<string, string>): string {
	const rendered = template.lines
		.map((l) => renderLine(l, vars).trim())
		.filter((l) => l.length > 0);
	return rendered.join('\n');
}
