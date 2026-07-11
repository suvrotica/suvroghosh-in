import fs from 'node:fs';
import { parseDocument } from 'yaml';

export function parsePostFrontmatter(text, source = 'post') {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) throw new Error(`${source} must begin with a YAML frontmatter block.`);

	const document = parseDocument(match[1], {
		prettyErrors: true,
		strict: true,
		uniqueKeys: true
	});

	const yamlIssues = [...document.errors, ...document.warnings];
	if (yamlIssues.length > 0) {
		throw new Error(
			`${source} has invalid YAML frontmatter: ${yamlIssues.map((error) => error.message).join('; ')}`
		);
	}

	const metadata = document.toJS();
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		throw new Error(`${source} frontmatter must be a key-value object.`);
	}

	return metadata;
}

export function readPostFrontmatter(file) {
	return parsePostFrontmatter(fs.readFileSync(file, 'utf8'), file);
}
