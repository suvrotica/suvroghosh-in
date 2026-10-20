type Options = {
	attempts: number;
	globalAttempts: number;
	windowMs: number;
	concurrency: number;
	maxKeys: number;
};

/** A bounded, process-local guard. It does not coordinate separate server instances. */
export function createLocalAdmission(options: Options) {
	const buckets = new Map<string, { attempts: number[]; active: number }>();
	let globalAttempts: number[] = [];
	let active = 0;
	return (key: string, now = Date.now()) => {
		for (const [bucketKey, bucket] of buckets) {
			bucket.attempts = bucket.attempts.filter((time) => now - time < options.windowMs);
			if (!bucket.active && !bucket.attempts.length) buckets.delete(bucketKey);
		}
		globalAttempts = globalAttempts.filter((time) => now - time < options.windowMs);
		const bucket = buckets.get(key) ?? { attempts: [], active: 0 };
		const limitedSince =
			bucket.attempts.length >= options.attempts
				? bucket.attempts[0]
				: globalAttempts.length >= options.globalAttempts
					? globalAttempts[0]
					: null;
		if (
			limitedSince !== null ||
			active >= options.concurrency ||
			bucket.active > 0 ||
			(!buckets.has(key) && buckets.size >= options.maxKeys)
		) {
			return {
				allowed: false as const,
				retryAfterSeconds:
					limitedSince === null
						? 1
						: Math.max(1, Math.ceil((options.windowMs - (now - limitedSince)) / 1000))
			};
		}
		bucket.attempts.push(now);
		globalAttempts.push(now);
		bucket.active += 1;
		active += 1;
		buckets.set(key, bucket);
		let released = false;
		return {
			allowed: true as const,
			release() {
				if (released) return;
				released = true;
				bucket.active -= 1;
				active -= 1;
			}
		};
	};
}
