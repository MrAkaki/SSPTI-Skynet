import { REST, Routes } from 'discord.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { commands } from './commands.js';

async function main(): Promise<void> {
	const log = logger();
	const rest = new REST({ version: '10' }).setToken(config.discord.token);

	if (config.discord.guildId) {
		await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), {
			body: commands,
		});
		log.info(`Registered ${commands.length} guild commands for ${config.discord.guildId}`);
		return;
	}

	await rest.put(Routes.applicationCommands(config.discord.clientId), { body: commands });
	log.info(`Registered ${commands.length} global commands`);
}

main().catch((err) => {
	logger().error('registerCommands failed', { error: err instanceof Error ? err.message : String(err) });
	process.exitCode = 1;
});
