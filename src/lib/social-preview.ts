const SITE_NAME = 'Kalenj.in';
const FALLBACK_ORIGIN = 'https://kalenj.in';
const FALLBACK_IMAGE_PATH = '/icons/icon-512.png';
const DESCRIPTION_LIMIT = 180;
const TITLE_LIMIT = 90;

type PreviewImage = {
	url: string;
	alt: string;
	isPageSpecific: boolean;
};

export type SocialPreview = {
	title: string;
	description: string;
	url: string;
	image: PreviewImage;
};

type DictionaryPreviewWord = {
	kalenjin: string;
	translations: string;
	imageUrl?: string | null;
	sentences?: Array<{
		exampleSentence: {
			kalenjin: string;
		};
	}>;
};

type CorpusPreviewSentence = {
	kalenjin: string;
	english: string;
	imageUrl?: string | null;
};

function cleanText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function cleanPreviewDescription(value: string): string {
	return value
		.split('\n')
		.map(cleanText)
		.filter((line) => line.length > 0)
		.join('\n');
}

function truncateText(value: string, limit: number): string {
	const text = cleanText(value);
	if (text.length <= limit) return text;

	const clipped = text.slice(0, limit - 3).replace(/\s+\S*$/, '').trim();
	return `${clipped || text.slice(0, limit - 3).trim()}...`;
}

function truncatePreviewDescription(value: string, limit: number): string {
	const text = cleanPreviewDescription(value);
	if (text.length <= limit) return text;

	const clipped = text.slice(0, limit - 3).replace(/\s+\S*$/, '').trim();
	return `${clipped || text.slice(0, limit - 3).trim()}...`;
}

function absoluteUrl(pathOrUrl: string, requestUrl: URL | undefined): string {
	return new URL(pathOrUrl, requestUrl?.origin ?? FALLBACK_ORIGIN).href;
}

export function publicSocialPreviewUrl(url: URL | undefined, request?: Request): URL | undefined {
	if (!url) return undefined;
	const publicUrl = new URL(url);
	const forwardedProto = request?.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
	const forwardedHost = request?.headers.get('x-forwarded-host')?.split(',')[0]?.trim();

	if (forwardedProto) publicUrl.protocol = `${forwardedProto}:`;
	if (forwardedHost) {
		publicUrl.host = forwardedHost;
		if (!forwardedHost.includes(':')) publicUrl.port = '';
	}

	return publicUrl;
}

function fallbackImage(alt: string, requestUrl: URL | undefined): PreviewImage {
	return {
		url: absoluteUrl(FALLBACK_IMAGE_PATH, requestUrl),
		alt,
		isPageSpecific: false
	};
}

function previewImage(
	imageUrl: string | null | undefined,
	alt: string,
	requestUrl: URL | undefined
): PreviewImage {
	if (!imageUrl) return fallbackImage(alt, requestUrl);

	return {
		url: absoluteUrl(imageUrl, requestUrl),
		alt,
		isPageSpecific: true
	};
}

function formatDictionaryTranslations(translations: string): string {
	return cleanText(translations);
}

function firstSampleSentence(word: DictionaryPreviewWord): string {
	return cleanText(
		word.sentences?.find((link) => link.exampleSentence.kalenjin)?.exampleSentence.kalenjin ?? ''
	);
}

export function buildDictionarySocialPreview(
	word: DictionaryPreviewWord,
	canonicalPath: string,
	requestUrl?: URL
): SocialPreview {
	const wordName = cleanText(word.kalenjin);
	const translations = formatDictionaryTranslations(word.translations);
	const sampleSentence = firstSampleSentence(word);
	const description = sampleSentence
		? `${wordName}: ${translations}\n${sampleSentence}`
		: `${wordName}: ${translations}`;

	return {
		title: truncateText(`${wordName} - ${SITE_NAME}`, TITLE_LIMIT),
		description: truncatePreviewDescription(description, DESCRIPTION_LIMIT),
		url: absoluteUrl(canonicalPath, requestUrl),
		image: previewImage(word.imageUrl, wordName, requestUrl)
	};
}

export function buildCorpusSentenceSocialPreview(
	sentence: CorpusPreviewSentence,
	canonicalPath: string,
	requestUrl?: URL
): SocialPreview {
	const kalenjin = cleanText(sentence.kalenjin);
	const english = cleanText(sentence.english);
	const description = english ? `${kalenjin}\n${english}` : kalenjin;

	return {
		title: truncateText(`${kalenjin} - ${SITE_NAME}`, TITLE_LIMIT),
		description: truncatePreviewDescription(description, DESCRIPTION_LIMIT),
		url: absoluteUrl(canonicalPath, requestUrl),
		image: previewImage(sentence.imageUrl, kalenjin, requestUrl)
	};
}
