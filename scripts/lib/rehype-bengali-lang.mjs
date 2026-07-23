const bengaliRun =
	/\p{Script_Extensions=Bengali}[\p{Script_Extensions=Bengali}\u200c\u200d]*(?:[ \t]+\p{Script_Extensions=Bengali}[\p{Script_Extensions=Bengali}\u200c\u200d]*)*/gu;

const skippedTags = new Set(['code', 'pre', 'script', 'style', 'kbd', 'samp']);
const voidTags = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);

function isBengaliLanguage(value) {
	return typeof value === 'string' && /^bn(?:-|$)/i.test(value.trim());
}

// mdsvex preserves authored inline HTML as sibling raw nodes. Track those
// tags so text inside an existing lang="bn" region is not wrapped twice.
function parseRawTag(value) {
	const source = value.trim();
	const closing = /^<\/([A-Za-z][\w:-]*)\s*>$/.exec(source);
	if (closing) return { kind: 'close', tag: closing[1].toLowerCase() };

	const opening = /^<([A-Za-z][\w:-]*)\b([\s\S]*?)\/?\s*>$/.exec(source);
	if (!opening || source.startsWith('<!--')) return null;

	const tag = opening[1].toLowerCase();
	const lang = /\blang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(opening[2]);

	return {
		kind: 'open',
		tag,
		isBengali: isBengaliLanguage(lang?.[1] ?? lang?.[2] ?? lang?.[3]),
		selfClosing: /\/\s*>$/.test(source) || voidTags.has(tag)
	};
}

function splitBengaliRuns(value) {
	bengaliRun.lastIndex = 0;
	if (!bengaliRun.test(value)) return null;
	bengaliRun.lastIndex = 0;

	const nodes = [];
	let cursor = 0;
	for (const match of value.matchAll(bengaliRun)) {
		const start = match.index ?? 0;
		if (start > cursor) nodes.push({ type: 'text', value: value.slice(cursor, start) });
		nodes.push({
			type: 'element',
			tagName: 'span',
			properties: { lang: 'bn' },
			children: [{ type: 'text', value: match[0] }]
		});
		cursor = start + match[0].length;
	}
	if (cursor < value.length) nodes.push({ type: 'text', value: value.slice(cursor) });
	return nodes;
}

/** Mark visible Bengali text for font selection and assistive technology. */
export default function rehypeBengaliLang() {
	return (tree) => {
		function walk(node, insideBengali = false) {
			if (!node?.children || skippedTags.has(node.tagName)) return;

			const inheritedBengali = insideBengali || isBengaliLanguage(node.properties?.lang);
			const rawStack = [];

			for (let index = 0; index < node.children.length; index += 1) {
				const child = node.children[index];

				if (child.type === 'raw') {
					const rawTag = parseRawTag(child.value);
					if (rawTag?.kind === 'close') {
						const matchIndex = rawStack.map(({ tag }) => tag).lastIndexOf(rawTag.tag);
						if (matchIndex >= 0) rawStack.splice(matchIndex);
					} else if (rawTag?.kind === 'open' && !rawTag.selfClosing) {
						const active = rawStack.length > 0 ? rawStack.at(-1).isBengali : inheritedBengali;
						rawStack.push({ tag: rawTag.tag, isBengali: active || rawTag.isBengali });
					}
					continue;
				}

				const activeBengali = rawStack.length > 0 ? rawStack.at(-1).isBengali : inheritedBengali;

				if (child.type === 'text' && !activeBengali) {
					const replacement = splitBengaliRuns(child.value);
					if (replacement) {
						node.children.splice(index, 1, ...replacement);
						index += replacement.length - 1;
					}
				} else if (child.type === 'element') {
					walk(child, activeBengali);
				}
			}
		}

		walk(tree);
	};
}
