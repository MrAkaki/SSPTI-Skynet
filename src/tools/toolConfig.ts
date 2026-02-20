export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ToolSpec {
	name: string;
	description?: string;
	url: string;
	method?: HttpMethod;
	headers?: Record<string, string>;
	payload?: unknown;
	timeoutMs?: number;
}

export interface ToolConfigFile {
	tools: ToolSpec[];
}

export interface ToolContext {
	fetch: typeof fetch;
	env: NodeJS.ProcessEnv;
	log: (message: string) => void;
}

export interface LoadedTool {
	name: string;
	description?: string;
	run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}
