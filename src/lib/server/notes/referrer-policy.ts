const matchesPath = (pathname: string, base: string) =>
	pathname === base || pathname.startsWith(`${base}/`);

export function notesAuthReferrerPolicy(url: URL) {
	const isResetPassword = matchesPath(url.pathname, '/notes/reset-password');
	const isAuthCallback = matchesPath(url.pathname, '/notes/auth');
	const hasRecoveryToken = isResetPassword && url.searchParams.has('token_hash');

	return hasRecoveryToken || isAuthCallback ? 'no-referrer' : 'same-origin';
}
