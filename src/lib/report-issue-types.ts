import type { ReportIssueType } from '@prisma/client';

export const REPORT_ISSUE_TYPES: ReportIssueType[] = [
	'WRONG_TRANSLATION',
	'MISSPELLING',
	'AUDIO_ISSUE',
	'OTHER'
];

export const REPORT_ISSUE_LABELS: Record<ReportIssueType, string> = {
	WRONG_TRANSLATION: 'Wrong translation',
	MISSPELLING: 'Misspelling',
	AUDIO_ISSUE: 'Audio issue',
	OTHER: 'Other'
};
