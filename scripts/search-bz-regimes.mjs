import { createServer } from 'vite';

const vite = await createServer({
	appType: 'custom',
	logLevel: 'error',
	server: { middlewareMode: true }
});

try {
	await vite.ssrLoadModule('/scripts/search-bz-regimes.ts');
} finally {
	await vite.close();
}
