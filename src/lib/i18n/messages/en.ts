/**
 * English UI messages — the source catalog. Every UI string gets a key here;
 * other locales override a subset and fall back to these values.
 *
 * Params are interpolated with `{name}` placeholders.
 */
export const en = {
	'brand.tagline': 'Dictionary & Corpus',

	'nav.primaryLabel': 'Primary navigation',
	'nav.dictionary': 'Dictionary',
	'nav.corpus': 'Corpus',
	'nav.learn': 'Learn',
	'nav.lessons': 'Lessons',
	'nav.contribute': 'Contribute',

	'menu.settings': 'Settings',
	'menu.admin': 'Admin',
	'menu.signIn': 'Sign in',
	'menu.signUp': 'Sign up',
	'menu.signOut': 'Sign out',
	'menu.open': 'Open menu',
	'menu.close': 'Close menu',

	'theme.switchToLight': 'Switch to light mode',
	'theme.switchToDark': 'Switch to dark mode',
	'theme.auto': 'Auto',
	'theme.light': 'Light',
	'theme.dark': 'Dark',

	'language.label': 'Language',

	'footer.ledeBefore': 'Kalenj.in is a project to document and record the',
	'footer.ledeAfter':
		'— the language of sweetness — and provide resources for natives, heritage speakers, and learners of the Kalenjin language.',
	'footer.privacy': 'Privacy',
	'footer.terms': 'Terms',

	'search.placeholder': 'Search the dictionary…',
	'search.ariaLabel': 'Search the dictionary',
	'search.noMatches': 'No entries match “{query}”.',
	'search.browseAllMatches': 'Browse all matches →',
	'search.addAsNewWord': '+ Add “{query}” as a new word',

	'home.pageTitle': 'Kalenj.in — Dictionary & Corpus',
	'home.greetingTranslation': 'Hello, my friend.',
	'home.headword.one': 'headword',
	'home.headword.other': 'headwords',
	'home.sentence.one': 'sentence',
	'home.sentence.other': 'sentences',
	'home.search.placeholder': 'Search the dictionary — Kalenjin or English',
	'home.search.browseAll': 'Browse all →',
	'home.search.match.one': 'match',
	'home.search.match.other': 'matches',
	'home.search.browseAllEntries': 'Browse all {count} entries',
	'home.wordOfDay': 'Word of the day',
	'home.archive': 'archive',
	'home.playPronunciation': 'Play pronunciation of {word}',
	'home.playSentence': 'Play sentence',
	'home.pluralAbbr': 'pl.',
	'home.alsoSpelled': 'also',
	'home.inASentence': 'In a sentence',
	'home.noExampleYet': 'No example yet —',
	'home.addOne': 'add one',
	'home.fullEntry': 'Full entry',
	'home.recentlyAdded': 'Recently added',
	'home.viewActivity': 'View activity →',
	'home.entries': 'Entries',
	'home.sentences': 'Sentences',
	'home.noEntriesYet': 'No entries yet.',
	'home.noSentencesYet': 'No sentences yet.',

	'auth.signInPageTitle': 'Sign in · Kalenjin',
	'auth.signIn': 'Sign in',
	'auth.newHere': 'New here?',
	'auth.createAccount': 'Create an account',
	'auth.resendVerification': 'Resend verification email',
	'auth.username': 'Username',
	'auth.password': 'Password',
	'auth.showPassword': 'Show password',
	'auth.hidePassword': 'Hide password',

	'settings.pageTitle': 'Settings · Kalenjin',
	'settings.title': 'Settings',
	'settings.description': 'Manage your account and how Kalenj.in looks on this device.',
	'settings.account': 'Account',
	'settings.role': 'Role',
	'settings.appearance': 'Appearance',
	'settings.theme': 'Theme',
	'settings.themeHelp': 'Auto follows your device setting. Saved to your account.',
	'settings.languageHelp': 'Used for menus and labels. Saved on this device.',
	'settings.changePassword': 'Change password',
	'settings.currentPassword': 'Current password',
	'settings.newPassword': 'New password',
	'settings.confirmPassword': 'Confirm new password',
	'settings.passwordMinLength': 'At least 12 characters.',
	'settings.updatePassword': 'Update password'
} as const;

export type MessageKey = keyof typeof en;
