import { z } from 'zod';
import { slugifyCategory } from '$lib/content/categories';
import { slugifyTopic } from '$lib/content/topics';

const nonEmptyString = z
	.string()
	.min(1)
	.refine((value) => value === value.trim(), 'must not have surrounding whitespace');

const calendarDate = nonEmptyString.refine((value) => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'must be a valid calendar date in YYYY-MM-DD format');

const canonicalPath = nonEmptyString
	.refine(
		(value) => /^\/(?!\/)[^\s?#]*$/.test(value),
		'must be a root-relative path without query or fragment'
	)
	.refine((value) => value === '/' || !value.endsWith('/'), 'must not contain a trailing slash');

const uniqueCanonicalPaths = z.array(canonicalPath).superRefine((paths, context) => {
	const seen = new Set<string>();
	for (const [index, path] of paths.entries()) {
		if (seen.has(path)) {
			context.addIssue({
				code: 'custom',
				path: [index],
				message: `duplicates the canonical path ${path}`
			});
		}
		seen.add(path);
	}
});

const readingPathSchema = z.object({
	description: nonEmptyString,
	items: uniqueCanonicalPaths.min(1).max(5)
});

const glossaryEntrySchema = z.object({
	term: nonEmptyString,
	definition: nonEmptyString,
	relatedPath: canonicalPath.optional()
});

const faqEntrySchema = z.object({
	question: nonEmptyString,
	answer: nonEmptyString
});

const headingSchema = z.object({
	id: nonEmptyString,
	text: nonEmptyString,
	level: z.number().int().min(1).max(6)
});

export const topicMetadataSchema = z
	.object({
		title: nonEmptyString,
		shortTitle: nonEmptyString,
		slug: nonEmptyString,
		group: nonEmptyString,
		description: nonEmptyString,
		date: calendarDate,
		dateModified: calendarDate,
		primaryTag: nonEmptyString,
		sourceTags: z.array(nonEmptyString).min(1),
		sourceCategories: z.array(nonEmptyString).default([]),
		includePaths: uniqueCanonicalPaths.default([]),
		excludePaths: uniqueCanonicalPaths.default([]),
		bestStartingArticle: canonicalPath,
		startHereReason: nonEmptyString,
		readingPaths: z.object({
			beginner: readingPathSchema,
			intermediate: readingPathSchema,
			deep: readingPathSchema
		}),
		relatedResources: z
			.object({
				visualizations: uniqueCanonicalPaths.default([]),
				games: uniqueCanonicalPaths.default([]),
				other: uniqueCanonicalPaths.default([])
			})
			.default({ visualizations: [], games: [], other: [] }),
		glossary: z.array(glossaryEntrySchema).min(5).max(12),
		faqs: z.array(faqEntrySchema).min(4).max(8),
		contrarianView: z.object({
			heading: nonEmptyString,
			paragraphs: z.array(nonEmptyString).min(1).max(3)
		}),
		relatedTopics: z.array(nonEmptyString).default([]),
		headings: z.array(headingSchema).optional()
	})
	.strict()
	.superRefine((topic, context) => {
		if (topic.slug !== slugifyTopic(topic.slug)) {
			context.addIssue({
				code: 'custom',
				path: ['slug'],
				message: 'must already be a normalized topic slug'
			});
		}

		if (topic.dateModified < topic.date) {
			context.addIssue({
				code: 'custom',
				path: ['dateModified'],
				message: 'must not precede date'
			});
		}

		const normalizedPrimaryTag = slugifyTopic(topic.primaryTag);
		if (topic.primaryTag !== normalizedPrimaryTag) {
			context.addIssue({
				code: 'custom',
				path: ['primaryTag'],
				message: 'must already be a normalized tag slug'
			});
		}

		const sourceTagSet = new Set<string>();
		for (const [index, tag] of topic.sourceTags.entries()) {
			if (tag !== slugifyTopic(tag)) {
				context.addIssue({
					code: 'custom',
					path: ['sourceTags', index],
					message: 'must already be a normalized tag slug'
				});
			}
			if (sourceTagSet.has(tag)) {
				context.addIssue({
					code: 'custom',
					path: ['sourceTags', index],
					message: `duplicates the source tag ${tag}`
				});
			}
			sourceTagSet.add(tag);
		}
		if (!sourceTagSet.has(topic.primaryTag)) {
			context.addIssue({
				code: 'custom',
				path: ['primaryTag'],
				message: 'must also appear in sourceTags'
			});
		}

		const sourceCategorySet = new Set<string>();
		for (const [index, category] of topic.sourceCategories.entries()) {
			if (category !== slugifyCategory(category)) {
				context.addIssue({
					code: 'custom',
					path: ['sourceCategories', index],
					message: 'must already be a normalized category slug'
				});
			}
			if (sourceCategorySet.has(category)) {
				context.addIssue({
					code: 'custom',
					path: ['sourceCategories', index],
					message: `duplicates the source category ${category}`
				});
			}
			sourceCategorySet.add(category);
		}

		const excluded = new Set(topic.excludePaths);
		for (const [index, path] of topic.includePaths.entries()) {
			if (excluded.has(path)) {
				context.addIssue({
					code: 'custom',
					path: ['includePaths', index],
					message: `${path} also appears in excludePaths`
				});
			}
		}

		const glossaryTerms = new Set<string>();
		for (const [index, entry] of topic.glossary.entries()) {
			const normalized = entry.term.toLocaleLowerCase('en');
			if (glossaryTerms.has(normalized)) {
				context.addIssue({
					code: 'custom',
					path: ['glossary', index, 'term'],
					message: `duplicates the glossary term ${entry.term}`
				});
			}
			glossaryTerms.add(normalized);
		}

		const faqQuestions = new Set<string>();
		for (const [index, entry] of topic.faqs.entries()) {
			const normalized = entry.question.toLocaleLowerCase('en');
			if (faqQuestions.has(normalized)) {
				context.addIssue({
					code: 'custom',
					path: ['faqs', index, 'question'],
					message: `duplicates the FAQ question ${entry.question}`
				});
			}
			faqQuestions.add(normalized);
		}

		const relatedTopics = new Set<string>();
		for (const [index, slug] of topic.relatedTopics.entries()) {
			if (slug !== slugifyTopic(slug)) {
				context.addIssue({
					code: 'custom',
					path: ['relatedTopics', index],
					message: 'must already be a normalized topic slug'
				});
			}
			if (slug === topic.slug) {
				context.addIssue({
					code: 'custom',
					path: ['relatedTopics', index],
					message: 'must not point to the current topic'
				});
			}
			if (relatedTopics.has(slug)) {
				context.addIssue({
					code: 'custom',
					path: ['relatedTopics', index],
					message: `duplicates the related topic ${slug}`
				});
			}
			relatedTopics.add(slug);
		}
	});

export type TopicMetadata = z.infer<typeof topicMetadataSchema>;
export type TopicReadingLevel = keyof TopicMetadata['readingPaths'];

export function parseTopicMetadata(value: unknown, source: string): TopicMetadata {
	const result = topicMetadataSchema.safeParse(value);
	if (result.success) return result.data;

	const details = result.error.issues
		.map((issue) => `${issue.path.join('.') || 'frontmatter'}: ${issue.message}`)
		.join('; ');
	throw new Error(`${source}: invalid Topic Headquarters metadata: ${details}`);
}
