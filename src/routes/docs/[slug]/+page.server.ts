import type { PageServerLoad } from './$types';

const articlePaths: Record<string, string> = {
	'get-started': 'src/lib/content/docs/how-it-works.md',
	philosophy: 'src/lib/content/docs/pedagogy.md',
	governance: 'src/lib/content/docs/governance.md',
	contributing: 'src/lib/content/docs/contributing.md',
	cite: 'src/lib/content/docs/cite.md'
};

type GitHubCommit = {
	html_url: string;
	commit?: {
		author?: { name?: string; date?: string };
	};
	author?: { login?: string; html_url?: string } | null;
};

export const load: PageServerLoad = async ({ fetch, params }) => {
	const path = articlePaths[params.slug];
	const historyUrl = path
		? `https://github.com/natesheehan/CC/commits/main/${path}`
		: 'https://github.com/natesheehan/CC/commits/main';
	if (!path) return { edited: null, historyUrl };

	try {
		const response = await fetch(
			`https://api.github.com/repos/natesheehan/CC/commits?path=${encodeURIComponent(path)}&per_page=1`,
			{
				headers: {
					Accept: 'application/vnd.github+json',
					'User-Agent': 'concept-cartography-docs',
					...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
				}
			}
		);
		if (!response.ok) return { edited: null, historyUrl };

		const commits = (await response.json()) as GitHubCommit[];
		const latest = commits[0];
		if (!latest?.commit?.author?.date) return { edited: null, historyUrl };

		return {
			historyUrl,
			edited: {
				date: latest.commit.author.date,
				name: latest.author?.login ?? latest.commit.author.name ?? 'a GitHub contributor',
				profileUrl: latest.author?.html_url ?? null,
				commitUrl: latest.html_url
			}
		};
	} catch {
		return { edited: null, historyUrl };
	}
};
