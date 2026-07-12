export const BLOG_PAGE_SIZE = 12;

export function parsePageNumber(value: string | null) {
	if (!value || !/^\d+$/.test(value)) return 1;
	const page = Number(value);
	return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function paginate<T>(items: T[], requestedPage: number, pageSize = BLOG_PAGE_SIZE) {
	const totalItems = items.length;
	const totalPages = Math.ceil(totalItems / pageSize);
	const page = totalPages === 0 ? 1 : Math.min(Math.max(1, requestedPage), totalPages);
	const start = (page - 1) * pageSize;

	return {
		items: items.slice(start, start + pageSize),
		page,
		totalItems,
		totalPages
	};
}
