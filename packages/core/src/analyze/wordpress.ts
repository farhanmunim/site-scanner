import type { CmsDeepDive, ExternalData, FetchedFile, Finding, TechnologyDetection } from '../types.js';
import { extractWordPressRefs } from '../gather/stages/files.js';

/**
 * WordPress deep dive (InspectWP-style): core version, theme, plugins with versions, plus
 * public-exposure flags. Everything here comes from the page and files it referenced.
 */
export function analyseWordPress(html: string, files: { cms: FetchedFile[] } | null, techs: TechnologyDetection[], external: ExternalData | undefined, headers: Record<string, string>): CmsDeepDive | null {
  const refs = extractWordPressRefs(html);
  const wpTech = techs.find((t) => t.name === 'WordPress');
  if (!refs.detected && !(wpTech && !wpTech.implied && wpTech.score >= 100)) return null;

  // Core version: generator meta beats asset ?ver= of wp-includes files.
  let version = /<meta\s+name=["']generator["']\s+content=["']WordPress\s+([\d.]+)/i.exec(html)?.[1] ?? null;
  if (!version) version = /\/wp-includes\/(?:js|css)\/[^"'?]+\?ver=(\d+\.\d+(?:\.\d+)?)/i.exec(html)?.[1] ?? null;
  if (!version) version = wpTech?.version ?? null;

  // Theme: slug from the page, name/version from style.css header.
  let theme: CmsDeepDive['theme'] = null;
  const themeSlug = refs.themeSlugs.find((s) => !/^(twenty|child)/.test(s)) ?? refs.themeSlugs[0];
  if (themeSlug) {
    theme = { slug: themeSlug, name: null, version: null, author: null };
    const css = files?.cms.find((f) => f.path.endsWith(`/themes/${themeSlug}/style.css`) && f.status === 200 && f.body);
    if (css?.body) {
      const head = css.body.slice(0, 4000);
      theme.name = /^\s*\*?\s*Theme Name:\s*(.+)$/im.exec(head)?.[1]?.trim() ?? null;
      theme.version = /^\s*\*?\s*Version:\s*([\w.\-]+)/im.exec(head)?.[1] ?? null;
      if (theme.version && !looksLikeVersion(theme.version)) theme.version = null;
      theme.author = /^\s*\*?\s*Author:\s*(.+)$/im.exec(head)?.[1]?.trim().replace(/<[^>]+>/g, '') ?? null;
      const template = /^\s*\*?\s*Template:\s*(\S+)/im.exec(head)?.[1];
      if (template) theme.name = `${theme.name ?? themeSlug} (child of ${template})`;
    }
  }

  // Plugins: slug from paths; version from ?ver= on that plugin's assets, then readme.txt "Stable tag".
  const plugins: CmsDeepDive['plugins'] = [];
  for (const slug of refs.pluginSlugs) {
    const re = new RegExp(`/wp-content/plugins/${slug.replace(/[-]/g, '\\-')}/[^"'\\s?]+\\?ver=([\\w.\\-]+)`, 'i');
    const m = re.exec(html);
    let ver: string | null = m && looksLikeVersion(m[1]!) && m[1] !== version ? m[1]! : null;
    const readme = files?.cms.find((f) => f.path.endsWith(`/plugins/${slug}/readme.txt`) && f.status === 200 && f.body);
    if (readme?.body) {
      const stable = /^\s*Stable tag:\s*([\w.\-]+)/im.exec(readme.body)?.[1];
      if (stable && looksLikeVersion(stable) && !ver) ver = stable;
    }
    let name: string | null = external?.wordpressOrg?.[slug]?.name ?? null;
    if (!name && readme?.body) name = /^===\s*(.+?)\s*===/m.exec(readme.body)?.[1] ?? null;
    if (!name) name = techs.find((t) => t.evidence.some((e) => e.value.includes(`/plugins/${slug}/`)))?.name ?? null;
    plugins.push({ slug, name, version: ver });
  }

  const flags: Finding[] = [];
  const wpJson = files?.cms.find((f) => f.path.endsWith('/wp-json/'));
  if (wpJson) {
    flags.push(wpJson.status === 200 ? { id: 'wp-rest', title: 'REST API exposed', status: 'info', observed: '/wp-json/ responds publicly (normal for WordPress; the block editor and many plugins need it).' } : { id: 'wp-rest', title: 'REST API exposed', status: 'info', observed: `/wp-json/ returned HTTP ${wpJson.status}.` });
  }
  if (headers['x-pingback']) flags.push({ id: 'wp-xmlrpc', title: 'XML-RPC enabled', status: 'info', observed: 'X-Pingback header advertises xmlrpc.php.', detail: 'XML-RPC is legacy; it is a common target for automated password guessing (system.multicall). Disable it unless the Jetpack/mobile app needs it.', owasp: 'A07', evidence: [{ source: 'header', key: 'x-pingback', value: headers['x-pingback'] }] });
  if (version) {
    flags.push({ id: 'wp-version', title: 'Version visible', status: 'info', observed: `Version ${version} is exposed in the page source.`, detail: 'Exposing the exact version makes it easier to match known issues. Keeping WordPress current matters more than hiding the number.' });
  }
  const outdated = plugins.filter((p) => external?.wordpressOrg?.[p.slug]?.version && p.version && external.wordpressOrg[p.slug]!.version !== p.version && cmpVer(p.version, external.wordpressOrg[p.slug]!.version!) < 0);
  if (outdated.length) flags.push({ id: 'wp-plugins-outdated', title: 'Out-of-date plugins', status: 'warn', observed: outdated.map((p) => `${p.name ?? p.slug} ${p.version} → ${external!.wordpressOrg![p.slug]!.version}`).join('; '), detail: 'Versions compared against WordPress.org. Out-of-date plugins are the most common cause of compromised WordPress sites.', owasp: 'A06' });
  const stale = plugins.filter((p) => {
    const lu = external?.wordpressOrg?.[p.slug]?.lastUpdated;
    return lu && Date.now() - Date.parse(lu) > 2 * 365 * 86_400_000;
  });
  if (stale.length) flags.push({ id: 'wp-plugins-stale', title: 'Possibly abandoned plugins', status: 'warn', observed: stale.map((p) => `${p.name ?? p.slug} (last update ${external!.wordpressOrg![p.slug]!.lastUpdated!.slice(0, 10)})`).join('; '), detail: 'A plugin with no releases for years may be abandoned and will not receive security fixes.', owasp: 'A06' });
  if (external?.wordfence) {
    const adv = plugins.filter((p) => external.wordfence![p.slug]?.count);
    if (adv.length) flags.push({ id: 'wp-plugins-advisories', title: 'Plugins with known security issues', status: 'warn', observed: adv.map((p) => `${p.name ?? p.slug}: ${external.wordfence![p.slug]!.count} advisor${external.wordfence![p.slug]!.count === 1 ? 'y' : 'ies'}${external.wordfence![p.slug]!.affectedBelow ? ` (fixed in ${external.wordfence![p.slug]!.affectedBelow})` : ''}`).join('; '), detail: 'From the Wordfence Intelligence feed. An advisory for a plugin does not mean this site runs an affected version; compare the installed version with the fixed version.', owasp: 'A06' });
  }

  return { platform: 'wordpress', version, theme, plugins, flags };
}

/** "2.6.7" yes; "1773435315" (a cache-busting timestamp) or "a1b2c3" no. */
export function looksLikeVersion(v: string): boolean {
  return /^\d{1,4}(\.\d{1,6}){1,3}[a-z0-9.-]{0,12}$/i.test(v);
}

export function cmpVer(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Shopify: theme name/id from the Shopify.theme object and app hosts. */
export function analyseShopify(html: string, techs: TechnologyDetection[]): CmsDeepDive | null {
  if (!techs.some((t) => t.name === 'Shopify' && !t.implied)) return null;
  const m = /Shopify\.theme\s*=\s*(\{[^}]+\})/.exec(html);
  let theme: CmsDeepDive['theme'] = null;
  if (m) {
    const name = /"name"\s*:\s*"([^"]+)"/.exec(m[1]!)?.[1] ?? null;
    const id = /"id"\s*:\s*(\d+)/.exec(m[1]!)?.[1] ?? null;
    const schemaName = /"schema_name"\s*:\s*"([^"]+)"/.exec(m[1]!)?.[1] ?? null;
    const schemaVersion = /"schema_version"\s*:\s*"([^"]+)"/.exec(m[1]!)?.[1] ?? null;
    theme = { slug: id ?? 'unknown', name: name ? `${name}${schemaName && schemaName !== name ? ` (${schemaName})` : ''}` : schemaName, version: schemaVersion, author: null };
  }
  const apps = techs.filter((t) => t.categories.some((c) => c.id === 100)).map((t) => ({ slug: t.slug, name: t.name, version: t.version }));
  return { platform: 'shopify', version: null, theme, plugins: apps, flags: [] };
}
