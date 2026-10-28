/**
 * Should this request be refused because it changes something under /admin without an owner session?
 *
 * Page loads under /admin are guarded by the layout, but form actions are plain POSTs that skip it, so the check
 * lives in the request hook. It must agree with the router about what is "admin": SvelteKit routes on the
 * percent-DECODED path (`/%61dmin/...` reaches the admin routes), so the primary test is the resolved route id and
 * the decoded, normalised path is only a second net.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isAdminRoute(routeId: string | null | undefined, pathname: string): boolean {
  if (routeId && routeId.startsWith('/(classic)/admin')) return true;
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    // A path that cannot be decoded never reaches a route, but refuse anything that looks like admin anyway.
    return /admin/i.test(pathname);
  }
  p = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/(\.\/)+/g, '/').toLowerCase();
  return p === '/admin' || p.startsWith('/admin/');
}

export function mustRefuseAdminWrite(args: { routeId: string | null | undefined; pathname: string; method: string; isAdmin: boolean }): boolean {
  if (args.isAdmin || SAFE_METHODS.has(args.method.toUpperCase())) return false;
  if (!isAdminRoute(args.routeId, args.pathname)) return false;
  // Only the login form may be posted to without a session, and only when the router itself resolved it to that route.
  return args.routeId !== '/(classic)/admin/login';
}
