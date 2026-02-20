export type TypingChannel = {
	sendTyping: () => Promise<unknown>;
};

export function startTypingLoop(channel: TypingChannel, intervalMs = 8000): () => void {
	let stopped = false;

	const tick = () => {
		if (stopped) return;
		void channel.sendTyping().catch(() => undefined);
	};

	// Kick immediately, then keep alive.
	tick();
	const timer = setInterval(tick, intervalMs);

	return () => {
		if (stopped) return;
		stopped = true;
		clearInterval(timer);
	};
}
