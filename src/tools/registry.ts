import { config } from '../config.js';
import { state } from '../state.js';
import { searchKnowledge } from '../knowledge/search.js';
import type { LoadedTool, ToolContext } from './toolConfig.js';
import { logger } from '../utils/logger.js';

export interface ToolCall {
	tool: string;
	args: Record<string, unknown>;
}

export interface ToolResult {
	tool: string;
	ok: boolean;
	result: unknown;
}

function isToolLogEnabled(): boolean {
	// TOOL_LOG is kept for backwards-compatibility; prefer LOG_LEVEL.
	const raw = process.env.TOOL_LOG;
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

async function runJsTool(tool: LoadedTool, args: Record<string, unknown>): Promise<unknown> {
	const log = logger();
	const ctx: ToolContext = {
		fetch: globalThis.fetch,
		env: process.env,
		log: (m) => {
			if (!isToolLogEnabled()) return;
			log.info(m);
		},
	};
	return tool.run(args, ctx);
}

export async function runTool(call: ToolCall): Promise<ToolResult> {
	if (call.tool === 'search_knowledge') {
		const query = typeof call.args.query === 'string' ? call.args.query : '';
		const topK = typeof call.args.topK === 'number' && Number.isFinite(call.args.topK) ? call.args.topK : config.knowledge.topK;
		const hits = searchKnowledge(state.knowledge, query, topK);
		return { tool: call.tool, ok: true, result: hits };
	}

	const jsTool = state.jsTools.find((t) => t.name === call.tool);
	if (jsTool) {
		try {
			const result = await runJsTool(jsTool, call.args);
			return { tool: call.tool, ok: true, result };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { tool: call.tool, ok: false, result: { error: message } };
		}
	}

	return { tool: call.tool, ok: false, result: { error: `Unknown tool: ${call.tool}` } };
}
