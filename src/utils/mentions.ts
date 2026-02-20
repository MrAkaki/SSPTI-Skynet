import type { CorpConfig } from '../corpConfig.js';

export interface MentionRewrite {
	content: string;
	allowedMentions: {
		repliedUser?: boolean;
		roles?: string[];
		users?: string[];
	};
}

function replaceAll(content: string, patterns: Array<{ re: RegExp; replacement: string }>): string {
	let out = content;
	for (const { re, replacement } of patterns) {
		out = out.replace(re, replacement);
	}
	return out;
}

export function linkCorpMentions(content: string, corp: CorpConfig): MentionRewrite {
	// Safety net: never emit hallucinated role mentions.
	const safeContent = content.replace(/@unknown-role\b/gi, 'a recruiter');

	const roles = corp.discord.roles;
	const channels = corp.discord.channels;
	const recruiters = corp.discord.recruiters;

	const patterns: Array<{ re: RegExp; replacement: string }> = [];

	// Roles: dynamically link any configured role key.
	// Supported tokens per role:
	// - @<key> (e.g. @fleetCommander)
	// - @<Humanized Key> (e.g. @Fleet Commander)
	const humanize = (key: string) => {
		const base = key
			.replace(/[_-]+/g, ' ')
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.trim();
		return base.replace(/\b\w/g, (c) => c.toUpperCase());
	};

	for (const [key, id] of Object.entries(roles)) {
		const trimmedKey = key.trim();
		const trimmedId = id.trim();
		if (trimmedKey.length === 0 || trimmedId.length === 0) continue;

		const escapedKey = trimmedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		patterns.push({ re: new RegExp(`@${escapedKey}(?=$|[^\\w])`, 'gi'), replacement: `<@&${trimmedId}>` });

		const human = humanize(trimmedKey);
		const words = human.split(/\s+/).filter((w) => w.length > 0);
		if (words.length > 0) {
			const escapedWords = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
			patterns.push({ re: new RegExp(`@${escapedWords.join('\\s*')}(?=$|[^\\w])`, 'gi'), replacement: `<@&${trimmedId}>` });
		}

		// Director is often pluralized.
		if (trimmedKey.toLowerCase() === 'director') {
			patterns.push({ re: /@Directors\b/gi, replacement: `<@&${trimmedId}>` });
		}
	}

	// Channels: dynamically link any configured channel key (e.g. #pvp, #hauling, #recruiting)
	for (const [key, id] of Object.entries(channels)) {
		const trimmedKey = key.trim();
		const trimmedId = id.trim();
		if (trimmedKey.length === 0 || trimmedId.length === 0) continue;
		const escaped = trimmedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		patterns.push({
			re: new RegExp(`#${escaped}(?=$|[^\\w])`, 'gi'),
			replacement: `<#${trimmedId}>`,
		});
	}

	for (const [name, id] of Object.entries(recruiters)) {
		const trimmedName = name.trim();
		const trimmedId = id.trim();
		if (trimmedName.length === 0 || trimmedId.length === 0) continue;

		const escaped = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		patterns.push(
			// Matches: @MrAkaki
			{ re: new RegExp(`@${escaped}\\b`, 'gi'), replacement: `<@${trimmedId}>` },
			// Matches: @[SSPTI] MrAkaki OR @[SSPTI] - MrAkaki
			{ re: new RegExp(`@\\[SSPTI\\]\\s*(?:-\\s*)?${escaped}\\b`, 'gi'), replacement: `<@${trimmedId}>` }
		);
	}

	const rewritten = replaceAll(safeContent, patterns);

	// Lock down which role mentions are allowed to actually ping (configured roles only).
	const allowedRoleIds = Object.values(roles).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
	const allowedUserIds = Object.values(recruiters).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

	return {
		content: rewritten,
		allowedMentions: {
			repliedUser: false,
			roles: allowedRoleIds,
			users: allowedUserIds,
		},
	};
}
