import { proxyLab } from '$lib/server/synthetic-data-lab/proxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = proxyLab;
export const POST: RequestHandler = proxyLab;

export const config = { maxDuration: 180 };
