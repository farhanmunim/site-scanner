import { describe, expect, it } from 'vitest';
import { isAdminRoute, mustRefuseAdminWrite } from './admin-guard';

const post = (routeId: string | null, pathname: string, isAdmin = false, method = 'POST') => mustRefuseAdminWrite({ routeId, pathname, method, isAdmin });

describe('admin write guard', () => {
  it('refuses every state-changing admin request without a session', () => {
    for (const [route, path] of [
      ['/(admin)/admin/blocklist', '/admin/blocklist'],
      ['/(admin)/admin/scans', '/admin/scans'],
      ['/(admin)/admin/settings', '/admin/settings'],
      ['/(admin)/admin/domains', '/admin/domains'],
      ['/(admin)/admin/logout', '/admin/logout']
    ] as const) {
      expect(post(route, path), path).toBe(true);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(post('/(admin)/admin/settings', '/admin/settings', false, method)).toBe(true);
  });

  it('cannot be bypassed by encoding the path, because the router resolves the decoded path', () => {
    // These paths reach the admin routes in SvelteKit, so the resolved route id says "admin" even though the raw path does not look like it.
    expect(post('/(admin)/admin/blocklist', '/%61dmin/blocklist')).toBe(true);
    expect(post('/(admin)/admin/settings', '/%61%64%6d%69%6e/settings')).toBe(true);
    // Even with no route id at all, the decoded path is still recognised.
    expect(post(null, '/%61dmin/blocklist')).toBe(true);
    expect(post(null, '/admin/./blocklist')).toBe(true);
    expect(post(null, '//admin/blocklist')).toBe(true);
    expect(post(null, '/admin%5cblocklist')).toBe(true);
    expect(post(null, '/ADMIN/blocklist')).toBe(true);
    expect(post(null, '/%ZZadmin')).toBe(true);
  });

  it('lets the owner through, and lets anyone read or log in', () => {
    expect(post('/(admin)/admin/settings', '/admin/settings', true)).toBe(false);
    expect(post('/(admin)/admin/settings', '/admin/settings', false, 'GET')).toBe(false);
    expect(post('/(admin)/admin/settings', '/admin/settings', false, 'HEAD')).toBe(false);
    expect(post('/(admin)/admin/login', '/admin/login')).toBe(false);
  });

  it('still recognises the old route group, so moving the files cannot silently open the admin', () => {
    expect(post('/(classic)/admin/settings', '/admin/settings')).toBe(true);
    expect(post('/admin/settings', '/admin/settings')).toBe(true);
  });

  it('does not touch the public site', () => {
    expect(post('/api/scans', '/api/scans')).toBe(false);
    expect(post('/(app)', '/')).toBe(false);
    expect(post('/(app)/tools/[slug]', '/tools/email')).toBe(false);
    expect(isAdminRoute('/(app)/r/[id]', '/r/00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(isAdminRoute(null, '/administrator-guide')).toBe(false);
  });
});
