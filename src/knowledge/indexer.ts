import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { KnowledgeChunk, KnowledgeIndex } from './types.js';

const ALLOWED_EXT = new Set(['.md', '.txt']);

async function listFilesRecursively(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listFilesRecursively(fullPath)));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}
	return files;
}

function toChunks(sourcePath: string, content: string): KnowledgeChunk[] {
	const normalized = content.replace(/\r\n/g, '\n').trim();
	if (normalized.length === 0) return [];

	const rawParts = normalized
		.split(/\n\s*\n+/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

	const chunks: KnowledgeChunk[] = [];
	let partIndex = 0;
	for (const part of rawParts) {
		partIndex += 1;
		chunks.push({
			id: `${sourcePath}#${partIndex}`,
			sourcePath,
			text: part,
		});
	}
	return chunks;
}

export async function buildKnowledgeIndex(knowledgeDir: string): Promise<KnowledgeIndex> {
	let stat;
	try {
		stat = await fs.stat(knowledgeDir);
	} catch {
		return { chunks: [], builtAt: Date.now() };
	}

	if (!stat.isDirectory()) return { chunks: [], builtAt: Date.now() };

	const files = (await listFilesRecursively(knowledgeDir)).filter((p) => ALLOWED_EXT.has(path.extname(p).toLowerCase()));
	const chunks: KnowledgeChunk[] = [];

	for (const filePath of files) {
		const content = await fs.readFile(filePath, 'utf8');
		chunks.push(...toChunks(path.relative(process.cwd(), filePath), content));
	}

	return { chunks, builtAt: Date.now() };
}
