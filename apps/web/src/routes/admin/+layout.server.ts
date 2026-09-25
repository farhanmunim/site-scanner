import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/** Everything under /admin requires the owner session, except the login page itself. */
export const load: LayoutServerLoad = ({ locals, url }) => {
  if (!locals.admin && url.pathname !== '/admin/login') redirect(303, `/admin/login?next=${encodeURIComponent(url.pathname)}`);
  return { admin: locals.admin };
};
