#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
	REPORT_FILES,
	SITE_ORIGIN,
	USER_AGENTS,
	normalizeAuditUrl,
	parseCsvRows,
	toCsv
} from './audit-traffic-indexing.mjs';

const AUDIT_DATE = '2026-08-06';
const REPORT_DIRECTORY = path.resolve('docs', 'audits', `traffic-${AUDIT_DATE}`);
const ROBOTS_SHA256 = '75bc9190e8279dfeab6236f24f50870cf2ef7ad5c1a7d4487ce74ef5601095b9';

const GENERIC_ANCHORS = new Set([
	'(empty or non-text link)',
	'(empty-or-non-text-link)',
	'click here',
	'continue',
	'continue reading',
	'details',
	'explore',
	'find out more',
	'go',
	'here',
	'learn more',
	'more',
	'newer post',
	'newer posts',
	'next',
	'older post',
	'older posts',
	'open',
	'previous',
	'read more',
	'see more',
	'view',
	'view details',
	'view more',
	'visit'
]);

const CONTEXTUAL_CONTEXTS = new Set(['main', 'article', 'body']);
const BOILERPLATE_CONTEXTS = new Set(['header', 'footer', 'nav', 'breadcrumb']);
const MEANINGFUL_EXCLUDED_CONTEXTS = new Set([
	'pagination',
	'related_widget',
	'breadcrumb',
	'header',
	'footer'
]);

const booleanValue = (value) => value === 'true';
const numberValue = (value) => (value === '' || value === undefined ? null : Number(value));
const occurrenceCount = (edge) => Number(edge.occurrences || 0);
const hiddenCount = (edge) => Number(edge.hidden_occurrences || 0);
const visibleOccurrences = (edge) => Math.max(0, occurrenceCount(edge) - hiddenCount(edge));

function normalizeAnchor(value) {
	return String(value ?? '')
		.toLocaleLowerCase('en')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^(?:←|→)\s*|\s*(?:←|→)$/gu, '')
		.replace(/[.!?:;…]+$/u, '')
		.trim();
}

function markdownCell(value) {
	return String(value ?? '')
		.replace(/\r?\n/g, ' ')
		.replace(/\|/g, '\\|');
}

function markdownTable(headers, rows) {
	return [
		`| ${headers.map(markdownCell).join(' | ')} |`,
		`| ${headers.map(() => '---').join(' | ')} |`,
		...rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`)
	].join('\n');
}

function shortUrl(value) {
	const url = new URL(value);
	return `${url.pathname}${url.search}`;
}

async function loadCsv(filename) {
	const text = await fs.readFile(path.join(REPORT_DIRECTORY, filename), 'utf8');
	const [header = [], ...matrix] = parseCsvRows(text);
	assert(header.length > 0, `${filename} has no header.`);
	for (const [index, row] of matrix.entries()) {
		assert.equal(row.length, header.length, `${filename}:${index + 2} has the wrong field count.`);
	}
	return {
		header,
		rows: matrix.map((row) =>
			Object.fromEntries(header.map((name, index) => [name, row[index] ?? '']))
		)
	};
}

function assertUnique(rows, key, label) {
	assert.equal(
		new Set(rows.map(key)).size,
		rows.length,
		`${label} contains duplicate primary keys.`
	);
}

function countBy(values) {
	const result = {};
	for (const value of values) result[value] = (result[value] ?? 0) + 1;
	return Object.fromEntries(
		Object.entries(result).sort(([left], [right]) => left.localeCompare(right))
	);
}

function breadthFirstDepth(nodes, edges) {
	const outbound = new Map([...nodes].map((url) => [url, new Set()]));
	for (const edge of edges) outbound.get(edge.source_url)?.add(edge.target_url);
	const depths = new Map([...nodes].map((url) => [url, null]));
	const homepage = normalizeAuditUrl('/', SITE_ORIGIN);
	depths.set(homepage, 0);
	const queue = [homepage];
	for (let cursor = 0; cursor < queue.length; cursor += 1) {
		const source = queue[cursor];
		for (const target of outbound.get(source) ?? []) {
			if (depths.get(target) !== null) continue;
			depths.set(target, depths.get(source) + 1);
			queue.push(target);
		}
	}
	return depths;
}

function depthDistribution(values) {
	const distribution = { 0: 0, 1: 0, 2: 0, 3: 0, '>3': 0, unreachable: 0 };
	for (const value of values) {
		if (value === null) distribution.unreachable += 1;
		else if (value > 3) distribution['>3'] += 1;
		else distribution[value] += 1;
	}
	return distribution;
}

function nearestRankPercentile(values, quantile) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

function targetMetrics(nodes, visibleEdges) {
	const incoming = new Map([...nodes].map((url) => [url, []]));
	for (const edge of visibleEdges) incoming.get(edge.target_url)?.push(edge);
	return new Map(
		[...nodes].map((url) => {
			const edges = incoming.get(url) ?? [];
			const totalVisible = edges.reduce((sum, edge) => sum + visibleOccurrences(edge), 0);
			const genericVisible = edges
				.filter((edge) => GENERIC_ANCHORS.has(normalizeAnchor(edge.anchor_text_normalized)))
				.reduce((sum, edge) => sum + visibleOccurrences(edge), 0);
			const contextual = edges.filter((edge) => CONTEXTUAL_CONTEXTS.has(edge.link_context));
			const boilerplate = edges.filter((edge) => BOILERPLATE_CONTEXTS.has(edge.link_context));
			return [
				url,
				{
					edges,
					visibleOccurrences: totalVisible,
					genericVisibleOccurrences: genericVisible,
					genericVisibleShare: totalVisible ? genericVisible / totalVisible : 0,
					contextualSourcePages: new Set(contextual.map((edge) => edge.source_url)).size,
					boilerplateVisibleOccurrences: boilerplate.reduce(
						(sum, edge) => sum + visibleOccurrences(edge),
						0
					),
					paginationOnly:
						edges.length > 0 && edges.every((edge) => edge.link_context === 'pagination'),
					relatedWidgetOnly:
						edges.length > 0 && edges.every((edge) => edge.link_context === 'related_widget'),
					redirectingInlinkOccurrences: edges
						.filter((edge) => booleanValue(edge.linked_url_is_redirect))
						.reduce((sum, edge) => sum + visibleOccurrences(edge), 0),
					noncanonicalVariantInlinkOccurrences: edges
						.filter((edge) => booleanValue(edge.linked_url_is_noncanonical_variant))
						.reduce((sum, edge) => sum + visibleOccurrences(edge), 0)
				}
			];
		})
	);
}

function hubMetrics(visibleEdges, flagshipRows) {
	const flagshipBucket = new Map(flagshipRows.map((row) => [row.canonical_url, row.bucket]));
	const metrics = new Map();
	for (const edge of visibleEdges.filter((candidate) => booleanValue(candidate.source_is_hub))) {
		const current = metrics.get(edge.source_url) ?? {
			url: edge.source_url,
			targets: new Set(),
			anchors: new Set(),
			descriptiveTargets: new Set(),
			contextualTargets: new Set(),
			flagships: new Set(),
			visibleOccurrences: 0,
			genericOccurrences: 0,
			observedVisitors:
				edge.source_28d_visitors === '' ? null : numberValue(edge.source_28d_visitors)
		};
		const anchor = normalizeAnchor(edge.anchor_text_normalized);
		current.targets.add(edge.target_url);
		current.anchors.add(anchor);
		current.visibleOccurrences += visibleOccurrences(edge);
		if (GENERIC_ANCHORS.has(anchor)) current.genericOccurrences += visibleOccurrences(edge);
		else current.descriptiveTargets.add(edge.target_url);
		if (CONTEXTUAL_CONTEXTS.has(edge.link_context)) current.contextualTargets.add(edge.target_url);
		if (flagshipBucket.has(edge.target_url)) current.flagships.add(edge.target_url);
		metrics.set(edge.source_url, current);
	}
	return [...metrics.values()]
		.map((metric) => ({
			url: metric.url,
			targetCount: metric.targets.size,
			visibleOccurrences: metric.visibleOccurrences,
			distinctAnchors: metric.anchors.size,
			descriptiveTargetCoverage: metric.targets.size
				? metric.descriptiveTargets.size / metric.targets.size
				: 0,
			genericShare: metric.visibleOccurrences
				? metric.genericOccurrences / metric.visibleOccurrences
				: 0,
			contextualTargetCount: metric.contextualTargets.size,
			flagshipCount: metric.flagships.size,
			flagshipBuckets: countBy([...metric.flagships].map((url) => flagshipBucket.get(url))),
			flagships: [...metric.flagships].sort(),
			observedVisitors: metric.observedVisitors
		}))
		.sort(
			(left, right) => right.targetCount - left.targetCount || left.url.localeCompare(right.url)
		);
}

function technicalEligibility(indexabilityRows, graphNodes, robotsMatches) {
	if (!robotsMatches) return new Set();
	return new Set(
		indexabilityRows
			.filter((row) => {
				if (
					row.http_status !== '200' ||
					!booleanValue(row.is_html) ||
					!booleanValue(row.indexable) ||
					booleanValue(row.noindex) ||
					booleanValue(row.robots_conflict) ||
					booleanValue(row.bot_challenge_or_waf_review) ||
					!row.canonical_url
				) {
					return false;
				}
				const requested = normalizeAuditUrl(row.requested_url, SITE_ORIGIN);
				return (
					requested === normalizeAuditUrl(row.final_url, SITE_ORIGIN) &&
					requested === normalizeAuditUrl(row.canonical_url, SITE_ORIGIN) &&
					graphNodes.has(requested)
				);
			})
			.map((row) => normalizeAuditUrl(row.requested_url, SITE_ORIGIN))
	);
}

function buildAliasMap(inventoryRows, redirectRows, graphNodes) {
	const aliases = new Map();
	const evidence = new Map();
	const add = (rawUrl, targetUrl, reason) => {
		if (!rawUrl || !targetUrl) return;
		const source = normalizeAuditUrl(rawUrl, SITE_ORIGIN);
		const target = normalizeAuditUrl(targetUrl, SITE_ORIGIN);
		if (!graphNodes.has(target)) return;
		if (aliases.has(source)) {
			assert.equal(aliases.get(source), target, `Conflicting canonical targets for ${source}.`);
		} else aliases.set(source, target);
		const reasons = evidence.get(source) ?? new Set();
		reasons.add(reason);
		evidence.set(source, reasons);
	};

	for (const row of inventoryRows) {
		let target = '';
		for (const candidate of [row.canonical_url, row.final_url, row.requested_url]) {
			if (!candidate) continue;
			const normalized = normalizeAuditUrl(candidate, SITE_ORIGIN);
			if (graphNodes.has(normalized)) {
				target = normalized;
				break;
			}
		}
		if (!target) continue;
		add(
			row.requested_url,
			target,
			Number(row.redirect_hops) > 0 ? 'URL_INVENTORY_REDIRECT' : 'URL_INVENTORY_REQUESTED'
		);
		add(row.final_url, target, 'URL_INVENTORY_FINAL');
	}

	for (const row of redirectRows) {
		const target = aliases.get(normalizeAuditUrl(row.requested_url, SITE_ORIGIN));
		if (!target) continue;
		add(row.from_url, target, 'REDIRECT_HOP');
		add(row.to_url, target, 'REDIRECT_HOP');
	}
	return { aliases, evidence };
}

function buildTrafficReconciliation({
	trafficRows,
	inventoryRows,
	depthRows,
	aliases,
	evidence,
	eligibleUrls
}) {
	const inventoryByRequested = new Map(
		inventoryRows.map((row) => [normalizeAuditUrl(row.requested_url, SITE_ORIGIN), row])
	);
	const depthByUrl = new Map(
		depthRows.map((row) => [normalizeAuditUrl(row.url, SITE_ORIGIN), row])
	);
	const observed = trafficRows
		.filter((row) => row.status === 'OBSERVED' && row.path.startsWith('/'))
		.map((row) => {
			const rawUrl = normalizeAuditUrl(row.path, SITE_ORIGIN);
			return { ...row, rawUrl, canonicalUrl: aliases.get(rawUrl) ?? '' };
		});
	const groups = new Map();
	for (const row of observed.filter((candidate) => candidate.canonicalUrl)) {
		const group = groups.get(row.canonicalUrl) ?? [];
		group.push(row);
		groups.set(row.canonicalUrl, group);
	}

	const groupMetrics = new Map(
		[...groups].map(([canonicalUrl, rows]) => {
			const visitorWinner = [...rows].sort(
				(left, right) =>
					Number(right.visitors) - Number(left.visitors) ||
					Number(right.page_views_estimate) - Number(left.page_views_estimate) ||
					left.path.localeCompare(right.path)
			)[0];
			const viewWinner = [...rows].sort(
				(left, right) =>
					Number(right.page_views_estimate) - Number(left.page_views_estimate) ||
					Number(right.visitors) - Number(left.visitors) ||
					left.path.localeCompare(right.path)
			)[0];
			return [
				canonicalUrl,
				{
					rows,
					paths: rows.map((row) => row.path).sort(),
					visitorMax: Number(visitorWinner.visitors),
					visitorSumNotUsed: rows.reduce((sum, row) => sum + Number(row.visitors), 0),
					viewMax: Number(viewWinner.page_views_estimate),
					viewSumNotUsed: rows.reduce((sum, row) => sum + Number(row.page_views_estimate), 0),
					viewPrecision: viewWinner.page_views_precision,
					representativePath: visitorWinner.path
				}
			];
		})
	);

	for (const [canonicalUrl, group] of groupMetrics) {
		const depth = depthByUrl.get(canonicalUrl);
		assert(depth, `Traffic canonical ${canonicalUrl} is missing from CRAWL_DEPTH.csv.`);
		assert.equal(Number(depth.observed_28d_visitors), group.visitorMax);
	}

	const rows = [];
	for (const row of trafficRows) {
		if (row.status !== 'OBSERVED' || !row.path.startsWith('/')) {
			rows.push({
				raw_path: row.path,
				raw_url: '',
				analytics_status: row.status,
				canonical_url: '',
				reconciliation_status: 'EXCLUDED_AGGREGATED_NON_UNIQUE',
				mapping_evidence: 'SANITIZED_SOURCE_AGGREGATE',
				live_http_status: '',
				live_redirect_hops: '',
				live_final_url: '',
				canonical_technically_eligible: '',
				visitors_28d_raw: row.visitors,
				page_views_estimate_28d_raw: row.page_views_estimate,
				page_views_precision_raw: row.page_views_precision,
				canonical_group_member_count: '',
				canonical_group_paths: '',
				canonical_visitors_28d_conservative_max_not_sum: '',
				canonical_visitors_28d_raw_sum_not_used: '',
				canonical_page_views_28d_conservative_max_not_sum: '',
				canonical_page_views_28d_raw_sum_not_used: '',
				canonical_page_views_precision: '',
				canonical_group_representative: '',
				window: row.window,
				caveat: 'Sanitized non-unique aggregate excluded from every canonical total.'
			});
			continue;
		}
		const rawUrl = normalizeAuditUrl(row.path, SITE_ORIGIN);
		const canonicalUrl = aliases.get(rawUrl) ?? '';
		const direct = inventoryByRequested.get(rawUrl);
		if (!canonicalUrl) {
			rows.push({
				raw_path: row.path,
				raw_url: rawUrl,
				analytics_status: row.status,
				canonical_url: '',
				reconciliation_status: 'UNMATCHED_PUBLIC_PATH',
				mapping_evidence: 'NO_ACCEPTED_CRAWL_MATCH',
				live_http_status: direct?.http_status ?? '',
				live_redirect_hops: direct?.redirect_hops ?? '',
				live_final_url: direct?.final_url ?? '',
				canonical_technically_eligible: '',
				visitors_28d_raw: row.visitors,
				page_views_estimate_28d_raw: row.page_views_estimate,
				page_views_precision_raw: row.page_views_precision,
				canonical_group_member_count: '',
				canonical_group_paths: '',
				canonical_visitors_28d_conservative_max_not_sum: '',
				canonical_visitors_28d_raw_sum_not_used: '',
				canonical_page_views_28d_conservative_max_not_sum: '',
				canonical_page_views_28d_raw_sum_not_used: '',
				canonical_page_views_precision: '',
				canonical_group_representative: '',
				window: row.window,
				caveat:
					'No accepted-crawl canonical or alias match; a historical analytics path is not proof of a current 404 or deletion.'
			});
			continue;
		}
		const proof = [...(evidence.get(rawUrl) ?? [])].sort();
		const group = groupMetrics.get(canonicalUrl);
		const redirectAlias =
			proof.includes('REDIRECT_HOP') || proof.includes('URL_INVENTORY_REDIRECT');
		rows.push({
			raw_path: row.path,
			raw_url: rawUrl,
			analytics_status: row.status,
			canonical_url: canonicalUrl,
			reconciliation_status:
				rawUrl === canonicalUrl
					? 'CANONICAL_SELF'
					: redirectAlias
						? 'REDIRECT_ALIAS'
						: 'DECLARED_CANONICAL_ALIAS',
			mapping_evidence: proof,
			live_http_status: direct?.http_status ?? '',
			live_redirect_hops: direct?.redirect_hops ?? '',
			live_final_url: direct?.final_url ?? '',
			canonical_technically_eligible: eligibleUrls.has(canonicalUrl),
			visitors_28d_raw: row.visitors,
			page_views_estimate_28d_raw: row.page_views_estimate,
			page_views_precision_raw: row.page_views_precision,
			canonical_group_member_count: group.rows.length,
			canonical_group_paths: group.paths,
			canonical_visitors_28d_conservative_max_not_sum: group.visitorMax,
			canonical_visitors_28d_raw_sum_not_used: group.visitorSumNotUsed,
			canonical_page_views_28d_conservative_max_not_sum: group.viewMax,
			canonical_page_views_28d_raw_sum_not_used: group.viewSumNotUsed,
			canonical_page_views_precision: group.viewPrecision,
			canonical_group_representative: row.path === group.representativePath,
			window: row.window,
			caveat:
				'Canonical group uses maxima, never sums; route visitors overlap and the Vercel data remains automation-contaminated.'
		});
	}

	rows.sort(
		(left, right) =>
			(left.canonical_url || `~${left.reconciliation_status}`).localeCompare(
				right.canonical_url || `~${right.reconciliation_status}`
			) || left.raw_path.localeCompare(right.raw_path)
	);
	return { rows, observed, groups, groupMetrics };
}

function flagshipRecommendation(row) {
	if (row.dead_end) return 'Resolve the dead end before promotion.';
	if (row.near_orphan)
		return 'Add one owner-approved contextual source from the closest relevant hub.';
	if (row.meaningful_click_depth > 3) {
		return 'Review one contextual link from a shallow, relevant writing or identity hub; preserve the literary framing.';
	}
	if (row.links_from_observed_high_traffic_pages === 0) {
		return 'Retain current hub support; test a high-traffic contextual path only after clean-human traffic is available.';
	}
	return 'Maintain current contextual and hub coverage; prioritize evidence, performance, and measured demand.';
}

function privacyCheck(filename, value) {
	assert(!/[A-Za-z]:\\/.test(value), `${filename} contains a local Windows path.`);
	assert(
		!/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(value),
		`${filename} contains a UUID.`
	);
	assert(!/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value), `${filename} contains an IPv4-like value.`);
	assert(
		!/(?:\/api(?:\/|$)|\/notes\/(?:studio|sign-in|forgot-password|reset-password)(?:\/|$))/i.test(
			value
		),
		`${filename} contains a protected route.`
	);
}

async function main() {
	const csvNames = REPORT_FILES.filter((filename) => filename.endsWith('.csv'));
	const csv = Object.fromEntries(
		await Promise.all(csvNames.map(async (filename) => [filename, await loadCsv(filename)]))
	);
	const summary = JSON.parse(
		await fs.readFile(path.join(REPORT_DIRECTORY, 'AUDIT_SUMMARY.json'), 'utf8')
	);
	const traffic = await loadCsv('TRAFFIC_BY_PAGE.csv');
	const flagships = await loadCsv('FLAGSHIP_PAGES.csv');

	const inventoryRows = csv['URL_INVENTORY.csv'].rows;
	const indexabilityRows = csv['INDEXABILITY.csv'].rows;
	const redirectRows = csv['REDIRECTS.csv'].rows;
	const reconciliationRows = csv['SITEMAP_RECONCILIATION.csv'].rows;
	const graphRows = csv['INTERNAL_LINK_GRAPH.csv'].rows;
	const orphanRows = csv['ORPHANS.csv'].rows;
	const depthRows = csv['CRAWL_DEPTH.csv'].rows;
	const userAgentSampleRows = csv['USER_AGENT_SAMPLE.csv'].rows;
	const userAgentRows = csv['USER_AGENT_COMPARISON.csv'].rows;
	const variantRows = csv['URL_VARIANTS.csv'].rows;

	assertUnique(inventoryRows, (row) => row.requested_url, 'URL_INVENTORY.csv');
	assertUnique(indexabilityRows, (row) => row.requested_url, 'INDEXABILITY.csv');
	assertUnique(redirectRows, (row) => `${row.requested_url}\n${row.hop}`, 'REDIRECTS.csv');
	assertUnique(reconciliationRows, (row) => row.url, 'SITEMAP_RECONCILIATION.csv');
	assertUnique(orphanRows, (row) => row.url, 'ORPHANS.csv');
	assertUnique(depthRows, (row) => row.url, 'CRAWL_DEPTH.csv');
	assertUnique(userAgentSampleRows, (row) => row.url, 'USER_AGENT_SAMPLE.csv');
	assertUnique(
		userAgentRows,
		(row) => `${row.requested_url}\n${row.user_agent_key}`,
		'USER_AGENT_COMPARISON.csv'
	);
	assertUnique(
		variantRows,
		(row) => `${row.variant_type}\n${row.requested_url}\n${row.baseline_url}`,
		'URL_VARIANTS.csv'
	);

	assert.equal(summary.schemaVersion, 1);
	assert.equal(summary.origin, SITE_ORIGIN);
	assert.equal(summary.config.concurrency, 4);
	assert.equal(summary.config.requestsPerSecond, 2);
	assert.equal(summary.config.renderMode, 'all');
	assert.equal(summary.config.bundleWeightMode, 'full');
	assert.equal(summary.counts.crawledUrls, inventoryRows.length);
	assert.equal(summary.counts.inventoryUrls, reconciliationRows.length);
	assert.equal(summary.counts.canonicalGraphNodes, depthRows.length);
	assert.equal(summary.counts.renderedDomGraphNodes, depthRows.length);
	assert.equal(summary.counts.serverHtmlFallbackGraphNodes, 0);
	assert.equal(summary.counts.internalGraphEdges, graphRows.length);
	assert.equal(
		summary.counts.indexableUrls,
		inventoryRows.filter((row) => booleanValue(row.indexable)).length
	);
	assert.equal(
		summary.counts.nonIndexableUrls,
		inventoryRows.filter((row) => !booleanValue(row.indexable)).length
	);
	assert.equal(
		summary.counts.redirectingUrls,
		new Set(redirectRows.map((row) => row.requested_url)).size
	);
	assert.equal(summary.counts.userAgentSampleUrls, userAgentSampleRows.length);
	assert.equal(summary.counts.userAgentRequests, userAgentRows.length);
	assert.equal(userAgentRows.length, userAgentSampleRows.length * Object.keys(USER_AGENTS).length);
	assert.equal(summary.counts.variantProbes, variantRows.length);
	assert.equal(summary.counts.responseBodyWarnings, 0);
	assert.deepEqual(summary.warnings, []);

	for (const label of ['main_sitemap', 'notes_sitemap', 'rss', 'robots', 'homepage']) {
		assert.equal(summary.inputEvidence[label].status, 200);
		assert.equal(summary.inputEvidence[label].error, '');
		assert.match(summary.inputEvidence[label].bodySha256, /^[a-f0-9]{64}$/);
	}
	const localRobotsHash = crypto
		.createHash('sha256')
		.update(await fs.readFile(path.resolve('static', 'robots.txt')))
		.digest('hex');
	assert.equal(localRobotsHash, ROBOTS_SHA256);
	assert.equal(summary.inputEvidence.robots.bodySha256, ROBOTS_SHA256);

	for (const sample of userAgentSampleRows) {
		const rows = userAgentRows.filter((row) => row.requested_url === sample.url);
		assert.deepEqual(rows.map((row) => row.user_agent_key).sort(), Object.keys(USER_AGENTS).sort());
		assert.equal(
			rows.some((row) => row.error),
			false
		);
	}
	assert.equal(
		userAgentRows.filter(
			(row) =>
				row.user_agent_key !== 'desktop' && booleanValue(row.materially_different_from_desktop)
		).length,
		summary.counts.materialUserAgentDifferences
	);
	assert.equal(userAgentRows.filter((row) => booleanValue(row.challenge_detected)).length, 0);

	const graphNodes = new Set(depthRows.map((row) => normalizeAuditUrl(row.url, SITE_ORIGIN)));
	assert.equal(graphRows.filter((row) => row.link_evidence !== 'rendered_dom').length, 0);
	assert.equal(
		graphRows.filter((row) =>
			[row.linked_url, row.raw_href, row.target_url].some((value) => value.includes('[object'))
		).length,
		0
	);
	assert.equal(graphRows.filter((row) => !graphNodes.has(row.source_url)).length, 0);
	assert.equal(
		graphRows.filter(
			(row) => booleanValue(row.target_is_crawled_canonical) && !graphNodes.has(row.target_url)
		).length,
		0
	);
	assert.equal(graphRows.filter((row) => !booleanValue(row.target_is_crawled_canonical)).length, 0);

	const protectedPattern =
		/(?:\/api(?:\/|$)|\/notes\/(?:studio|sign-in|forgot-password|reset-password)(?:\/|$))/i;
	for (const row of inventoryRows) {
		assert.equal(
			[row.requested_url, row.final_url, row.canonical_url, row.og_url].some((value) =>
				protectedPattern.test(value)
			),
			false
		);
	}
	for (const row of graphRows) {
		assert.equal(
			[row.source_url, row.linked_url, row.target_url].some((value) =>
				protectedPattern.test(value)
			),
			false
		);
	}

	assert.equal(flagships.rows.length, 25);
	assert.equal(
		flagships.rows.filter((row) =>
			graphNodes.has(normalizeAuditUrl(row.canonical_url, SITE_ORIGIN))
		).length,
		25
	);

	const robotsMatches = summary.inputEvidence.robots.bodySha256 === localRobotsHash;
	const eligibleUrls = technicalEligibility(indexabilityRows, graphNodes, robotsMatches);
	const { aliases, evidence } = buildAliasMap(inventoryRows, redirectRows, graphNodes);
	const trafficReconciliation = buildTrafficReconciliation({
		trafficRows: traffic.rows,
		inventoryRows,
		depthRows,
		aliases,
		evidence,
		eligibleUrls
	});
	assert.equal(trafficReconciliation.groups.size, summary.counts.trafficMatchedCanonicalUrls);
	const highTrafficCount = Math.ceil(trafficReconciliation.groups.size * 0.1);
	const expectedHighTraffic = new Set(
		[...trafficReconciliation.groupMetrics]
			.map(([url, group]) => ({ url, visitors: group.visitorMax }))
			.sort((left, right) => right.visitors - left.visitors || left.url.localeCompare(right.url))
			.slice(0, highTrafficCount)
			.map((row) => row.url)
	);
	assert.equal(expectedHighTraffic.size, summary.counts.observedHighTrafficCanonicalUrls);
	for (const row of depthRows) {
		assert.equal(booleanValue(row.observed_high_traffic), expectedHighTraffic.has(row.url));
	}

	const topologyEdges = graphRows.filter(
		(row) =>
			booleanValue(row.target_is_crawled_canonical) && !booleanValue(row.self_canonical_target)
	);
	const visibleEdges = topologyEdges.filter((row) => visibleOccurrences(row) > 0);
	const meaningfulEdges = visibleEdges.filter(
		(row) => !MEANINGFUL_EXCLUDED_CONTEXTS.has(row.link_context)
	);
	const visibleDepth = breadthFirstDepth(graphNodes, visibleEdges);
	const meaningfulDepth = breadthFirstDepth(graphNodes, meaningfulEdges);
	const metricsByTarget = targetMetrics(graphNodes, visibleEdges);
	const hubs = hubMetrics(visibleEdges, flagships.rows);
	const depthByUrl = new Map(depthRows.map((row) => [row.url, row]));
	const flagshipArchitecture = flagships.rows
		.map((flagship) => {
			const canonicalUrl = normalizeAuditUrl(flagship.canonical_url, SITE_ORIGIN);
			const depth = depthByUrl.get(canonicalUrl);
			const metrics = metricsByTarget.get(canonicalUrl);
			const row = {
				bucket: flagship.bucket,
				title: flagship.title,
				canonical_url: canonicalUrl,
				canonical_technically_eligible: eligibleUrls.has(canonicalUrl),
				observed_28d_visitors_directional: depth.observed_28d_visitors,
				inbound_internal_link_occurrences: depth.inbound_internal_link_count,
				unique_source_pages: depth.unique_source_pages,
				outbound_unique_targets: depth.out_degree,
				crawler_click_depth: depth.click_depth_from_homepage,
				visible_click_depth: visibleDepth.get(canonicalUrl),
				meaningful_click_depth: meaningfulDepth.get(canonicalUrl),
				weak_component_id: depth.weak_component_id,
				component_size: depth.component_size,
				pagerank: depth.pagerank,
				topic_cluster: depth.topic_cluster,
				links_from_hubs: Number(depth.links_from_hubs),
				links_from_observed_high_traffic_pages: Number(
					depth.links_from_observed_high_traffic_pages
				),
				orphan_status: depth.orphan_status,
				near_orphan: booleanValue(depth.near_orphan_status),
				dead_end: booleanValue(depth.dead_end_status),
				visible_contextual_source_pages: metrics.contextualSourcePages,
				pagination_only: metrics.paginationOnly,
				related_widget_only: metrics.relatedWidgetOnly,
				generic_anchor_visible_occurrences: metrics.genericVisibleOccurrences,
				generic_anchor_visible_share: Number(metrics.genericVisibleShare.toFixed(6)),
				redirecting_inlink_occurrences: metrics.redirectingInlinkOccurrences,
				noncanonical_variant_inlink_occurrences: metrics.noncanonicalVariantInlinkOccurrences
			};
			return { ...row, bounded_recommendation: flagshipRecommendation(row) };
		})
		.sort(
			(left, right) =>
				left.bucket.localeCompare(right.bucket) ||
				left.canonical_url.localeCompare(right.canonical_url)
		);
	assert.equal(flagshipArchitecture.length, 25);
	assert.equal(flagshipArchitecture.filter((row) => row.canonical_technically_eligible).length, 25);

	const contextOccurrences = countBy(
		graphRows.flatMap((row) => Array.from({ length: occurrenceCount(row) }, () => row.link_context))
	);
	const hiddenByContext = {};
	for (const row of graphRows) {
		hiddenByContext[row.link_context] = (hiddenByContext[row.link_context] ?? 0) + hiddenCount(row);
	}
	const genericByAnchor = {};
	for (const row of visibleEdges) {
		const anchor = normalizeAnchor(row.anchor_text_normalized);
		if (!GENERIC_ANCHORS.has(anchor)) continue;
		genericByAnchor[anchor] = (genericByAnchor[anchor] ?? 0) + visibleOccurrences(row);
	}
	const boilerplateValues = [...metricsByTarget.values()]
		.map((metric) => metric.boilerplateVisibleOccurrences)
		.filter((value) => value > 0);
	const boilerplateP90 = nearestRankPercentile(boilerplateValues, 0.9);
	const boilerplateReviewCount = [...metricsByTarget.values()].filter(
		(metric) =>
			metric.contextualSourcePages === 0 && metric.boilerplateVisibleOccurrences >= boilerplateP90
	).length;

	const nearOrphans = depthRows.filter((row) => booleanValue(row.near_orphan_status));
	const nearOrphanType = (url) => {
		const parsed = new URL(url);
		if (parsed.searchParams.has('page')) return 'Pagination';
		if (parsed.pathname.startsWith('/notebooks/')) return 'Notebook';
		if (parsed.pathname.startsWith('/notes/')) return 'Note';
		if (parsed.pathname.startsWith('/resources/')) return 'Resource';
		if (parsed.pathname.startsWith('/blog/')) return 'Category or writing hub';
		return 'Other';
	};
	const nearOrphanTypes = countBy(nearOrphans.map((row) => nearOrphanType(row.url)));
	const deadEnds = depthRows.filter((row) => booleanValue(row.dead_end_status));
	const paginationOnly = [...metricsByTarget].filter(([, metric]) => metric.paginationOnly);
	const relatedWidgetOnly = [...metricsByTarget].filter(([, metric]) => metric.relatedWidgetOnly);
	const visiblyUnreachable = [...visibleDepth].filter(([, depth]) => depth === null);
	const redirectEdges = visibleEdges.filter((row) => booleanValue(row.linked_url_is_redirect));
	const variantEdges = visibleEdges.filter((row) =>
		booleanValue(row.linked_url_is_noncanonical_variant)
	);
	const redirectSourceCount = new Set(redirectEdges.map((row) => row.source_url)).size;
	const redirectTargetCount = new Set(redirectEdges.map((row) => row.target_url)).size;
	const variantSourceCount = new Set(variantEdges.map((row) => row.source_url)).size;
	const variantTargetCount = new Set(variantEdges.map((row) => row.target_url)).size;
	const allVariantQueryOrderOnly = variantEdges.every(
		(row) => normalizeAuditUrl(row.linked_url, SITE_ORIGIN) === row.target_url
	);
	assert.equal(allVariantQueryOrderOnly, true);

	const absentSitemap = inventoryRows.filter((row) =>
		row.issues.split(' | ').includes('CANONICAL_ABSENT_FROM_SITEMAP')
	);
	const absentSitemapType = (url) => {
		const parsed = new URL(url);
		if (parsed.searchParams.has('page')) return 'Pagination query';
		if (parsed.pathname.startsWith('/notebooks/')) return 'Standalone notebook';
		if (parsed.pathname === '/notes') return 'Notes hub';
		if (parsed.pathname === '/images') return 'Image-tab canonical';
		return 'Other';
	};
	const absentSitemapTypes = countBy(
		absentSitemap.map((row) => absentSitemapType(row.requested_url))
	);
	const sitemapRows = reconciliationRows.filter(
		(row) => booleanValue(row.in_main_sitemap) || booleanValue(row.in_notes_sitemap)
	);
	assert.equal(
		sitemapRows.filter(
			(row) =>
				row.http_status !== '200' ||
				normalizeAuditUrl(row.url, SITE_ORIGIN) !== normalizeAuditUrl(row.final_url, SITE_ORIGIN) ||
				!row.declared_canonical ||
				normalizeAuditUrl(row.url, SITE_ORIGIN) !==
					normalizeAuditUrl(row.declared_canonical, SITE_ORIGIN)
		).length,
		0
	);

	const crawlerDepthDistribution = depthDistribution(
		depthRows.map((row) => numberValue(row.click_depth_from_homepage))
	);
	const visibleDepthDistribution = depthDistribution(visibleDepth.values());
	const meaningfulDepthDistribution = depthDistribution(meaningfulDepth.values());
	const components = countBy(depthRows.map((row) => row.weak_component_id));
	const flagshipSummary = {
		orphan: flagshipArchitecture.filter((row) => row.orphan_status === 'orphan').length,
		nearOrphan: flagshipArchitecture.filter((row) => row.near_orphan).length,
		deadEnd: flagshipArchitecture.filter((row) => row.dead_end).length,
		meaningfulDepthOverThree: flagshipArchitecture.filter(
			(row) => row.meaningful_click_depth !== null && row.meaningful_click_depth > 3
		).length,
		meaningfulUnreachable: flagshipArchitecture.filter((row) => row.meaningful_click_depth === null)
			.length,
		noContextualSources: flagshipArchitecture.filter(
			(row) => row.visible_contextual_source_pages === 0
		).length,
		noHubSources: flagshipArchitecture.filter((row) => row.links_from_hubs === 0).length,
		noObservedHighTrafficSources: flagshipArchitecture.filter(
			(row) => row.links_from_observed_high_traffic_pages === 0
		).length
	};

	const depthTable = markdownTable(
		['Graph', 'Depth 0', 'Depth 1', 'Depth 2', 'Depth 3', '>3', 'Unreachable'],
		[
			[
				'Crawler canonical graph (all rendered anchors)',
				crawlerDepthDistribution[0],
				crawlerDepthDistribution[1],
				crawlerDepthDistribution[2],
				crawlerDepthDistribution[3],
				crawlerDepthDistribution['>3'],
				crawlerDepthDistribution.unreachable
			],
			[
				'Visible rendered anchors',
				visibleDepthDistribution[0],
				visibleDepthDistribution[1],
				visibleDepthDistribution[2],
				visibleDepthDistribution[3],
				visibleDepthDistribution['>3'],
				visibleDepthDistribution.unreachable
			],
			[
				'Report-defined meaningful paths',
				meaningfulDepthDistribution[0],
				meaningfulDepthDistribution[1],
				meaningfulDepthDistribution[2],
				meaningfulDepthDistribution[3],
				meaningfulDepthDistribution['>3'],
				meaningfulDepthDistribution.unreachable
			]
		]
	);

	const noHighTrafficFlagships = flagshipArchitecture.filter(
		(row) => row.links_from_observed_high_traffic_pages === 0
	);
	const attentionFlagships = flagshipArchitecture.filter(
		(row) =>
			row.near_orphan ||
			row.dead_end ||
			row.meaningful_click_depth > 3 ||
			row.visible_contextual_source_pages === 0
	);

	const internalReport = `# Internal links and information architecture

Audit date: **${AUDIT_DATE} (Asia/Calcutta)**

Evidence: accepted Ultimate7 production crawl from **${summary.startedAt}** to **${summary.completedAt}**

## Verdict

The accepted rendered crawl does **not** show a site-wide crawl block or disconnected architecture. All **${summary.counts.canonicalGraphNodes} canonical graph nodes** belong to one weak component, the crawler graph has **zero true orphans and zero crawler-unreachable nodes**, and all 25 provisional flagships are matched, technically eligible, contextually linked, and supported by at least one explicit hub. This is technical and architectural evidence, not proof of search-engine indexing, ranking, demand, or human traffic.

The bounded architecture problems are narrower: **${nearOrphans.length} near-orphans**, **${deadEnds.length} standalone notebook dead ends**, **${paginationOnly.length} pagination-only canonicals**, one resource URL whose only rendered inlinks are hidden in the inactive tab, **${redirectEdges.length} redirecting internal-link occurrences**, and two paginated routes with conflicting canonical/title treatment. One flagship is four meaningful clicks deep. These warrant targeted review; they do not justify mass noindexing, redirects, consolidation, or archive deletion.

## Accepted crawl and evidence boundary

${markdownTable(
	['Control', 'Measured result', 'Interpretation'],
	[
		[
			'Inventory',
			`${inventoryRows.length}/${summary.counts.inventoryUrls} reconciled URLs`,
			'Every accepted inventory row completed; terminal status counts are 1,022 HTTP 200 responses.'
		],
		[
			'Redirects',
			`${redirectRows.length} aliases; all one-hop 308`,
			'All terminate successfully; zero chains longer than one and zero loops.'
		],
		[
			'Rendered graph',
			`${depthRows.length}/${depthRows.length} rendered-DOM nodes; ${graphRows.length} evidence rows`,
			'Zero server-HTML fallback nodes and zero corrupt/out-of-graph targets.'
		],
		[
			'User agents',
			`${userAgentSampleRows.length} URLs × ${Object.keys(USER_AGENTS).length} agents = ${userAgentRows.length} requests`,
			'Zero errors, zero challenges, and zero material differences.'
		],
		[
			'Robots',
			`live/local SHA-256 ${ROBOTS_SHA256}`,
			'Exact match; the audited policy allows the named agents and declares both sitemaps.'
		],
		[
			'Sitemaps',
			`${sitemapRows.length} URLs (${sitemapRows.filter((row) => booleanValue(row.in_main_sitemap)).length} main; ${sitemapRows.filter((row) => booleanValue(row.in_notes_sitemap)).length} Notes)`,
			'Every listed URL is a direct 200 and declares itself canonical.'
		],
		[
			'Warnings',
			`${summary.warnings.length} run warnings; ${summary.counts.responseBodyWarnings} body warnings`,
			'The accepted evidence is complete under the crawler contract.'
		]
	]
)}

## Definitions

- **Canonical topology edge:** \`target_is_crawled_canonical=true\` and \`self_canonical_target=false\`. Sitemap membership never counts as an editorial link.
- **Visible occurrence:** \`max(0, occurrences - hidden_occurrences)\`. Hidden and nofollow evidence is retained separately.
- **Contextual editorial link:** rendered context \`main\`, \`article\`, or \`body\`.
- **Boilerplate link:** \`header\`, \`footer\`, \`nav\`, or \`breadcrumb\`. \`aside\` is supplementary; \`pagination\` and \`related_widget\` are special contexts.
- **Near-orphan:** exactly one unique canonical source page. **Dead end:** no unique canonical outbound target. The crawler's \`ORPHANS.csv\` intentionally contains orphan, near-orphan, or unreachable rows; linked dead ends are counted from \`CRAWL_DEPTH.csv\`.
- **Meaningful-path depth:** a supplementary shortest-path calculation over visible canonical edges excluding pagination, related widgets, breadcrumbs, headers, and footers. It retains \`nav\`, \`aside\`, \`main\`, \`article\`, and \`body\`. It is a reader-path diagnostic, not an engine metric.
- **Generic anchor:** lower-cased, whitespace-collapsed text with edge arrows/trailing punctuation removed, matched exactly against the documented set in the postprocessor. Empty/non-text, next/previous, and bare open anchors are counted; descriptive phrases containing those words are not.
- **Observed high traffic:** the top \`ceil(243 × 10%) = 25\` matched canonical paths by the conservative 28-day visitor maximum, sorted by visitors then URL. This is contaminated Vercel context, not organic or human demand.

## Technical eligibility and canonical controls

The crawl recorded **${summary.counts.indexableUrls} indexable requested-URL rows**. A stricter reproducible join identifies **${eligibleUrls.size} technically eligible canonical URLs**: direct 200 HTML, index-allowed, no robots conflict/challenge, self-canonical, present in the accepted graph, and covered by the matching robots policy. The remaining four indexable rows are two standalone notebooks with no canonical declaration and two page-2 routes whose canonical points to a different path. Technical eligibility does **not** establish engine indexing.

The crawler flagged **${absentSitemap.length} canonical candidates absent from a sitemap**:

${markdownTable(
	['Type', 'Rows', 'Required interpretation'],
	Object.entries(absentSitemapTypes).map(([type, count]) => [
		type,
		count,
		type === 'Pagination query'
			? 'Expected review cohort; do not noindex or sitemap all pages without account/query evidence.'
			: 'Review intended canonical/indexing role page by page.'
	])
)}

The two canonical conflicts are \`/blog/topics/middle-class?page=2\` and \`/blog/visualizations?page=2\`; both also repeat the base title/description. The two missing-canonical dead ends are the standalone Perceptron and XOR notebook HTML resources. These four rows are targeted P2 review items, not evidence of portfolio-wide indexability failure.

The 16 bounded variant probes found HTTP, apex, trailing-slash, and query-string consolidation on the sampled baselines. Four mixed-case variants correctly returned 404 and did not consolidate. The sample is not a site-wide variant census.

## Graph shape and depth

${depthTable}

All **${depthRows.length}** nodes are in \`${Object.keys(components)[0]}\`. The all-anchor crawler topology includes hidden responsive/tab links for provenance, so the visible and meaningful rows above are the appropriate reader-path supplements. One URL—\`/resources/lists/satirical-insults-by-intensity\`—is unreachable in the visible graph because all three inlinks from \`/resources\` are inside the inactive rendered tab; it remains present in initial server HTML and in the full canonical graph.

## Orphans, near-orphans, pagination, and dead ends

${markdownTable(
	['Metric', 'Count', 'Interpretation'],
	[
		[
			'True canonical orphans',
			depthRows.filter((row) => row.orphan_status === 'orphan').length,
			'None in the accepted all-anchor graph.'
		],
		[
			'Crawler-unreachable nodes',
			depthRows.filter((row) => !booleanValue(row.reachable_from_homepage)).length,
			'None in the accepted all-anchor graph.'
		],
		[
			'Visible-unreachable nodes',
			visiblyUnreachable.length,
			'One inactive-tab resource link; add a visible path only if the resource remains a public destination.'
		],
		[
			'Near-orphans',
			nearOrphans.length,
			'Exactly one unique canonical source; review by page type, not as one bulk defect.'
		],
		[
			'Pagination-only nodes',
			paginationOnly.length,
			'Expected archive mechanics; no flagship is in this cohort.'
		],
		['Related-widget-only nodes', relatedWidgetOnly.length, 'None.'],
		[
			'Dead ends',
			deadEnds.length,
			'Two standalone notebooks; their parent articles are not dead ends.'
		]
	]
)}

${markdownTable(
	['Near-orphan type', 'Rows'],
	Object.entries(nearOrphanTypes).map(([type, count]) => [type, count])
)}

The **41 category/writing-hub near-orphans** overlap the corpus taxonomy-fragmentation review. That overlap supports a bounded taxonomy review, not automatic consolidation: query evidence, page job, and editorial equivalence are still required. Fourteen near-orphans are pagination URLs, one is a note, one a resource, and two are notebooks.

${markdownTable(
	['Dead-end URL', 'Crawler depth', 'Unique source pages', 'Recommended review'],
	deadEnds.map((row) => [
		shortUrl(row.url),
		row.click_depth_from_homepage,
		row.unique_source_pages,
		'Choose an explicit standalone role: add self-canonical and a visible return path, or document a different owner-approved indexing policy.'
	])
)}

## Link provenance, visibility, and anchors

${markdownTable(
	['Evidence', 'Rows or occurrences', 'Meaning'],
	[
		[
			'Edge evidence rows',
			graphRows.length,
			'Unique source/linked/raw/target/anchor/context/provenance combinations.'
		],
		[
			'Rendered anchor occurrences',
			Object.values(contextOccurrences).reduce((sum, value) => sum + value, 0),
			'All contexts before visibility filtering.'
		],
		[
			'Hidden occurrences',
			graphRows.reduce((sum, row) => sum + hiddenCount(row), 0),
			`${hiddenByContext.header} header, ${hiddenByContext.nav} nav, and ${hiddenByContext.article} article occurrences.`
		],
		[
			'Hidden-only edge rows',
			graphRows.filter((row) => occurrenceCount(row) > 0 && visibleOccurrences(row) === 0).length,
			'Retained for provenance; excluded from visible and meaningful supplements.'
		],
		[
			'Nofollow occurrences',
			graphRows.reduce((sum, row) => sum + Number(row.nofollow_occurrences || 0), 0),
			'None observed.'
		],
		[
			'Redirecting internal links',
			String(redirectEdges.length) +
				' occurrences from ' +
				redirectSourceCount +
				' sources to ' +
				redirectTargetCount +
				' targets',
			'Shared topic navigation still points through two one-hop aliases.'
		],
		[
			'Normalized query-order variants',
			String(variantEdges.length) +
				' occurrences from ' +
				variantSourceCount +
				' sources to ' +
				variantTargetCount +
				' targets',
			'All are image-thumbnail pagination links whose raw query parameter order normalizes to the canonical target; no duplicate representation was inferred.'
		]
	]
)}

The boilerplate review heuristic uses the nearest-rank p90 of positive visible boilerplate inbound occurrences (**${boilerplateP90}**, population ${boilerplateValues.length}) and zero contextual source pages; it yields **${boilerplateReviewCount} review rows**. They are primarily global destinations and archive/category hubs. This is a prioritization aid, not an automatic architecture defect.

${markdownTable(
	['Normalized generic anchor', 'Visible occurrences', 'Boundary'],
	Object.entries(genericByAnchor).map(([anchor, count]) => [
		anchor,
		count,
		anchor === '(empty or non-text link)'
			? 'The extractor does not calculate the accessible name; verify the shared header/card pattern once.'
			: anchor === 'next' || anchor === 'previous'
				? 'Expected pagination control.'
				: 'Review the eight visible resource-card uses for descriptive context.'
	])
)}

## Flagship architecture

All **25/25** provisional flagships matched the graph and the strict technical-eligibility join. None is orphaned, near-orphaned, dead-ended, visibly/contextually unsupported, or dependent on a redirecting/noncanonical inlink. All have explicit hub support. One essay flagship is four meaningful clicks deep; **${flagshipSummary.noObservedHighTrafficSources}** have no link from the directional high-traffic cohort, which is not itself a defect because that cohort is contaminated and rank-bucketed.

${markdownTable(
	['Attention URL', 'Meaningful depth', 'Contextual sources', 'Hub sources', 'Bounded action'],
	attentionFlagships.map((row) => [
		shortUrl(row.canonical_url),
		row.meaningful_click_depth,
		row.visible_contextual_source_pages,
		row.links_from_hubs,
		row.bounded_recommendation
	])
)}

The complete 25-row join is in \`FLAGSHIP_ARCHITECTURE.csv\`. The nine rows without an observed-high-traffic source remain measurement candidates, not instructions to add site-wide links:

${markdownTable(
	['Bucket', 'URL', 'Crawler depth', 'Hub sources'],
	noHighTrafficFlagships.map((row) => [
		row.bucket,
		shortUrl(row.canonical_url),
		row.crawler_click_depth,
		row.links_from_hubs
	])
)}

## Fragment-dependent content

The rendered graph strips fragments from link targets. \`/resources#prompts\` and \`#word-lists\` enhance tab selection, but both panels are present in server-rendered HTML before hydration. Gradient Descent \`#begin\` and \`#open\` activate client commands, while the explanatory article, static fallback, and noscript content remain available without interaction. No principal content was found to be fragment-exclusive. Pure same-page fragment links are excluded from topology; hidden tab links remain explicitly marked as hidden evidence.

## Interpretation boundaries

- This crawl establishes observable technical eligibility and rendered internal discovery only. Google/Bing index coverage, selected canonicals, impressions, clicks, ranking, and manual/security states remain **UNVERIFIED — REQUIRES OWNER ACTION**.
- \`linked_url_is_noncanonical_variant\` is literal-link provenance. Here all 78 rows are query-order normalization, not evidence of multiple indexable pages.
- The full graph's depth/PageRank includes hidden rendered anchors; visible and meaningful depth are separately reported rather than silently substituting a new topology.
- Search demand is unavailable. Do not merge/noindex categories, sitemap every pagination URL, or add links to all flagships from every hub from these counts alone.
- Directional Vercel visitors may include owner, audit, development, or automated activity. They are not human or organic weights.
`;

	const curatedHubUrls = [
		`${SITE_ORIGIN}/`,
		`${SITE_ORIGIN}/start-here`,
		`${SITE_ORIGIN}/writing`,
		`${SITE_ORIGIN}/blog`,
		`${SITE_ORIGIN}/topics`,
		`${SITE_ORIGIN}/projects`,
		`${SITE_ORIGIN}/resume`,
		`${SITE_ORIGIN}/consulting`,
		`${SITE_ORIGIN}/healthcare-it-gulf`,
		`${SITE_ORIGIN}/resources`,
		`${SITE_ORIGIN}/blog/visualizations`,
		`${SITE_ORIGIN}/topics/hl7-fhir`,
		`${SITE_ORIGIN}/topics/healthcare-ai`,
		`${SITE_ORIGIN}/topics/interactive-mathematics`,
		`${SITE_ORIGIN}/topics/calcutta`
	];
	const hubByUrl = new Map(hubs.map((hub) => [hub.url, hub]));
	const curatedHubs = curatedHubUrls.map((url) => {
		const hub = hubByUrl.get(url);
		assert(hub, `Expected hub ${url} is absent.`);
		return hub;
	});
	const baseHubCount = hubs.filter((hub) => !new URL(hub.url).searchParams.has('page')).length;
	const paginationHubCount = hubs.length - baseHubCount;

	const hubReport = `# Hub recommendations

Audit date: **${AUDIT_DATE} (Asia/Calcutta)**

Source: accepted rendered canonical graph; companion evidence in \`INTERNAL_LINK_GRAPH.csv\` and \`FLAGSHIP_ARCHITECTURE.csv\`

## Outcome

The site already has functioning hub layers. The visualization gallery and Interactive Mathematics headquarters each reach all 10 visualization flagships; Projects reaches nine flagships across healthcare and visualization; Consulting reaches three healthcare flagships; HL7 & FHIR reaches four healthcare flagships; Healthcare AI reaches three. The appropriate remedy is therefore **selective path repair**, not a new global navigation system and not links from every hub to every flagship.

The crawler labels **${hubs.length} source pages** as explicit hubs: **${baseHubCount} base/category/topic/static hubs** and **${paginationHubCount} pagination variants**. Pagination variants are reported separately because their large target counts are archive mechanics, not curated editorial breadth.

## Measurement definitions

- Target count is the number of distinct visible canonical destinations; occurrences are visible rendered anchors after subtracting hidden occurrences.
- Contextual targets use \`main\`, \`article\`, or \`body\`. Header/footer/nav/breadcrumb links are boilerplate; pagination and related widgets are separate.
- Descriptive coverage is the share of targets with at least one visible non-generic anchor. The extractor's empty/non-text marker does not calculate accessible names, so it is a review flag rather than an accessibility verdict.
- Flagship counts use the fixed 25-page provisional cohort. Observed visitors are directional Vercel route counts, not additive or verified human/organic demand.

## Existing hub coverage

${markdownTable(
	[
		'Hub',
		'Visible targets',
		'Contextual targets',
		'Flagships',
		'Flagship mix',
		'Observed 28-day visitors'
	],
	curatedHubs.map((hub) => [
		shortUrl(hub.url),
		hub.targetCount,
		hub.contextualTargetCount,
		hub.flagshipCount,
		Object.entries(hub.flagshipBuckets)
			.map(([bucket, count]) => `${bucket}: ${count}`)
			.join('; ') || 'none',
		hub.observedVisitors ?? 'unavailable'
	])
)}

Two apparent gaps are intentional routing layers, not defects by count alone: \`/topics\` links to topic headquarters rather than directly to flagships, and \`/resume\` is a professional record rather than a reading index. Preserve those jobs unless user testing shows confusion.

## Bounded recommendation register

${markdownTable(
	['ID', 'Source scope', 'Measured evidence', 'Proposal', 'Verification', 'Priority'],
	[
		[
			'HUB-01',
			'/healthcare-it-gulf',
			'13 visible targets, 3 contextual targets, 0 healthcare flagships; Consulting already reaches 3 and Projects 4.',
			'After owner/evidence review, add a small selected-work block with two or three Gulf-relevant healthcare flagships. Do not add all ten.',
			'Chosen pages are evidence-ready; descriptive anchors; graph shows direct contextual links; professional outcome is measured.',
			'P2 proposal'
		],
		[
			'HUB-02',
			'/writing or one relevant essay hub',
			'All five essay flagships have hub support, but The Curriculum Vitae of a Vanishing Man remains four meaningful clicks deep.',
			'If it remains in the owner-approved essay cohort, add one contextual selected-essay link from the closest literary journey. Preserve its non-commercial framing.',
			'Meaningful depth becomes ≤3 without a generic CTA or unrelated professional block.',
			'P2 proposal'
		],
		[
			'HUB-03',
			'Shared topic navigation',
			`${redirectEdges.length} visible redirecting occurrences from ${redirectSourceCount} source pages to two promoted topic destinations.`,
			'Replace the two shared legacy topic hrefs with their terminal canonical topic URLs in one reviewed registry/template change.',
			'Rerun graph: zero redirecting shared-topic links; anchors and destinations unchanged.',
			'P2 technical'
		],
		[
			'HUB-04',
			'/resources',
			'/resources/lists/satirical-insults-by-intensity has three inlinks, all hidden in the inactive rendered tab, and is the sole visible-unreachable canonical.',
			'If the list remains public, expose one visible descriptive link in the active resources journey. If not, document its intended role before changing indexability.',
			'At least one visible contextual source; no fragment-exclusive principal content introduced.',
			'P2 proposal'
		],
		[
			'HUB-05',
			'Two standalone Mojo notebook HTML pages',
			'Each has one source, no outbound canonical target, no canonical declaration, and no sitemap entry.',
			'Choose the standalone role. If retained, add a self-canonical and a visible return link to its parent article/project; otherwise seek explicit owner indexing policy.',
			'Self-canonical or documented alternative; no dead end; parent article remains unchanged.',
			'P2 technical'
		],
		[
			'HUB-06',
			'Image thumbnail pagination',
			`${variantEdges.length} visible links from ${variantSourceCount} sources to ${variantTargetCount} canonical targets differ only by query-parameter order.`,
			"Normalize the link builder's query ordering during a future gallery maintenance change. This is consistency work, not a duplicate-indexing emergency.",
			'Raw and normalized linked URLs match; canonical count and gallery state remain unchanged.',
			'P3 opportunistic'
		],
		[
			'HUB-07',
			'Shared header/card semantics',
			`${genericByAnchor['(empty or non-text link)'] ?? 0} visible empty/non-text extractor occurrences, primarily the repeated header pattern; accessible names were not computed by this graph.`,
			'Inspect the shared pattern once with the accessibility evidence before changing markup. Do not create hundreds of page-level tickets.',
			'Accessible-name test passes and the rendered graph retains the intended destination.',
			'P3 review'
		]
	]
)}

## What not to change from this graph alone

- Do not noindex, sitemap, or remove the ${paginationOnly.length} pagination-only canonicals as a bulk operation.
- Do not consolidate the 41 category/writing-hub near-orphans without query evidence and editorial equivalence.
- Do not add all 25 flagships to the homepage, Start Here, résumé, consulting, or every topic page.
- Do not treat the ${flagshipSummary.noObservedHighTrafficSources} flagships without a high-traffic source as broken. The high-traffic cohort is contaminated Vercel context.
- Do not erase the site's healthcare, technical, visualization, essay, fiction, or Calcutta identities. Route them through clear landing promises and bounded selected work, as described in \`SITE_IDENTITY_AND_JOURNEYS.md\`.

## Sequencing

1. Resolve the four exact canonical-policy rows and the two shared redirect hrefs.
2. Decide whether the hidden resource and standalone notebooks are intended public destinations.
3. Owner-review at most the two proposed path additions: one professional selected-work block and one literary link.
4. Re-run the same rendered graph and compare only the affected source/target rows, depth, canonicals, and initial content.
5. Use Google/Bing query/index evidence and clean-human path data before any taxonomy consolidation or broader hub expansion.
`;

	const trafficColumns = [
		'raw_path',
		'raw_url',
		'analytics_status',
		'canonical_url',
		'reconciliation_status',
		'mapping_evidence',
		'live_http_status',
		'live_redirect_hops',
		'live_final_url',
		'canonical_technically_eligible',
		'visitors_28d_raw',
		'page_views_estimate_28d_raw',
		'page_views_precision_raw',
		'canonical_group_member_count',
		'canonical_group_paths',
		'canonical_visitors_28d_conservative_max_not_sum',
		'canonical_visitors_28d_raw_sum_not_used',
		'canonical_page_views_28d_conservative_max_not_sum',
		'canonical_page_views_28d_raw_sum_not_used',
		'canonical_page_views_precision',
		'canonical_group_representative',
		'window',
		'caveat'
	];
	const flagshipColumns = Object.keys(flagshipArchitecture[0]);
	const outputs = {
		'TRAFFIC_CANONICAL_RECONCILIATION.csv': toCsv(trafficReconciliation.rows, trafficColumns),
		'FLAGSHIP_ARCHITECTURE.csv': toCsv(flagshipArchitecture, flagshipColumns),
		'INTERNAL_LINKS_AND_ARCHITECTURE.md': internalReport,
		'HUB_RECOMMENDATIONS.md': hubReport
	};

	for (const [filename, value] of Object.entries(outputs)) {
		privacyCheck(filename, value);
		await fs.writeFile(path.join(REPORT_DIRECTORY, filename), `${value.trimEnd()}\n`, 'utf8');
	}

	const result = {
		result: 'PASS',
		inventoryUrls: inventoryRows.length,
		canonicalGraphNodes: depthRows.length,
		internalGraphEdges: graphRows.length,
		technicallyEligibleCanonicals: eligibleUrls.size,
		trafficRows: trafficReconciliation.rows.length,
		trafficMatchedRows: trafficReconciliation.observed.filter((row) => row.canonicalUrl).length,
		trafficCanonicalGroups: trafficReconciliation.groups.size,
		trafficUnmatchedRows: trafficReconciliation.observed.filter((row) => !row.canonicalUrl).length,
		flagshipsMatched: flagshipArchitecture.length,
		nearOrphans: nearOrphans.length,
		deadEnds: deadEnds.length,
		paginationOnly: paginationOnly.length,
		visibleUnreachable: visiblyUnreachable.length,
		redirectingInternalLinks: redirectEdges.length,
		normalizedQueryOrderLinks: variantEdges.length,
		outputs: Object.keys(outputs)
	};
	console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? (error.stack ?? error.message) : error);
	process.exitCode = 1;
});
