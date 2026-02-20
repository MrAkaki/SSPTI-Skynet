export interface KnowledgeChunk {
	id: string;
	sourcePath: string;
	text: string;
}

export interface KnowledgeIndex {
	chunks: KnowledgeChunk[];
	builtAt: number;
}
