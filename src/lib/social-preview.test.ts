import { describe, expect, it } from 'vitest';
import {
	buildCorpusSentenceSocialPreview,
	buildDictionarySocialPreview,
	publicSocialPreviewUrl
} from './social-preview';

describe('social preview helpers', () => {
	it('builds dictionary preview metadata with absolute canonical and fallback image URLs', () => {
		const preview = buildDictionarySocialPreview(
			{
				kalenjin: 'che',
				translations: 'which are; that are; who are; extra gloss',
				imageUrl: null
			},
			'/dictionary/che',
			new URL('https://example.test/dictionary/che?from=search')
		);

		expect(preview).toMatchObject({
			title: 'che - Kalenj.in',
			description: 'che: which are; that are; who are; extra gloss',
			url: 'https://example.test/dictionary/che',
			image: {
				url: 'https://example.test/icons/icon-512.png',
				alt: 'che',
				isPageSpecific: false
			}
		});
	});

	it('uses page-specific word images for richer cards', () => {
		const preview = buildDictionarySocialPreview(
			{
				kalenjin: 'tuga',
				translations: 'cow',
				imageUrl: '/media/tuga.png'
			},
			'/dictionary/tuga',
			new URL('https://kalenj.in/dictionary/tuga')
		);

		expect(preview.image).toMatchObject({
			url: 'https://kalenj.in/media/tuga.png',
			alt: 'tuga',
			isPageSpecific: true
		});
	});

	it('adds the first sample sentence to dictionary previews when one exists', () => {
		const preview = buildDictionarySocialPreview(
			{
				kalenjin: 'chepto',
				translations: 'girl; daughter',
				imageUrl: null,
				sentences: [
					{
						exampleSentence: {
							kalenjin: 'Kageer chepto ko muren.'
						}
					}
				]
			},
			'/dictionary/chepto',
			new URL('https://kalenj.in/dictionary/chepto')
		);

		expect(preview.description).toBe('chepto: girl; daughter\nKageer chepto ko muren.');
	});

	it('builds corpus sentence previews from the sentence and English translation', () => {
		const preview = buildCorpusSentenceSocialPreview(
			{
				kalenjin: 'Ame tugul gaa.',
				english: 'Everyone came home.',
				imageUrl: 'https://cdn.example.test/sentence.jpg'
			},
			'/corpus/sentence-1',
			new URL('https://kalenj.in/corpus/sentence-1')
		);

		expect(preview).toMatchObject({
			title: 'Ame tugul gaa. - Kalenj.in',
			description: 'Ame tugul gaa.\nEveryone came home.',
			url: 'https://kalenj.in/corpus/sentence-1',
			image: {
				url: 'https://cdn.example.test/sentence.jpg',
				alt: 'Ame tugul gaa.',
				isPageSpecific: true
			}
		});
	});

	it('uses forwarded headers for public preview URLs behind a proxy', () => {
		const request = new Request('http://127.0.0.1:5173/dictionary/che', {
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'preview.example.test'
			}
		});

		const url = publicSocialPreviewUrl(new URL('http://127.0.0.1:5173/dictionary/che'), request);

		expect(url?.href).toBe('https://preview.example.test/dictionary/che');
	});
});
