import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { runMigrations } from '@site-scanner/db';
import { config } from '$lib/server/config.js';
import { hasValidSession } from '$lib/server/auth.js';
import { clientIp } from '$lib/server/scan-service.js';
import { isAdminRoute, mustRefuseAdminWrite } from '$lib/server/admin-guard.js';

/** Apply pending migrations before the first request, so web never serves against an older schema than it was built for (serialised with the worker by an advisory lock). */
export const init: ServerInit = async () => {
  if (config.databaseUrl) await runMigrations(config.databaseUrl);
};

export const handle: Handle = async ({ event, resolve }) => {
  const { ip, country } = clientIp(event.request, () => {
    try {
      return event.getClientAddress();
    } catch {
      return '0.0.0.0';
    }
  });
  event.locals.clientIp = ip;
  event.locals.country = country;
  event.locals.admin = hasValidSession(event.cookies);

  if (mustRefuseAdminWrite({ routeId: event.route.id, pathname: event.url.pathname, method: event.request.method, isAdmin: event.locals.admin })) {
    return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } });
  }

  const response = await resolve(event);
  // Our own house in order: the headers we grade other sites on.
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  if (event.url.protocol === 'https:' || event.request.headers.get('x-forwarded-proto') === 'https') response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  if (event.url.pathname.startsWith('/r/') || event.url.pathname.startsWith('/archive/') || isAdminRoute(event.route.id, event.url.pathname)) response.headers.set('x-robots-tag', 'noindex, nofollow');
  return response;
};

/** Log every unexpected error with its route so Coolify's log shows what broke, and show a plain message. */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
  const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
  console.error(`[web] ${status} ${event.request.method} ${event.url.pathname}: ${detail}`);
  return { message: status === 404 ? 'Not found' : `Something went wrong on our side (${message}). It has been logged; please try again in a moment.` };
};
