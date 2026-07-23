import assert from 'node:assert/strict';
import test from 'node:test';
import { compile } from 'mdsvex';
import rehypeBengaliLang from './lib/rehype-bengali-lang.mjs';

function transform(children) {
	const tree = { type: 'root', children };
	rehypeBengaliLang()(tree);
	return tree;
}

test('wraps Bengali phrases without absorbing surrounding English or punctuation', () => {
	const tree = transform([
		{
			type: 'element',
			tagName: 'p',
			properties: {},
			children: [{ type: 'text', value: 'Calcutta says বাংলা কথা, quietly.' }]
		}
	]);

	assert.deepEqual(tree.children[0].children, [
		{ type: 'text', value: 'Calcutta says ' },
		{
			type: 'element',
			tagName: 'span',
			properties: { lang: 'bn' },
			children: [{ type: 'text', value: 'বাংলা কথা' }]
		},
		{ type: 'text', value: ', quietly.' }
	]);
});

test('leaves code and already-authored Bengali language regions untouched', () => {
	const tree = transform([
		{
			type: 'element',
			tagName: 'p',
			properties: {},
			children: [
				{ type: 'raw', value: '<span lang="bn-BD">' },
				{ type: 'text', value: 'আগে থেকেই চিহ্নিত' },
				{ type: 'raw', value: '</span>' },
				{ type: 'text', value: ' then বাইরে' }
			]
		},
		{
			type: 'element',
			tagName: 'code',
			properties: {},
			children: [{ type: 'text', value: 'কোড' }]
		}
	]);

	assert.equal(tree.children[0].children[1].type, 'text');
	assert.equal(tree.children[0].children[1].value, 'আগে থেকেই চিহ্নিত');
	assert.equal(tree.children[0].children[3].type, 'text');
	assert.equal(tree.children[0].children[4].properties.lang, 'bn');
	assert.equal(tree.children[1].children[0].value, 'কোড');
});

test('integrates with mdsvex without rewriting code or Bengali component attributes', async () => {
	const source = [
		'English **বাংলা কথা** and `কোড`.',
		'',
		'<span lang="bn">আগেই বাংলা</span>',
		'',
		'<Vid src="music/বাংলা.mp4" />'
	].join('\n');
	const compiled = await compile(source, { rehypePlugins: [rehypeBengaliLang] });
	const code = compiled?.code ?? '';

	assert.match(code, /<span lang="bn">বাংলা কথা<\/span>/);
	assert.doesNotMatch(code, /<span lang="bn">কোড<\/span>/);
	assert.match(code, /music\/বাংলা\.mp4/);
	assert.equal((code.match(/lang="bn"/g) ?? []).length, 2);
});
