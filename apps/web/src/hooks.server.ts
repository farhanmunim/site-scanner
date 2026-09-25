import type { Handle } from '@sveltejs/kit';
import { hasValidSession } from '$lib/server/auth.js';
import { clientIp } from '$lib/server/scan-service.js';

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

  const response = await resolve(event);
  // Our own house in order: the headers we grade other sites on.
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  if (event.url.protocol === 'https:' || event.request.headers.get('x-forwarded-proto') === 'https') response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  if (event.url.pathname.startsWith('/r/') || event.url.pathname.startsWith('/admin')) response.headers.set('x-robots-tag', 'noindex, nofollow');
  return response;
};
