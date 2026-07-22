import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	enrichPostImageMarkup,
	imageDimensions,
	imageManifestKey,
	transformPostImageComponents
} from './lib/post-image-metadata.mjs';

const entries = {
	'static/images/example.jpg': { width: 1200, height: 800 },
	'static/photos/Calcutta morning.jpg': { width: 900, height: 1200 },
	'static/thumbnail/card.webp': { width: 1200, height: 630 }
};

test('resolves PostImage public and relative paths to manifest keys', () => {
	assert.equal(imageManifestKey('example.jpg'), 'static/images/example.jpg');
	assert.equal(
		imageManifestKey('/photos/Calcutta%20morning.jpg?v=2'),
		'static/photos/Calcutta morning.jpg'
	);
	assert.equal(imageManifestKey('/thumbnail/card.webp#preview'), 'static/thumbnail/card.webp');
	assert.equal(imageManifestKey('https://images.example/card.jpg'), null);
	assert.equal(imageManifestKey('/videos/poster.jpg'), null);
	assert.equal(imageManifestKey('../private.jpg'), null);
});

test('reads only complete positive intrinsic dimensions', () => {
	assert.deepEqual(imageDimensions(entries, 'example.jpg'), {
		key: 'static/images/example.jpg',
		width: 1200,
		height: 800
	});
	assert.equal(
		imageDimensions({ 'static/images/example.jpg': { width: 0, height: 800 } }, 'example.jpg'),
		null
	);
});

test('injects dimensions into single-line and multiline components', () => {
	const source = `<Pi src="example.jpg" />\n<Pi\n  src='/photos/Calcutta%20morning.jpg'\n  alt="Morning > traffic"\n/>`;
	const enriched = enrichPostImageMarkup(source, entries, {
		leadAlt: 'Calcutta & "the city"'
	});
	assert.match(
		enriched,
		/<Pi src="example\.jpg" alt="Calcutta &amp; &quot;the city&quot;" loading="eager" fetchpriority="high" width=\{1200\} height=\{800\} \/>/
	);
	assert.match(enriched, /alt="Morning > traffic"\s+width=\{900\} height=\{1200\} \/>/);
	assert.doesNotMatch(enriched.split('\n<Pi')[1], /loading=|fetchpriority=/);
});

test('keeps an authored lead alternative instead of replacing it', () => {
	const source = '<Pi src="example.jpg" alt="Authored description" />';
	const enriched = enrichPostImageMarkup(source, entries, { leadAlt: 'Fallback title' });
	assert.match(enriched, /alt="Authored description"/);
	assert.doesNotMatch(enriched, /Fallback title/);
});

test('keeps authored dimensions and unsupported sources unchanged', () => {
	const authored =
		'<Pi src="example.jpg" width={600} height={400} loading="lazy" fetchpriority="low" />';
	const remote = '<p>Earlier content</p><Pi src="https://images.example/example.jpg" />';
	assert.equal(enrichPostImageMarkup(authored, entries), authored);
	assert.equal(
		enrichPostImageMarkup(remote, entries),
		'<p>Earlier content</p><Pi src="https://images.example/example.jpg" loading="eager" fetchpriority="high" />'
	);
	assert.equal(
		enrichPostImageMarkup('<Pi src={hero} />', entries),
		'<Pi src={hero} loading="eager" fetchpriority="high" />'
	);
});

test('component scanning ignores greater-than signs inside attributes and expressions', () => {
	const source = '<Pi alt="A > B" src={condition ? ">" : "<"} /> after';
	const transformed = transformPostImageComponents(source, (component) =>
		component.replace('Pi', 'PostImage')
	);
	assert.equal(transformed, '<PostImage alt="A > B" src={condition ? ">" : "<"} /> after');
});
