import type { LayoutServerLoad } from './$types';
import { config } from '$lib/server/config.js';

export const load: LayoutServerLoad = ({ locals }) => ({
  admin: locals.admin,
  siteName: config.siteName,
  abuseContact: config.abuseContact,
  turnstileSiteKey: config.turnstileSiteKey,
  umami: config.umamiScriptUrl && config.umamiWebsiteId ? { script: config.umamiScriptUrl, websiteId: config.umamiWebsiteId } : null
});
