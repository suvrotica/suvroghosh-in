import { slugifyCategory } from './categories';
import taxonomy from './sections.json';

export const SECTIONS = taxonomy.sections;
export type SectionSlug = keyof typeof SECTIONS;

export const legacyCategoryToSection = taxonomy.legacyCategoryToSection as Record<
	string,
	SectionSlug
>;
export const postSectionOverrides = taxonomy.postSectionOverrides as Record<string, SectionSlug>;

export function isSectionSlug(value: string): value is SectionSlug {
	return Object.hasOwn(SECTIONS, value);
}

export function sectionSlugForPost(category: string, slug?: string) {
	return (
		(slug ? postSectionOverrides[slug] : undefined) ??
		legacyCategoryToSection[slugifyCategory(category)]
	);
}

export function requireSectionSlug(category: string, slug?: string) {
	const section = sectionSlugForPost(category, slug);
	if (!section || !isSectionSlug(section)) {
		throw new Error(
			`No valid section mapping for category “${category}”${slug ? ` (${slug})` : ''}.`
		);
	}
	return section;
}

export function sectionLabel(section: SectionSlug) {
	return SECTIONS[section];
}
