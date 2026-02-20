# discord-llamacpp-bot

A minimal Discord bot that replies when mentioned (in allowlisted channels) by calling a local `llama.cpp` server, with a small “local docs search” tool backed by files in `./knowledge`.

## Setup

1) Install deps:

```bash
npm install
```

2) Create `.env` from `.env.example` and fill:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `LLAMA_BASE_URL`
- `ALLOWED_CHANNEL_IDS` (comma-separated channel IDs; leave empty to allow all)

Optional:

- `LOG_LEVEL` (debug/info/warn/error)
- `JANICE_API_KEY` (enables the built-in `Pricer` tool)
- `SHOW_SOURCES` (true/false; when true, appends knowledge source file names to replies)

3) Register slash commands (recommended for `GUILD_ID` in dev):

```bash
npm run register:commands
```

4) Start:

```bash
npm run dev
```

## Knowledge base

- Put `.md` / `.txt` files into `knowledge/`
- Restart the bot process to reload (the index builds on startup)

## Corporation Discord IDs

Discord channel IDs, role IDs, and user IDs are corporation-specific configuration (not “knowledge”).

- Copy `corpConfig.example.json` to `corpConfig.json`
- Fill in your IDs
- Optionally set `CORP_CONFIG_PATH` if you want a different filename/location

`corpConfig.json` is gitignored by default.

## Notes

- You must enable **Message Content Intent** for the bot in the Discord Developer Portal.
- Thread creation requires appropriate permissions (Create Public Threads / Create Private Threads depending on channel settings).
