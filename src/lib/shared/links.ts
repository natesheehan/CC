// External links used across the app.

export const REPO_URL = 'https://github.com/natesheehan/CC';
export const BUG_REPORT_URL = `${REPO_URL}/issues/new`;

/**
 * The LibreForms feedback form behind the map page's floating Feedback
 * button. Set PUBLIC_FEEDBACK_FORM_URL to override without a code change;
 * until a form exists it falls back to opening a GitHub issue.
 */
export const FEEDBACK_FORM_URL_DEFAULT = '';
export function feedbackUrl(envUrl?: string | null): string {
	return envUrl || FEEDBACK_FORM_URL_DEFAULT || BUG_REPORT_URL;
}
