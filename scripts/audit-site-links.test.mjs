import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
	auditSiteLinks,
	inspectHtmlNavigation,
	localPreviewOrigin,
	missingFragment,
	previewStartupReady,
	resolveLink,
	SITE
} from './audit-site-links.mjs';

async function auditFixture(t, { files = {}, respond, ...options } = {}) {
	const temporary = await fs.realpath(os.tmpdir());
	const root = await fs.mkdtemp(path.join(temporary, 'suvro-rendered-links-'));
	t.after(async () => {
		const resolved = await fs.realpath(root);
		assert.equal(path.dirname(resolved), temporary);
		assert.ok(path.basename(resolved).startsWith('suvro-rendered-links-'));
		await fs.rm(resolved, { recursive: true, force: true });
	});
	for (const [filename, value] of Object.entries({
		'src/lib/content/posts.ts': 'export const postPathAliases = {};',
		...files
	})) {
		const file = path.join(root, filename);
		await fs.mkdir(path.dirname(file), { recursive: true });
		await fs.writeFile(file, value);
	}
	const server = http.createServer((request, response) => {
		const url = new URL(request.url, 'http://localhost');
		if (respond?.(url, response)) return;
		if (url.pathname.endsWith('sitemap.xml') || url.pathname === '/rss.xml') {
			response.setHeader('content-type', 'application/xml');
			response.end(url.pathname === '/rss.xml' ? '<rss></rss>' : '<urlset></urlset>');
		} else {
			response.setHeader('content-type', 'text/html');
			response.end('<h1>Fixture page</h1>');
		}
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(() => new Promise((resolve) => server.close(resolve)));
	return auditSiteLinks({
		baseURL: `http://127.0.0.1:${server.address().port}`,
		root,
		output: path.join(root, 'report.json'),
		...options
	});
}

test('a comprehensive crawl is confined to an HTTP loopback preview', () => {
	assert.equal(localPreviewOrigin('http://127.0.0.1:4268/'), 'http://127.0.0.1:4268');
	assert.equal(localPreviewOrigin('http://[::1]:4268/'), 'http://[::1]:4268');
	for (const value of [
		SITE,
		'http://suvroghosh.in',
		'http://127.0.0.1.example.org',
		'file:///tmp/site'
	]) {
		assert.throws(() => localPreviewOrigin(value), /loopback/);
	}
});

test('preview readiness recognises the ANSI-coloured URL emitted by Vite on GitHub Actions', () => {
	const emitted =
		'  \u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://127.0.0.1:\u001b[1m4268\u001b[22m/\u001b[39m\n';
	assert.equal(previewStartupReady(emitted), true);
	assert.equal(previewStartupReady('Local: http://127.0.0.1:4268/\n'), true);
	assert.equal(previewStartupReady(emitted.replace('4268', '4269')), false);
	assert.equal(previewStartupReady('Starting local preview...'), false);
});

test('relative, protocol-relative and absolute same-site links retain queries and decoded fragments', () => {
	assert.deepEqual(resolveLink('../next?sort=oldest&page=2#%E0%A6%95', `${SITE}/blog/test/post`), {
		kind: 'internal',
		url: `${SITE}/blog/next?page=2&sort=oldest`,
		fragment: 'ক'
	});
	assert.deepEqual(resolveLink('//suvroghosh.in/writing#reading'), {
		kind: 'internal',
		url: `${SITE}/writing`,
		fragment: 'reading'
	});
	assert.equal(resolveLink('https://suvroghosh.in.evil.example/writing').kind, 'external');
	assert.equal(resolveLink('/writing#%XX').kind, 'invalid');
	assert.equal(resolveLink('/writing/%XX').kind, 'invalid');
	assert.equal(resolveLink('http://www.suvroghosh.in:9999/about').kind, 'invalid');
});

test('private APIs and owner routes are explicitly excluded while public notes remain auditable', () => {
	for (const href of [
		'/api/notes/a',
		'/notes/studio',
		'/notes/studio/a',
		'/notes/sign-in',
		'/notes/%73tudio',
		'/notes%2Fstudio',
		'/%61pi/notes/private'
	]) {
		assert.equal(resolveLink(href).kind, 'excluded');
	}
	for (const href of ['/notes', '/notes/public-edition', '/resources/lists/example']) {
		assert.equal(resolveLink(href).kind, 'internal');
	}
	assert.equal(resolveLink('mailto:contact@suvroghosh.in').kind, 'special');
});

test('HTML navigation uses actual attributes and ignores comments, raw text, scripts, styles and template contents', () => {
	const result = inspectHtmlNavigation(`<!doctype html><html><head>
<title>Reading &amp; writing</title><base href="/guide/">
<script>const demo = '<a href="/script"><h1 id="script-id">Demo</h1></a>';</script>
<style>.demo::after { content: '<a href="/style">Demo</a>'; }</style></head><body>
<!-- <a href="/comment" id="comment-id">Comment</a> -->
<div data-id="not-an-id" data-href="/not-a-link"></div>
<textarea><a href="/textarea">Example</a></textarea>
<template id="actual-template"><a href="/template" id="template-child">Inactive</a><template><a href="/nested-template">Nested</a></template></template>
<h1 id="real-heading">Real <span>heading &amp; details</span></h1>
<a href="next?comparison=one&gt;two&amp;page=2" title="one > two"><span>Next</span> page</a>
<a name="legacy" aria-label="Legacy target"></a><div id="&#x995;"></div>
</body></html>`);
	assert.equal(result.title, 'Reading & writing');
	assert.deepEqual(result.h1, ['Real heading & details']);
	assert.deepEqual(result.ids, ['actual-template', 'real-heading', 'legacy', 'ক']);
	assert.deepEqual(result.links, [
		{ href: 'next?comparison=one>two&page=2', anchorText: 'Next page' }
	]);
	assert.equal(result.baseHref, '/guide/');
});

test('a malformed same-page fragment remains a link finding without aborting HTML extraction', () => {
	const result = inspectHtmlNavigation(
		'<h1 id="exists">Title</h1><a href="#%ZZ">Bad</a><a href="/valid">Good</a>'
	);
	assert.deepEqual(
		result.links.map((link) => link.href),
		['#%ZZ', '/valid']
	);
	assert.equal(resolveLink(result.links[0].href).kind, 'invalid');
});

test('HTML token offsets survive Unicode case expansion, duplicate attributes keep their first value, and SVG links are retained', () => {
	const result = inspectHtmlNavigation(
		'İİİİİİİİİİİİİİİİİİİİ<script>"<a href="/fake">Fake</a>";</script><a href="/first" href="/last" id="first-id" id="last-id">Real</a><svg><a xlink:href="/svg">SVG</a></svg>'
	);
	assert.deepEqual(
		result.links.map((link) => link.href),
		['/first', '/svg']
	);
	assert.deepEqual(result.ids, ['first-id']);
});

test('invalid crawl limits fail before requests rather than hanging or claiming a complete audit', async () => {
	await assert.rejects(auditSiteLinks({ concurrency: 0 }), /concurrency/);
	await assert.rejects(auditSiteLinks({ concurrency: 1.5 }), /concurrency/);
	await assert.rejects(auditSiteLinks({ maxUrls: 0 }), /maxUrls/);
});

test('fragment validation handles percent-decoded IDs and browser text directives', () => {
	assert.equal(missingFragment('ক', ['ক']), false);
	assert.equal(missingFragment('missing', ['ক']), true);
	assert.equal(missingFragment(':~:text=some%20text', []), false);
	assert.equal(missingFragment('heading:~:text=some%20text', ['heading']), false);
	assert.equal(missingFragment('heading:~:text=some%20text', []), true);
	assert.equal(missingFragment('top', []), false);
});

test('rendered crawl follows sitemap and runtime links and reports broken cross-page fragments and redirects', async (t) => {
	const temporary = await fs.realpath(os.tmpdir());
	const root = await fs.mkdtemp(path.join(temporary, 'suvro-rendered-links-'));
	t.after(async () => {
		const resolved = await fs.realpath(root);
		assert.equal(path.dirname(resolved), temporary);
		assert.ok(path.basename(resolved).startsWith('suvro-rendered-links-'));
		await fs.rm(resolved, { recursive: true, force: true });
	});
	await fs.mkdir(path.join(root, 'src/lib/posts'), { recursive: true });
	await fs.mkdir(path.join(root, 'src/lib/content'), { recursive: true });
	await fs.writeFile(
		path.join(root, 'src/lib/content/posts.ts'),
		'export const postPathAliases = {};'
	);
	const server = http.createServer((request, response) => {
		const url = new URL(request.url, 'http://localhost');
		if (url.pathname === '/sitemap.xml') {
			response.setHeader('content-type', 'application/xml');
			response.end(`<urlset><url><loc>${SITE}/target</loc></url></urlset>`);
		} else if (url.pathname === '/rss.xml') {
			response.setHeader('content-type', 'application/xml');
			response.end('<rss></rss>');
		} else if (url.pathname === '/notes/sitemap.xml') {
			response.setHeader('content-type', 'application/xml');
			response.end('<urlset></urlset>');
		} else if (url.pathname === '/old') {
			response.writeHead(301, { location: '/target' });
			response.end();
		} else if (url.pathname === '/loop') {
			response.writeHead(302, { location: '/loop' });
			response.end();
		} else if (url.pathname === '/missing') {
			response.writeHead(404, { 'content-type': 'text/html' });
			response.end('<h1>Not found</h1>');
		} else {
			response.setHeader('content-type', 'text/html');
			response.end(
				url.pathname === '/'
					? '<html><body><a href="/target#exists">Good</a><a href="/target#legacy">Named anchor</a><a href="/target#missing">Bad fragment</a><a href="/missing">Missing page</a><a href="/old">Old</a><a href="/loop">Loop</a><a href="https://outside.example/path">External</a><a href="/api/notes/private">Private</a></body></html>'
					: '<html><body><h1 id="exists">Target</h1><a name="legacy">Old target</a></body></html>'
			);
		}
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(() => new Promise((resolve) => server.close(resolve)));
	const report = await auditSiteLinks({
		baseURL: `http://127.0.0.1:${server.address().port}`,
		root,
		output: path.join(root, 'report.json')
	});
	assert.equal(report.complete, true);
	assert.equal(report.pages.find((page) => page.url === `${SITE}/old`).finalUrl, `${SITE}/target`);
	assert.ok(report.issues.some((issue) => issue.type === 'http' && issue.status === 404));
	assert.ok(
		report.issues.some((issue) => issue.type === 'fetch' && /Redirect loop/.test(issue.error))
	);
	assert.deepEqual(
		report.issues.filter((issue) => issue.type === 'fragment').map((issue) => issue.fragment),
		['missing']
	);
	assert.deepEqual(Object.keys(report.external), ['https://outside.example/path']);
	assert.deepEqual(report.exclusions, [`${SITE}/api/notes/private`]);
});

test('redirect fragments override, inherit and clear correctly, while auth and invalid redirects remain failures', async (t) => {
	const redirects = new Map([
		['/added', '/target#missing-added'],
		['/overridden', '/target#missing-override'],
		['/overridden-to-valid', '/target#exists'],
		['/cleared', '/target#'],
		['/inherited', '/target'],
		['/auth', '/notes/sign-in'],
		['/invalid', 'http://[invalid']
	]);
	const report = await auditFixture(t, {
		respond(url, response) {
			if (redirects.has(url.pathname)) {
				response.writeHead(302, { location: redirects.get(url.pathname) });
				response.end();
				return true;
			}
			if (url.pathname !== '/' && url.pathname !== '/target') return false;
			response.setHeader('content-type', 'text/html');
			response.end(
				url.pathname === '/'
					? [
							'<a href="/added">Added</a>',
							'<a href="/overridden#exists">Overridden</a>',
							'<a href="/overridden-to-valid#missing-original">Repaired by redirect</a>',
							'<a href="/cleared#missing-cleared">Cleared</a>',
							'<a href="/inherited#missing-inherited">Inherited</a>',
							'<a href="/auth">Unexpected sign-in</a>',
							'<a href="/invalid">Invalid redirect</a>'
						].join('')
					: '<h1 id="exists">Target</h1>'
			);
			return true;
		}
	});
	assert.deepEqual(
		[
			...new Set(
				report.issues.filter((issue) => issue.type === 'fragment').map((issue) => issue.fragment)
			)
		].sort(),
		['missing-added', 'missing-inherited', 'missing-override']
	);
	assert.ok(
		report.issues.some(
			(issue) => issue.type === 'redirect-excluded' && issue.target === `${SITE}/notes/sign-in`
		)
	);
	assert.ok(report.issues.some((issue) => issue.type === 'redirect-invalid'));
	assert.equal(report.pages.find((page) => page.url === `${SITE}/cleared`).redirectFragment, '');
});

test('the crawl uses base URLs and real DOM IDs, and invalid fragments do not suppress other links', async (t) => {
	const report = await auditFixture(t, {
		respond(url, response) {
			if (!['/', '/base', '/nested/target'].includes(url.pathname)) return false;
			response.setHeader('content-type', 'text/html');
			if (url.pathname === '/')
				response.end('<a href="#%ZZ">Malformed fragment</a><a href="/base">Base page</a>');
			else if (url.pathname === '/base')
				response.end(
					'<base href="/nested/"><!-- <a href="/comment">Comment</a> --><script>const html = `<a href="/script">Example</a>`;</script><a href="target#false-id">Target</a>'
				);
			else response.end('<h1>Target</h1><div data-id="false-id"></div>');
			return true;
		}
	});
	assert.ok(report.issues.some((issue) => issue.type === 'invalid-url' && issue.href === '#%ZZ'));
	assert.ok(
		report.issues.some(
			(issue) =>
				issue.type === 'fragment' &&
				issue.fragment === 'false-id' &&
				issue.target === `${SITE}/nested/target`
		)
	);
	assert.equal(report.pages.find((page) => page.url === `${SITE}/`).status, 200);
	assert.ok(!report.pages.some((page) => /\/(?:comment|script)$/.test(page.url)));
	assert.ok(!report.issues.some((issue) => issue.type === 'fetch'));
});

test('the dedicated public Notes sitemap is seeded and nested sitemap documents are followed', async (t) => {
	const report = await auditFixture(t, {
		respond(url, response) {
			if (url.pathname !== '/notes/sitemap.xml' && url.pathname !== '/sitemaps/notes-part-1.xml')
				return false;
			response.setHeader('content-type', 'application/xml');
			response.end(
				url.pathname === '/notes/sitemap.xml'
					? `<sitemapindex><sitemap><loc>${SITE}/sitemaps/notes-part-1.xml</loc></sitemap></sitemapindex>`
					: `<urlset><url><loc>${SITE}/notes/only-in-sitemap</loc></url></urlset>`
			);
			return true;
		}
	});
	assert.equal(report.complete, true);
	assert.deepEqual(report.issues, []);
	assert.ok(report.pages.some((page) => page.url === `${SITE}/notes/only-in-sitemap`));
});

test('source discovery warnings and destination limits prevent a complete coverage claim', async (t) => {
	const warningReport = await auditFixture(t, {
		files: { 'src/lib/posts/malformed.md': 'Article without its required frontmatter.' }
	});
	assert.equal(warningReport.complete, false);
	assert.match(warningReport.warnings.join('\n'), /must begin with a YAML frontmatter/);
	const truncatedReport = await auditFixture(t, { maxUrls: 1 });
	assert.equal(truncatedReport.complete, false);
});

test('a sitemap returning HTML or an unrelated XML document is an explicit failure', async (t) => {
	const report = await auditFixture(t, {
		respond(url, response) {
			if (url.pathname === '/notes/sitemap.xml') {
				response.setHeader('content-type', 'text/html');
				response.end('<h1>Wrong resource</h1>');
				return true;
			}
			if (url.pathname === '/sitemap.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end('<unrelated></unrelated>');
				return true;
			}
			return false;
		}
	});
	assert.ok(
		report.issues.some(
			(issue) => issue.type === 'content-type' && issue.url === `${SITE}/notes/sitemap.xml`
		)
	);
	assert.ok(
		report.issues.some(
			(issue) => issue.type === 'invalid-xml-document' && issue.url === `${SITE}/sitemap.xml`
		)
	);
});
