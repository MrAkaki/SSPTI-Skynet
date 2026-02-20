import type { KnowledgeChunk, KnowledgeIndex } from './types.js';

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((t) => t.length >= 2);
}

function scoreChunk(queryTokens: Set<string>, chunk: KnowledgeChunk): number {
	const chunkTokens = tokenize(chunk.text);
	let score = 0;
	for (const token of chunkTokens) {
		if (queryTokens.has(token)) score += 1;
	}
	return score;
}

function applyHeuristicBoost(queryTokens: Set<string>, sourcePath: string, baseScore: number): number {
	if (baseScore <= 0) return baseScore;

	const joinish = queryTokens.has('join') || queryTokens.has('apply') || queryTokens.has('recruit') || queryTokens.has('recruiter') || queryTokens.has('interview');
	if (!joinish) return baseScore;

	const p = sourcePath.toLowerCase();
	if (p.includes('knowledge/corp/') && (p.includes('requirements') || p.includes('links'))) return baseScore + 5;
	if (p.includes('knowledge/alliance/')) return baseScore - 1;
	return baseScore;
}

export interface KnowledgeSearchResult {
	sourcePath: string;
	text: string;
	score: number;
}

export function searchKnowledge(index: KnowledgeIndex, query: string, topK: number): KnowledgeSearchResult[] {
	const tokens = new Set(tokenize(query));
	if (tokens.size === 0) return [];

	const scored = index.chunks
		.map((chunk) => ({
			sourcePath: chunk.sourcePath,
			text: chunk.text,
			score: applyHeuristicBoost(tokens, chunk.sourcePath, scoreChunk(tokens, chunk)),
		}))
		.filter((r) => r.score > 0)
		.sort((a, b) => b.score - a.score);

	return scored.slice(0, Math.max(1, topK));
}
