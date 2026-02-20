export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const levelOrder: Record<Exclude<LogLevel, 'silent'>, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

function normalizeLogLevel(raw: string | undefined): LogLevel {
	const v = (raw ?? '').trim().toLowerCase();
	if (!v) return 'info';
	if (v === 'silent' || v === 'none' || v === 'off') return 'silent';
	if (v === 'debug' || v === 'info' || v === 'warn' || v === 'warning' || v === 'error') {
		return v === 'warning' ? 'warn' : (v as LogLevel);
	}
	// numeric aliases
	// 10=debug, 20=info, 30=warn, 40=error
	const n = Number(v);
	if (Number.isFinite(n)) {
		if (n <= 10) return 'debug';
		if (n <= 20) return 'info';
		if (n <= 30) return 'warn';
		return 'error';
	}
	return 'info';
}

function nowIso(): string {
	return new Date().toISOString();
}

export interface Logger {
	level: LogLevel;
	debug: (message: string, meta?: Record<string, unknown>) => void;
	info: (message: string, meta?: Record<string, unknown>) => void;
	warn: (message: string, meta?: Record<string, unknown>) => void;
	error: (message: string, meta?: Record<string, unknown>) => void;
}

function format(level: Exclude<LogLevel, 'silent'>, message: string, meta?: Record<string, unknown>): string {
	const base = `[${nowIso()}] ${level.toUpperCase()} ${message}`;
	if (!meta || Object.keys(meta).length === 0) return base;
	try {
		return `${base} ${JSON.stringify(meta)}`;
	} catch {
		return base;
	}
}

export function createLogger(level: LogLevel): Logger {
	const threshold = level === 'silent' ? Number.POSITIVE_INFINITY : levelOrder[level];
	const enabled = (l: Exclude<LogLevel, 'silent'>) => levelOrder[l] >= threshold;

	return {
		level,
		debug: (message, meta) => {
			if (!enabled('debug')) return;
			console.log(format('debug', message, meta));
		},
		info: (message, meta) => {
			if (!enabled('info')) return;
			console.log(format('info', message, meta));
		},
		warn: (message, meta) => {
			if (!enabled('warn')) return;
			console.warn(format('warn', message, meta));
		},
		error: (message, meta) => {
			if (!enabled('error')) return;
			console.error(format('error', message, meta));
		},
	};
}

let singleton: Logger | null = null;

export function logger(): Logger {
	if (singleton) return singleton;
	singleton = createLogger(normalizeLogLevel(process.env.LOG_LEVEL));
	return singleton;
}
