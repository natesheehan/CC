export function relativeTime(date: Date | string | number): string {
	const d = date instanceof Date ? date : new Date(date);
	const seconds = Math.round((Date.now() - d.getTime()) / 1000);

	if (seconds < 5) return 'just now';
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.round(days / 30);
	if (months < 12) return `${months}mo ago`;
	const years = Math.round(months / 12);
	return `${years}y ago`;
}

