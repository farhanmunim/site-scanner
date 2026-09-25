import type { LayoutServerLoad } from './$types';
import { config } from '$lib/server/config.js';

export const load: LayoutServerLoad = ({ locals }) => ({ admin: locals.admin, siteName: config.siteName, abuseContact: config.abuseContact, turnstileSiteKey: config.turnstileSiteKey });
