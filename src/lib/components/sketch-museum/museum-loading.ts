/** One queue per museum instance: rapid room changes cannot multiply concurrent decodes. */
export function createMuseumLoadQueue(limit = 4) {
	if (!Number.isInteger(limit) || limit < 1) throw new Error('A positive load limit is required.');
	let active = 0;
	const pending: Array<{
		work: () => Promise<void>;
		current: () => boolean;
		resolve: () => void;
		reject: (error: unknown) => void;
	}> = [];
	function drain() {
		while (active < limit && pending.length) {
			const item = pending.shift()!;
			if (!item.current()) {
				item.resolve();
				continue;
			}
			active += 1;
			Promise.resolve()
				.then(item.work)
				.then(item.resolve, item.reject)
				.finally(() => {
					active -= 1;
					drain();
				});
		}
	}
	return {
		run(work: () => Promise<void>, current: () => boolean) {
			return new Promise<void>((resolve, reject) => {
				pending.push({ work, current, resolve, reject });
				drain();
			});
		},
		clear() {
			for (const item of pending.splice(0)) item.resolve();
		}
	};
}
