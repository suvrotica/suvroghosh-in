# Topic Headquarters authoring

Each published headquarters is one Markdown file in this directory. The filename must match the normalized `slug`, and its frontmatter must satisfy `schema.ts`. The Markdown body is the visible plain-English introduction; do not add an H1 because the page supplies the topic title.

## Add a topic

1. Add `{slug}.md` with every required schema field.
2. Use normalized lowercase slugs for `slug`, `primaryTag`, `sourceTags`, `sourceCategories`, and `relatedTopics`.
3. Add the promoted tag-to-topic relationship to the central resolver in `src/lib/content/topics.ts`.
4. Reference only canonical root-relative site paths. Card titles, descriptions, dates, images, and content types come from the resource registry.
5. Rebuild and fix every validation error rather than allowing an unresolved item to disappear.

## Membership and curation

A resource becomes topic material when one of its normalized tags matches `sourceTags`, its normalized category matches `sourceCategories`, or its path appears in `includePaths`. `excludePaths` wins over all inclusion rules. Membership is deduplicated by canonical path.

`bestStartingArticle`, every reading-path item, every related resource, and every glossary `relatedPath` must also be a topic member. Use `includePaths` for editorially selected resources that are not guaranteed to match an automatic rule. Keep include and exclude lists deduplicated.

Reading paths are ordered journeys, not automatic difficulty filters. Give each level one to five real resources and a short explanation of the progression. Use `relatedResources.visualizations`, `games`, and `other` only for genuine first-class resources; leave an array empty instead of inventing a relationship.

## Dates and promoted routes

Write `date` and `dateModified` as quoted `YYYY-MM-DD` editorial dates. Advance `dateModified` when the topic's written or curated content materially changes. Do not use build time as an editorial update. The rendered effective modification date may become newer when a material member resource has a later publication or modification date.

`primaryTag` identifies the promoted tag whose old archive resolves to `/topics/{slug}`. `sourceTags` may contain additional promoted aliases, but an alias must not point to a different headquarters. Ordinary unpromoted tags continue through the existing topic or filtered-blog behaviour.

## Validation

The loader validates schema shape, normalized and unique values, filename/slug agreement, promoted-tag ownership, canonical resource paths, topic membership, related topic slugs, publication status, and non-empty initial topics. Run the repository's normal type checks, tests, content validators, link and SEO checks, search indexing, and production build before publishing.
