// A real PostgreSQL WASM execution of the migration, with no live database writes.
// Runtime: npm install --prefix <temporary-folder> --no-save @electric-sql/pglite@0.5.11
// Run with ANALYTICS_SQL_RUNTIME=<temporary-folder> node --test <this-file>.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(
	path.resolve(process.env.ANALYTICS_SQL_RUNTIME ?? '.', 'package.json')
);
let PGlite;
try {
	({ PGlite } = require('@electric-sql/pglite'));
} catch (cause) {
	// This optional local PostgreSQL runtime is deliberately not a website dependency.
	if (process.env.ANALYTICS_SQL_RUNTIME) throw cause;
}
const migration = await readFile(
	new URL('../../../../supabase/migrations/202610220001_site_analytics.sql', import.meta.url),
	'utf8'
);
const cron = await readFile(path.resolve('supabase/analytics-cron.sql'), 'utf8');

test(
	'analytics migration executes, denies public access, counts atomically and removes expired data',
	{
		skip:
			!PGlite &&
			'Install the pinned temporary PGlite runtime and set ANALYTICS_SQL_RUNTIME to execute SQL integration.'
	},
	async () => {
		const db = new PGlite();
		try {
			await db.exec(
				'create role anon; create role authenticated; create role service_role bypassrls;'
			);
			await db.exec(migration);
			for (const role of ['anon', 'authenticated']) {
				const grants = await db.query(
					`select has_table_privilege($1,'public.site_analytics_daily','SELECT') as read, has_function_privilege($1,'public.get_site_analytics_report(date,date)','EXECUTE') as report, has_function_privilege($1,'public.record_site_page_view(text,text,text,text,text,text,text,text)','EXECUTE') as write`,
					[role]
				);
				assert.deepEqual(grants.rows[0], { read: false, report: false, write: false });
				await db.exec(`set role ${role}`);
				await assert.rejects(
					db.query('select * from public.site_analytics_daily'),
					/permission denied/
				);
				await assert.rejects(
					db.query(
						"insert into public.site_analytics_daily values (current_date,'total','all','Recorded page views',1)"
					),
					/permission denied/
				);
				await assert.rejects(
					db.query('select public.get_site_analytics_report(current_date,current_date)'),
					/permission denied/
				);
				await assert.rejects(
					db.query(
						"select public.record_site_page_view(repeat('a',64),'/','IN','WB','Calcutta','Direct or unavailable','Desktop','Chrome')"
					),
					/permission denied/
				);
				await db.exec('reset role');
			}
			await db.exec('set role service_role');
			await assert.rejects(
				db.query('select * from public.site_analytics_daily'),
				/permission denied/
			);
			const record = (key = 'a'.repeat(64)) =>
				db.query(
					"select public.record_site_page_view($1,'/','IN','WB','Calcutta','Direct or unavailable','Desktop','Chrome') as result",
					[key]
				);
			const accepted = await Promise.all(Array.from({ length: 40 }, () => record()));
			assert.ok(accepted.every((r) => r.rows[0].result === 'accepted'));
			const report = async () =>
				(
					await db.query(
						"select public.get_site_analytics_report((now() at time zone 'Asia/Kolkata')::date,(now() at time zone 'Asia/Kolkata')::date) as result"
					)
				).rows[0].result;
			assert.equal((await report()).totalViews, 40);
			assert.deepEqual((await report()).cities, [
				{ key: 'IN|WB|calcutta', label: 'Calcutta, WB, IN', views: 40 }
			]);
			assert.equal((await report()).distinctPages, 1);
			for (let n = 40; n < 60; n++) await record();
			assert.equal((await record()).rows[0].result, 'rate_limited');
			assert.equal((await report()).totalViews, 60);
			await assert.rejects(
				db.query(
					"select public.record_site_page_view($1,'/?secret=x','IN','WB','Calcutta','Direct or unavailable','Desktop','Chrome')",
					['b'.repeat(64)]
				),
				/Invalid aggregate dimensions/
			);
			await assert.rejects(
				db.query('select public.get_site_analytics_report(current_date-200,current_date)'),
				/Unsupported date range/
			);
			await db.exec('reset role');
			// Check Kolkata bucket boundaries independently of the host/database timezone.
			const bucket = await db.query(
				"select ('2026-10-21 18:29:59+00'::timestamptz at time zone 'Asia/Kolkata')::date::text as before, ('2026-10-21 18:30:00+00'::timestamptz at time zone 'Asia/Kolkata')::date::text as after"
			);
			assert.deepEqual(bucket.rows[0], { before: '2026-10-21', after: '2026-10-22' });
			await db.exec(
				"insert into public.site_analytics_daily values ((now() at time zone 'Asia/Kolkata')::date-180,'total','all','Recorded page views',123); insert into public.site_analytics_limits values ('expired-test',now()-interval '1 hour',1,now()-interval '1 minute');"
			);
			await db.exec('set role service_role');
			const cleanup = await db.query('select public.cleanup_site_analytics(25000) as result');
			assert.deepEqual(cleanup.rows[0].result, { aggregateRowsDeleted: 1, rateKeysDeleted: 1 });
			assert.equal((await report()).totalViews, 60);
			await db.exec('reset role');
			// High-cardinality city admission cannot create unlimited rows in one day.
			await db.exec(
				"insert into public.site_analytics_daily select (now() at time zone 'Asia/Kolkata')::date, 'city', 'seed-' || n, 'Seed city ' || n, 1 from generate_series(1,511) n"
			);
			await db.exec('set role service_role');
			assert.equal(
				(
					await db.query(
						"select public.record_site_page_view(repeat('c',64),'/','IN','KA','Bengaluru','Other external','Mobile','Safari') as result"
					)
				).rows[0].result,
				'accepted'
			);
			await db.exec('reset role');
			assert.deepEqual(
				(
					await db.query(
						"select key, views from public.site_analytics_daily where dimension='city' and key='Other'"
					)
				).rows[0],
				{ key: 'Other', views: 1 }
			);
			// A global admission limit applies even when every submitted rate key is different.
			await db.exec(
				"update public.site_analytics_limits set attempts=600, window_start=date_trunc('minute',clock_timestamp()) where key='global'"
			);
			await db.exec('set role service_role');
			assert.equal((await record('d'.repeat(64))).rows[0].result, 'rate_limited');
			assert.equal((await report()).totalViews, 61);
			await db.exec('reset role');
			const daily = await db.query(
				'select distinct dimension from public.site_analytics_daily order by dimension'
			);
			assert.equal(daily.rows.length, 7);
			assert.match(cron, /cron\.schedule\(\s*'cleanup-site-analytics',\s*'\*\/10 \* \* \* \*'/);
			assert.match(cron, /cleanup_site_analytics\(25000\)/);
		} finally {
			await db.close();
		}
	}
);
