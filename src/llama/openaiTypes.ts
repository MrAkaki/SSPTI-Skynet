export type OpenAIChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OpenAIChatMessage {
	role: OpenAIChatRole;
	content: string;
	name?: string;
}

export interface OpenAIChatCompletionRequest {
	model?: string;
	messages: OpenAIChatMessage[];
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
}

export interface OpenAIChatCompletionChoice {
	index: number;
	message: {
		role: 'assistant';
		content: string;
	};
	finish_reason: string | null;
}

export interface OpenAIChatCompletionResponse {
	id?: string;
	object?: string;
	created?: number;
	model?: string;
	choices: OpenAIChatCompletionChoice[];
}
