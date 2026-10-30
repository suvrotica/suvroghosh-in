// Provider fixtures may replace fetch with a local mock. Restoring mocks returns
// to this rejecting baseline, never to a network-capable production fetch.
globalThis.fetch = async () => {
	throw new Error('Security smoke tests prohibit real fetch requests; provide an explicit mock.');
};
