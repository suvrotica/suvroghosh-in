import { validateProject } from './model';
import type { StudioProject } from './types';

const DATABASE = 'suvro-mindmap-studio';
const STORE = 'projects';
const KEY = 'current-project';
let persistenceQueue: Promise<unknown> = Promise.resolve();

function serial<T>(operation: () => Promise<T>): Promise<T> {
	const pending = persistenceQueue.then(operation, operation);
	persistenceQueue = pending.catch(() => undefined);
	return pending;
}

function openDatabase(): Promise<IDBDatabase> {
	if (typeof indexedDB === 'undefined')
		return Promise.reject(
			new Error('Device storage is unavailable. Download an editable project to keep your work.')
		);
	return new Promise((resolve, reject) => {
		let rejected = false;
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
		};
		request.onsuccess = () => {
			if (rejected) {
				request.result.close();
				return;
			}
			request.result.onversionchange = () => request.result.close();
			resolve(request.result);
		};
		request.onerror = () =>
			reject(
				new Error(
					'Device storage could not be opened. Download an editable project to keep your work.'
				)
			);
		request.onblocked = () => {
			rejected = true;
			reject(new Error('Another tab is upgrading device storage. Close that tab and try again.'));
		};
	});
}

/** Caller controls consent and debounce; writes resolve only after IndexedDB commits. */
export async function saveProject(project: StudioProject): Promise<void> {
	const snapshot = validateProject(project);
	return serial(() => writeProject(snapshot));
}

async function writeProject(snapshot: StudioProject): Promise<void> {
	const database = await openDatabase();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction(STORE, 'readwrite');
			transaction.objectStore(STORE).put(snapshot, KEY);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () =>
				reject(
					new Error('Autosave failed. Device storage may be full; download your editable project.')
				);
			transaction.onabort = () =>
				reject(
					new Error('Autosave was interrupted. Download your editable project before closing.')
				);
		});
	} finally {
		database.close();
	}
}

export async function loadProject(): Promise<StudioProject | null> {
	return serial(readProject);
}

async function readProject(): Promise<StudioProject | null> {
	const database = await openDatabase();
	try {
		const value = await new Promise<unknown>((resolve, reject) => {
			const transaction = database.transaction(STORE, 'readonly');
			const request = transaction.objectStore(STORE).get(KEY);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(
					new Error(
						'The saved project could not be read. Your downloaded project can be imported instead.'
					)
				);
		});
		return value == null ? null : validateProject(value);
	} finally {
		database.close();
	}
}

export async function clearProject(): Promise<void> {
	return serial(removeProject);
}

async function removeProject(): Promise<void> {
	const database = await openDatabase();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction(STORE, 'readwrite');
			transaction.objectStore(STORE).delete(KEY);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () =>
				reject(
					new Error('The saved project could not be removed. Try again before leaving this page.')
				);
			transaction.onabort = () => reject(new Error('Removing the saved project was interrupted.'));
		});
	} finally {
		database.close();
	}
}
