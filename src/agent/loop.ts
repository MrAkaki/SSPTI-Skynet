import { llama } from '../llama/client.js';
import type { OpenAIChatMessage } from '../llama/openaiTypes.js';
import { state } from '../state.js';
import type { ToolCall } from '../tools/registry.js';
import { runTool } from '../tools/registry.js';
import type { Intent } from '../intent.js';
import { loadSystemPromptTemplate, renderSystemPrompt } from '../prompts/systemPrompt.js';

interface AgentResult {
	answer: string;
	sources: string[];
}

async function toolPolicyText(intent?: Intent): Promise<string> {
	const externalToolNames = [...state.jsTools.map((t) => t.name)];
	const toolsList = ['search_knowledge', ...externalToolNames].filter((v, i, a) => a.indexOf(v) === i).join(', ');
	const channelKeys = Object.keys(state.corp.discord.channels ?? {}).map((k) => k.trim()).filter((k) => k.length > 0);
	const channelHint = channelKeys.length > 0 ? `Available channel tags: ${channelKeys.map((k) => `#${k}`).join(', ')}` : '';
	const template = await loadSystemPromptTemplate(intent);
	const base = renderSystemPrompt(template, { channelHint });

	const toolBlock =
		'You may use ONE tool call to retrieve information.\n' +
		`Available tools: ${toolsList}\n` +
		'To use a tool, respond ONLY with a JSON object exactly like: {"tool":"<tool_name>","args":{...}}\n' +
		'If you do not need the tool, respond normally with the final answer text.\n' +
		'Never wrap JSON in markdown. Never include extra keys.';

	return base.trim().length > 0 ? `${base}\n${toolBlock}` : toolBlock;
}

function tryParseToolCall(text: string): ToolCall | null {
	// Primary: strict single JSON object, e.g. {"tool":"search_knowledge","args":{"query":"...","topK":5}}
	const trimmed = text.trim();

	const tryParseObject = (raw: string): ToolCall | null => {
		try {
			const parsed = JSON.parse(raw) as unknown;
			if (!parsed || typeof parsed !== 'object') return null;
			const tool = (parsed as any).tool;
			const args = (parsed as any).args;
			if (typeof tool !== 'string' || tool.trim().length === 0) return null;
			if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
			return { tool: tool.trim(), args };
		} catch {
			return null;
		}
	};

	if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
		const strict = tryParseObject(trimmed);
		if (strict) return strict;
	}

	// Secondary: extract JSON from fenced code blocks (```json ...```)
	const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	if (fenceMatch?.[1]) {
		const inside = fenceMatch[1].trim();
		if (inside.startsWith('{') && inside.endsWith('}')) {
			const fenced = tryParseObject(inside);
			if (fenced) return fenced;
		}
	}

	// Tertiary: scan the text for the first JSON object that parses into {tool,args}.
	// This allows the model to (incorrectly) prepend explanatory text without leaking it to Discord.
	const s = trimmed;
	let inString = false;
	let escape = false;
	let depth = 0;
	let start = -1;
	for (let i = 0; i < s.length; i += 1) {
		const ch = s[i];
		if (escape) {
			escape = false;
			continue;
		}
		if (ch === '\\' && inString) {
			escape = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;

		if (ch === '{') {
			if (depth === 0) start = i;
			depth += 1;
			continue;
		}
		if (ch === '}') {
			if (depth === 0) continue;
			depth -= 1;
			if (depth === 0 && start >= 0) {
				const candidate = s.slice(start, i + 1).trim();
				const parsed = tryParseObject(candidate);
				if (parsed) return parsed;
				start = -1;
			}
		}
	}

	return null;
}

export async function runAgent(userPrompt: string, opts?: { signal?: AbortSignal; intent?: Intent }): Promise<AgentResult> {
	const intentLine = opts?.intent ? `Current intent: ${opts.intent}\n` : '';
	const policy = await toolPolicyText(opts?.intent);
	const system: OpenAIChatMessage = { role: 'system', content: intentLine + policy };

	const messages: OpenAIChatMessage[] = [
		system,
		{ role: 'user', content: userPrompt },
	];

	const sources = new Set<string>();
	for (let iteration = 0; iteration < 3; iteration += 1) {
		if (opts?.signal?.aborted) throw new Error('Request cancelled');
		const modelText = await llama.chat(messages, { signal: opts?.signal });
		const toolCall = tryParseToolCall(modelText);
		if (!toolCall) {
			return { answer: modelText.trim(), sources: Array.from(sources) };
		}

		if (opts?.signal?.aborted) throw new Error('Request cancelled');
		const toolResult = await runTool(toolCall);
		if (toolResult.ok && toolCall.tool === 'search_knowledge') {
			const hits = toolResult.result as Array<{ sourcePath: string; text: string; score: number }>;
			for (const hit of hits) sources.add(hit.sourcePath);
		}

		messages.push({ role: 'assistant', content: modelText });
		messages.push({
			role: 'user',
			content:
				`Tool result (${toolCall.tool}):\n` +
				`${JSON.stringify(toolResult.result)}\n\n` +
				'Use the tool results to answer the user. Include any important caveats.',
		});
	}

	return { answer: 'I had trouble completing that request (too many tool iterations). Try rephrasing.', sources: Array.from(sources) };
}
