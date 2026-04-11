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

function parseStoryLine(line: string, sentenceOrder: number): ParsedStorySentence {
	const parts = line
		.split('\t')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	if (parts.length >= 3) {
		const { speaker } = parseSpeakerPrefix(parts[0]);
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
		`Story line ${sentenceOrder} must use "Speaker: <tab> Kalenjin <tab> English" or "Kalenjin <tab> English".`
	);
}

export function parseStoryImportText(value: string): ParsedStorySentence[] {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line, index) => parseStoryLine(line, index + 1));
}
