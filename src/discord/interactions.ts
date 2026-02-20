import type { Client } from 'discord.js';

export function registerInteractionHandlers(client: Client): void {
	client.on('interactionCreate', async (interaction) => {
		if (!interaction.isChatInputCommand()) return;
		// No slash commands currently.
	});
}
