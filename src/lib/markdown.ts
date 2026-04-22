function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderInline(text: string): string {
	let result = escapeHtml(text);

	result = result.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);

	result = result.replace(
		/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
		(_, label, url) => {
			const isInternalDictLink = /^\/dictionary\/[a-z0-9]+$/.test(url);
			return isInternalDictLink
				? `<a href="${url}">${label}</a>`
				: `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
		}
	);

	result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	result = result.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
	result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	result = result.replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, '<em>$1</em>');

	return result;
}

type Block =
	| { kind: 'heading'; level: number; text: string }
	| { kind: 'paragraph'; lines: string[] }
	| { kind: 'ul'; items: string[] }
	| { kind: 'ol'; items: string[] }
	| { kind: 'quote'; lines: string[] }
	| { kind: 'code'; lines: string[] }
	| { kind: 'hr' };

export function renderMarkdown(source: string): string {
	if (!source) return '';

	const lines = source.replace(/\r\n/g, '\n').split('\n');
	const blocks: Block[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (line.trim() === '') {
			i += 1;
			continue;
		}

		if (/^```/.test(line)) {
			const codeLines: string[] = [];
			i += 1;
			while (i < lines.length && !/^```/.test(lines[i])) {
				codeLines.push(lines[i]);
				i += 1;
			}
			i += 1;
			blocks.push({ kind: 'code', lines: codeLines });
			continue;
		}

		if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
			blocks.push({ kind: 'hr' });
			i += 1;
			continue;
		}

		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
			i += 1;
			continue;
		}

		if (/^\s*>\s?/.test(line)) {
			const quoteLines: string[] = [];
			while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
				quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
				i += 1;
			}
			blocks.push({ kind: 'quote', lines: quoteLines });
			continue;
		}

		if (/^\s*[-*+]\s+/.test(line)) {
			const items: string[] = [];
			while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
				items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
				i += 1;
			}
			blocks.push({ kind: 'ul', items });
			continue;
		}

		if (/^\s*\d+\.\s+/.test(line)) {
			const items: string[] = [];
			while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
				items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
				i += 1;
			}
			blocks.push({ kind: 'ol', items });
			continue;
		}

		const paragraph: string[] = [line];
		i += 1;
		while (
			i < lines.length &&
			lines[i].trim() !== '' &&
			!/^#{1,6}\s+/.test(lines[i]) &&
			!/^\s*[-*+]\s+/.test(lines[i]) &&
			!/^\s*\d+\.\s+/.test(lines[i]) &&
			!/^\s*>\s?/.test(lines[i]) &&
			!/^```/.test(lines[i]) &&
			!/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(lines[i])
		) {
			paragraph.push(lines[i]);
			i += 1;
		}
		blocks.push({ kind: 'paragraph', lines: paragraph });
	}

	return blocks.map(renderBlock).join('\n');
}

function renderBlock(block: Block): string {
	switch (block.kind) {
		case 'heading':
			return `<h${block.level}>${renderInline(block.text)}</h${block.level}>`;
		case 'paragraph':
			return `<p>${block.lines.map(renderInline).join('<br>')}</p>`;
		case 'ul':
			return `<ul>${block.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`;
		case 'ol':
			return `<ol>${block.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`;
		case 'quote':
			return `<blockquote>${renderMarkdown(block.lines.join('\n'))}</blockquote>`;
		case 'code':
			return `<pre><code>${escapeHtml(block.lines.join('\n'))}</code></pre>`;
		case 'hr':
			return '<hr>';
	}
}
