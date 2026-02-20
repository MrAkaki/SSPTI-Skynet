import { config } from './config.js';
import type { KnowledgeIndex } from './knowledge/types.js';
import { buildKnowledgeIndex } from './knowledge/indexer.js';
import type { LoadedTool } from './tools/toolConfig.js';
import { builtinTools } from './tools/builtinTools.js';
import type { CorpConfig } from './corpConfig.js';
import { loadCorpConfig } from './corpConfig.js';

export interface AppState {
	knowledge: KnowledgeIndex;
	jsTools: LoadedTool[];
	corp: CorpConfig;
}

export const state: AppState = {
	knowledge: { chunks: [], builtAt: 0 },
	jsTools: [],
	corp: { discord: { channels: {}, roles: {}, users: {}, recruiters: {} } },
};

export async function reindexKnowledge(): Promise<void> {
	state.corp = await loadCorpConfig(config.corp.configPath);
	state.knowledge = await buildKnowledgeIndex(config.knowledge.dir);
	state.jsTools = builtinTools;
}
