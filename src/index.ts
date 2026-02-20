import { Client, GatewayIntentBits, Partials, PermissionsBitField } from 'discord.js';
import { config } from './config.js';
import { registerInteractionHandlers } from './discord/interactions.js';
import { reindexKnowledge, state } from './state.js';
import { runAgent } from './agent/loop.js';
import { chunkForDiscord, normalizePlainLinks, stripBotMention } from './utils/text.js';
import { linkCorpMentions } from './utils/mentions.js';
import { startTypingLoop } from './utils/typing.js';
import { logger } from './utils/logger.js';
import { classifyIntentWithLLM } from './intent.js';

type ReplyChain = {
	rootReplyId: string;
	followupIds: string[];
	seq: number;
};

const replyChains = new Map<string, ReplyChain>();

type InFlight = {
	abort: AbortController;
	stopTyping: () => void;
};

const inFlight = new Map<string, InFlight>();

function isAllowedChannel(channelId: string): boolean {
	const allow = config.discord.allowedChannelIds;
	if (allow.size === 0) return true;
	return allow.has(channelId);
}

function allowlistKeyForMessage(message: import('discord.js').Message<true>): string {
	// If the message is in a thread, allowlist by its parent channel when available.
	const channel = message.channel;
	if (channel.isThread()) return channel.parentId ?? channel.id;
	return channel.id;
}

function buildInviteUrl(): string {
	const permissions = new PermissionsBitField([
		PermissionsBitField.Flags.ViewChannel,
		PermissionsBitField.Flags.SendMessages,
		PermissionsBitField.Flags.ReadMessageHistory,
		PermissionsBitField.Flags.SendMessagesInThreads,
	]);

	const params = new URLSearchParams({
		client_id: config.discord.clientId,
		scope: 'bot applications.commands',
		permissions: permissions.bitfield.toString(),
	});

	if (config.discord.guildId) {
		params.set('guild_id', config.discord.guildId);
		params.set('disable_guild_select', 'true');
	}

	return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

function sanitizeForLog(text: string, maxLen = 1200): string {
	const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxLen) return normalized;
	return `${normalized.slice(0, maxLen)}…`;
}

async function main(): Promise<void> {
	const log = logger();
	const client = new Client({
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
		partials: [Partials.Channel, Partials.Message],
	});

	registerInteractionHandlers(client);

	client.once('ready', async () => {
		log.info(`Logged in as ${client.user?.tag ?? '(unknown)'}`);
		log.info(`Invite URL: ${buildInviteUrl()}`);
		await reindexKnowledge().catch((err) => log.warn('Knowledge index build failed', { error: err instanceof Error ? err.message : String(err) }));
	});

	client.on('messageCreate', async (message) => {
		let stopTyping: (() => void) | undefined;
		try {
			if (!client.user) return;
			if (message.author.bot) return;
			if (!message.inGuild()) return;
			if (!isAllowedChannel(allowlistKeyForMessage(message))) return;

			const mentioned = message.mentions.users.has(client.user.id);
			if (!mentioned) return;

			log.info('User message received', {
				messageId: message.id,
				authorId: message.author.id,
				authorTag: message.author.tag,
				guildId: message.guildId,
				channelId: message.channelId,
				content: sanitizeForLog(message.content),
			});

			const prompt = stripBotMention(message.content, client.user.id);
			if (!prompt) return;

			stopTyping = startTypingLoop(message.channel);
			const abort = new AbortController();
			inFlight.set(message.id, { abort, stopTyping });

			const intent = await classifyIntentWithLLM(prompt, { signal: abort.signal });
			log.info('Intent selected', {
				messageId: message.id,
				intent,
				prompt: sanitizeForLog(prompt),
			});

			const { answer, sources } = await runAgent(prompt, { signal: abort.signal, intent });
			if (abort.signal.aborted) return;
			const full = config.bot.showSources && sources.length > 0 ? `${answer}\n\nSources: ${sources.join(', ')}` : answer;
			const parts = chunkForDiscord(normalizePlainLinks(full));
			const first = linkCorpMentions(parts[0] ?? '', state.corp);
			const rootReply = await message.reply({ content: first.content, allowedMentions: first.allowedMentions });
			const followupIds: string[] = [];
			for (const part of parts.slice(1)) {
				const next = linkCorpMentions(part, state.corp);
				const sent = await message.channel.send({ content: next.content, allowedMentions: next.allowedMentions });
				followupIds.push(sent.id);
			}

			replyChains.set(message.id, { rootReplyId: rootReply.id, followupIds, seq: 0 });
		} catch (err) {
			const text = err instanceof Error ? err.message : String(err);
			log.error('messageCreate error', { error: text });
			await message.reply(`Error: ${text}`.slice(0, 1900)).catch(() => undefined);
		} finally {
			inFlight.delete(message.id);
			stopTyping?.();
		}
	});

	client.on('messageUpdate', async (_oldMessage, newMessage) => {
		let stopTyping: (() => void) | undefined;
		try {
			if (!client.user) return;
			if (newMessage.author?.bot) return;
			if (!newMessage.inGuild()) return;
			if (!isAllowedChannel(allowlistKeyForMessage(newMessage))) return;

			const chain = replyChains.get(newMessage.id);
			if (!chain) return;

			// Abort any previous work for this message (edit supersedes it).
			const existing = inFlight.get(newMessage.id);
			if (existing) {
				existing.abort.abort();
				existing.stopTyping();
				inFlight.delete(newMessage.id);
			}

			// Make sure we have the latest content (messageUpdate can be partial).
			const resolved = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
			if (!resolved) return;

			log.info('User message updated', {
				messageId: resolved.id,
				authorId: resolved.author?.id,
				authorTag: resolved.author?.tag,
				guildId: resolved.guildId,
				channelId: resolved.channelId,
				content: sanitizeForLog(resolved.content ?? ''),
			});

			const prompt = stripBotMention(resolved.content ?? '', client.user.id);
			if (!prompt) return;

			// Sequence guard: only apply the latest edit.
			chain.seq += 1;
			const seq = chain.seq;
			const abort = new AbortController();

			stopTyping = startTypingLoop(resolved.channel);
			inFlight.set(resolved.id, { abort, stopTyping });
			const intent = await classifyIntentWithLLM(prompt, { signal: abort.signal });
			log.info('Intent selected', {
				messageId: resolved.id,
				intent,
				prompt: sanitizeForLog(prompt),
			});

			const { answer, sources } = await runAgent(prompt, { signal: abort.signal, intent });
			if (abort.signal.aborted) return;
			if (seq !== chain.seq) return;

			const full = config.bot.showSources && sources.length > 0 ? `${answer}\n\nSources: ${sources.join(', ')}` : answer;
			const parts = chunkForDiscord(normalizePlainLinks(full));

			const first = linkCorpMentions(parts[0] ?? '', state.corp);
			const channel = resolved.channel;

			// Edit the root reply if it still exists; otherwise create a new one.
			let rootMessage = await channel.messages.fetch(chain.rootReplyId).catch(() => null);
			if (!rootMessage) {
				const created = await resolved.reply({ content: first.content, allowedMentions: first.allowedMentions });
				chain.rootReplyId = created.id;
				rootMessage = created;
			} else {
				await rootMessage.edit({ content: first.content, allowedMentions: first.allowedMentions });
			}

			// Delete any previous followups.
			for (const id of chain.followupIds) {
				await channel.messages.delete(id).catch(() => undefined);
			}
			chain.followupIds = [];

			// Send new followups if needed.
			for (const part of parts.slice(1)) {
				const next = linkCorpMentions(part, state.corp);
				const sent = await channel.send({ content: next.content, allowedMentions: next.allowedMentions });
				chain.followupIds.push(sent.id);
			}
		} catch (err) {
			const text = err instanceof Error ? err.message : String(err);
			log.error('messageUpdate error', { error: text });
		} finally {
			inFlight.delete(newMessage.id);
			stopTyping?.();
		}
	});

	client.on('messageDelete', async (message) => {
		// If the triggering message is deleted while we are working, cancel the generation.
		const running = inFlight.get(message.id);
		if (running) {
			running.abort.abort();
			running.stopTyping();
			inFlight.delete(message.id);
		}
	});

	await client.login(config.discord.token);
}

main().catch((err) => {
	logger().error('Fatal error', { error: err instanceof Error ? err.message : String(err) });
	process.exitCode = 1;
});
