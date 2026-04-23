import { splitIntoSentences } from '$lib/story-split';

export type ParsedStorySentence = {
	sentenceOrder: number;
	speaker: string | null;
	kalenjin: string;
	english: string;
};

function parseSpeakerPrefix(value: string): { speaker: string | null; remainder: string } {
	const match = value.match(/^([^:]+):\s*(.*)$/);

	if (!match) {
		return {
			speaker: null,
			remainder: value.trim()
		};
	}

	return {
		speaker: match[1].trim() || null,
		remainder: match[2].trim()
	};
}

function parseSpeakerColumn(value: string): string | null {
	const { speaker } = parseSpeakerPrefix(value);

	return speaker ?? (value.trim() || null);
}

function splitStoryLine(line: string): string[] {
	const tabParts = line
		.split('\t')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	if (tabParts.length >= 2) {
		return tabParts;
	}

	const slashParts = line
		.split(' / ')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	if (slashParts.length >= 2) {
		return slashParts;
	}

	return tabParts;
}

function parseStoryLine(line: string, sentenceOrder: number): ParsedStorySentence {
	const parts = splitStoryLine(line);

	if (parts.length >= 3) {
		const speaker = parseSpeakerColumn(parts[0]);
		const kalenjin = parts[1];
		const english = parts.slice(2).join(' ');

		if (!kalenjin || !english) {
			throw new Error(`Story line ${sentenceOrder} must include Kalenjin text and an English translation.`);
		}

		return {
			sentenceOrder,
			speaker,
			kalenjin,
			english
		};
	}

	if (parts.length === 2) {
		const { speaker, remainder } = parseSpeakerPrefix(parts[0]);
		const kalenjin = speaker ? remainder : parts[0];
		const english = parts[1];

		if (!kalenjin || !english) {
			throw new Error(`Story line ${sentenceOrder} must include Kalenjin text and an English translation.`);
		}

		return {
			sentenceOrder,
			speaker,
			kalenjin,
			english
		};
	}

	throw new Error(
		`Story line ${sentenceOrder}: use tab or " / " to separate parts (Kalenjin / English, or Speaker: / Kalenjin / English).`
	);
}

export function parseStoryImportText(value: string): ParsedStorySentence[] {
	const lines = value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const expanded: ParsedStorySentence[] = [];

	for (let i = 0; i < lines.length; i++) {
		const parsed = parseStoryLine(lines[i], i + 1);
		const pieces = splitIntoSentences(parsed.kalenjin, parsed.english);

		for (const piece of pieces) {
			expanded.push({
				sentenceOrder: expanded.length + 1,
				speaker: parsed.speaker,
				kalenjin: piece.kalenjin,
				english: piece.english
			});
		}
	}

	return expanded;
}

export function validateStoryImportText(value: string): string | null {
	const lines = value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (lines.length === 0) {
		return null;
	}

	const errors: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		try {
			parseStoryLine(lines[i], i + 1);
		} catch (error) {
			errors.push(error instanceof Error ? error.message : `Line ${i + 1} is invalid.`);
		}
	}

	return errors.length > 0 ? errors.join('\n') : null;
}
