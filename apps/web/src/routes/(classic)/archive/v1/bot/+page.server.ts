import type { PageServerLoad } from './$types';
import { config } from '$lib/server/config.js';

export const load: PageServerLoad = () => ({ abuseContact: config.abuseContact || null });
