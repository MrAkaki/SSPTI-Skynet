import { config } from '../config.js';
import type { OpenAIChatCompletionRequest, OpenAIChatCompletionResponse, OpenAIChatMessage } from './openaiTypes.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 120_000;

let requestSeq = 0;

function isLogEnabled(): boolean {
	const raw = process.env.LLM_LOG;
	if (!raw || raw.trim().length === 0) return true;
	switch (raw.trim().toLowerCase()) {
		case '0':
		case 'false':
		case 'off':
		case 'no':
			return false;
		default:
			return true;
	}
}

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return `${text.slice(0, maxLen)}…`;
}

function summarizeMessages(messages: OpenAIChatMessage[], maxPerMsg = 220, maxMsgs = 12): string {
	const shown = messages.slice(0, maxMsgs).map((m) => {
		const name = m.name ? `(${m.name})` : '';
		const content = truncate((m.content ?? '').replace(/\s+/g, ' ').trim(), maxPerMsg);
		return `${m.role}${name}: ${content}`;
	});
	const suffix = messages.length > maxMsgs ? ` | +${messages.length - maxMsgs} more` : '';
	return shown.join(' | ') + suffix;
}

export class LlamaClient {
	constructor(private readonly baseUrl: string) {}

	async chat(messages: OpenAIChatMessage[], opts?: { signal?: AbortSignal }): Promise<string> {
		const log = logger();
		const requestId = (requestSeq += 1);
		const url = `${this.baseUrl}/v1/chat/completions`;
		const body: OpenAIChatCompletionRequest = {
			model: config.llama.model,
			messages,
			temperature: config.llama.temperature,
			max_tokens: config.llama.maxTokens,
			stream: false,
		};

		const startMs = Date.now();
		if (isLogEnabled()) {
			log.debug(`[llm#${requestId}] -> ${url}`, {
				model: body.model ?? '(default)',
				temperature: body.temperature ?? '(default)',
				max_tokens: body.max_tokens ?? '(default)',
				msgs: messages.length,
			});
			log.debug(`[llm#${requestId}] prompt`, { prompt: summarizeMessages(messages) });
		}

		const controller = new AbortController();
		const externalSignal = opts?.signal;
		const onAbort = () => controller.abort();
		if (externalSignal) {
			if (externalSignal.aborted) controller.abort();
			else externalSignal.addEventListener('abort', onAbort, { once: true });
		}
		const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
		try {
			const headers: Record<string, string> = {
				'content-type': 'application/json',
			};
			if (config.llama.apiKey) headers.authorization = `Bearer ${config.llama.apiKey}`;

			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			if (!response.ok) {
				const text = await response.text().catch(() => '');
				if (isLogEnabled()) {
					log.warn(`[llm#${requestId}] <- HTTP ${response.status} ${response.statusText}`, { ms: Date.now() - startMs });
					if (text) log.debug(`[llm#${requestId}] error body`, { body: truncate(text, 800) });
				}
				throw new Error(`llama.cpp HTTP ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
			}

			const data = (await response.json()) as OpenAIChatCompletionResponse;
			const content = data.choices?.[0]?.message?.content;
			if (!content) throw new Error('llama.cpp response missing choices[0].message.content');
			if (isLogEnabled()) {
				log.debug(`[llm#${requestId}] <- ok`, { ms: Date.now() - startMs, chars: content.length });
				log.debug(`[llm#${requestId}] response`, { text: truncate(content.replace(/\s+/g, ' ').trim(), 800) });
			}
			return content;
		} catch (err) {
			if (isLogEnabled() && err instanceof Error && err.name === 'AbortError') {
				log.warn(`[llm#${requestId}] <- timeout`, { ms: Date.now() - startMs });
			}
			throw err;
		} finally {
			clearTimeout(timeout);
			if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
		}
	}
}

export const llama = new LlamaClient(config.llama.baseUrl);
