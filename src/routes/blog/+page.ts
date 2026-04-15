import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	// 1. Fetch all markdown files in src/lib/posts/ and its subfolders
	const postFiles = import.meta.glob('/src/lib/posts/**/*.md');
	
	const postPromises = Object.entries(postFiles).map(async ([path, resolver]) => {
		const { metadata }: any = await resolver();
		
		// Derive the slug from the filename or folder name
		// Example: /src/lib/posts/healthcare/fhir-post.md -> fhir-post
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';
		
		return {
			...metadata,
			slug
		};
	});

	let posts = await Promise.all(postPromises);

	// 2. Filter out drafts if you use a 'published' flag in your markdown frontmatter
	// This prevents unfinished posts from appearing on Vercel
	posts = posts.filter(post => post.published !== false);

	// 3. Sort by date descending (assuming you have a 'date' field in frontmatter)
	posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	return {
		posts
	};
};