import { llama } from './llama/client.js';

export type Intent = 'recruitment' | 'pvp' | 'pve' | 'mining' | 'chat';

function hasAny(text: string, patterns: RegExp[]): boolean {
	for (const re of patterns) {
		if (re.test(text)) return true;
	}
	return false;
}

export function classifyIntentHeuristic(userPrompt: string): Intent {
	const s = userPrompt.toLowerCase();

	const recruitment = [
		/\bjoin\b/, /\bjoining\b/, /\bapply\b/, /\bapplication\b/, /\brecruit\b/, /\brecruiter\b/, /\binterview\b/, /\bauth\b/, /\baudit\b/,
		/\bcharacter\b/, /\bservices\b/, /\bdiscord\b/, /\bhow do i join\b/,
	];

	const pvp = [
		/\bfleet\b/, /\bpvp\b/, /\bcta\b/, /\bstrat(op)?\b/, /\bdoctrine\b/, /\bfc\b/, /\broam\b/, /\bop\b/, /\bpaps?\b/, /\bsrp\b/,
		/\bfit\b/, /\bfittings\b/, /\bmuninn\b/, /\bferox\b/, /\blogi\b/, /\btackle\b/,
	];

	const pve = [
		/\bpve\b/, /\bratting\b/, /\bisk\b/, /\bincursions?\b/, /\babyss(al)?\b/, /\bmission\b/, /\banom\b/, /\bescalation\b/,
		/\bcarrier\b/, /\bsuper\b/, /\bsite\b/, /\bcrab\b/,
	];

	const mining = [
		/\bmining\b/, /\bminer\b/, /\bmined\b/, /\bore\b/, /\bveld(spar)?\b/, /\bveldspar\b/, /\bice\b/,
		/\bmoon\s*mining\b/, /\bmoon\b/, /\breaction(s)?\b/, /\brefin(e|ing|ery)\b/, /\byield\b/, /\bboost(s|er)?\b/,
		/\bporpoise\b/, /\borca\b/, /\bcompress(ion|ing)?\b/,
	];

	// Order matters: recruitment should win over everything.
	if (hasAny(s, recruitment)) return 'recruitment';
	if (hasAny(s, mining)) return 'mining';
	if (hasAny(s, pvp) && !hasAny(s, pve)) return 'pvp';
	if (hasAny(s, pve) && !hasAny(s, pvp)) return 'pve';
	if (hasAny(s, pvp) && hasAny(s, pve)) return 'pvp';
	return 'chat';
}

function extractIntent(text: string): Intent | null {
	const s = text.trim().toLowerCase();
	if (s === 'recruitment' || s === 'pvp' || s === 'pve' || s === 'mining' || s === 'chat') return s;
	const match = s.match(/\b(recruitment|pvp|pve|mining|chat)\b/);
	return (match?.[1] as Intent | undefined) ?? null;
}

export async function classifyIntentWithLLM(userPrompt: string, opts?: { signal?: AbortSignal }): Promise<Intent> {
	const system =
		'You are a strict intent classifier for an EVE Online Discord bot.\n' +
		'Choose exactly ONE intent from this list: recruitment, pvp, pve, mining, chat.\n' +
		'Answer with ONLY the intent id (one word), lowercase. No punctuation. No extra text.';

	try {
		const raw = await llama.chat(
			[
				{ role: 'system', content: system },
				{ role: 'user', content: userPrompt },
			],
			{ signal: opts?.signal }
		);
		const parsed = extractIntent(raw);
		if (parsed) return parsed;
	} catch {
		// fall through to heuristic
	}

	return classifyIntentHeuristic(userPrompt);
}
