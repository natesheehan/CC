import about from './about.md?raw';
import privacy from './privacy.md?raw';
import terms from './terms.md?raw';
import cookies from './cookies.md?raw';

export type InfoPage = {
	href: string;
	title: string;
	eyebrow: string;
	description: string;
	/** ISO date the text was last revised; omitted for non-policy pages. */
	updated?: string;
	markdown: string;
};

export const INFO_PAGES: InfoPage[] = [
	{
		href: '/about',
		title: 'About Concept Cartography',
		eyebrow: 'The project',
		description: 'A free, open-source atlas for mapping how ideas connect — built together.',
		markdown: about
	},
	{
		href: '/privacy',
		title: 'Privacy Policy',
		eyebrow: 'Legal',
		description: 'What we collect, why, and what you can do about it.',
		updated: '2026-09-28',
		markdown: privacy
	},
	{
		href: '/terms',
		title: 'Terms of Service',
		eyebrow: 'Legal',
		description: 'The ground rules for using and contributing to the atlas.',
		updated: '2026-09-28',
		markdown: terms
	},
	{
		href: '/cookies',
		title: 'Cookie Notice',
		eyebrow: 'Legal',
		description: 'The one cookie we use, and what we keep in your browser.',
		updated: '2026-09-28',
		markdown: cookies
	}
];

export function infoPage(href: string): InfoPage {
	const found = INFO_PAGES.find((p) => p.href === href);
	if (!found) throw new Error(`Unknown info page: ${href}`);
	return found;
}
