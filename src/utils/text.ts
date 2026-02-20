export function chunkForDiscord(text: string, maxLen = 1900): string[] {
	const normalized = text.replace(/\r\n/g, '\n');
	if (normalized.length <= maxLen) return [normalized];

	const parts: string[] = [];
	let remaining = normalized;
	while (remaining.length > maxLen) {
		let cut = remaining.lastIndexOf('\n', maxLen);
		if (cut < Math.floor(maxLen * 0.5)) cut = remaining.lastIndexOf(' ', maxLen);
		if (cut < Math.floor(maxLen * 0.5)) cut = maxLen;
		parts.push(remaining.slice(0, cut).trimEnd());
		remaining = remaining.slice(cut).trimStart();
	}
	if (remaining.length > 0) parts.push(remaining);
	return parts;
}

export function stripBotMention(content: string, botUserId: string): string {
	const mentionRegex = new RegExp(`<@!?${botUserId}>`, 'g');
	return content.replace(mentionRegex, '').trim();
}

export function normalizePlainLinks(text: string): string {
	// Discord supports Markdown. The model sometimes emits Markdown links like:
	//   [https://example.com](https://example.com)
	// The user wants plain text links, so we rewrite Markdown links into plain URLs.
	const markdownLink = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g;
	return text.replace(markdownLink, (_m, rawLabel: string, rawUrl: string) => {
		const label = String(rawLabel ?? '').trim();
		const url = String(rawUrl ?? '').trim();
		const labelUnwrapped = label.replace(/^<(.+)>$/, '$1').trim();
		if (labelUnwrapped === url) return url;
		if (label.length === 0) return url;
		return `${label}: ${url}`;
	});
}
