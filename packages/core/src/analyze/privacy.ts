import type { BrowserCookie, Finding, Report, RobotsSummary, TechnologyDetection } from '../types.js';

/** Observable privacy signals. Describes what is loaded; no legal conclusions. */
export function auditPrivacy(techs: TechnologyDetection[], thirdParties: Report['thirdParties'], cookies: BrowserCookie[], robots: RobotsSummary | null): Finding[] {
  const out: Finding[] = [];
  const cat = (name: string) => techs.filter((t) => t.categories.some((c) => c.name === name)).map((t) => t.name);
  const analytics = [...new Set([...cat('Analytics'), ...cat('RUM'), ...thirdParties.filter((t) => t.category === 'Analytics').map((t) => t.technology!)])].filter(Boolean);
  const ads = [...new Set([...cat('Advertising'), ...cat('Retargeting'), ...thirdParties.filter((t) => t.category === 'Advertising' || t.category === 'Retargeting').map((t) => t.technology!)])].filter(Boolean);
  const consent = [...new Set([...cat('Cookie compliance'), ...thirdParties.filter((t) => t.category === 'Cookie compliance').map((t) => t.technology!)])].filter(Boolean);
  const fonts = thirdParties.filter((t) => t.category === 'Font scripts').map((t) => t.technology!);
  const embeds = thirdParties.filter((t) => t.category === 'Video players' || t.category === 'Maps' || t.category === 'Widgets').map((t) => t.technology!);

  out.push(analytics.length ? { id: 'analytics', title: 'Analytics', status: 'info', observed: analytics.join(', ') } : { id: 'analytics', title: 'Analytics', status: 'good', observed: 'No analytics service detected.' });
  out.push(ads.length ? { id: 'advertising', title: 'Advertising / retargeting', status: 'info', observed: ads.join(', ') } : { id: 'advertising', title: 'Advertising / retargeting', status: 'good', observed: 'No advertising or retargeting pixels detected.' });
  if (analytics.length || ads.length) out.push(consent.length ? { id: 'consent', title: 'Consent management', status: 'good', observed: consent.join(', ') } : { id: 'consent', title: 'Consent management', status: 'info', observed: 'No consent-management platform detected on the homepage, although tracking services are present.', detail: 'A CMP may still exist (custom banners are not always detectable). Whether one is required depends on jurisdiction and configuration.' });
  if (fonts.length) out.push({ id: 'fonts', title: 'External fonts', status: 'info', observed: `${fonts.join(', ')} — font requests reveal the visitor's IP to the font provider.` });
  if (embeds.length) out.push({ id: 'embeds', title: 'Third-party embeds', status: 'info', observed: [...new Set(embeds)].join(', ') });
  out.push({ id: 'third-party-count', title: 'Third-party domains', status: thirdParties.length > 25 ? 'warn' : 'info', observed: `${thirdParties.length} external domain(s) referenced from the homepage.` });

  if (cookies.length) {
    const third = cookies.filter((c) => c.thirdParty);
    const persistent = cookies.filter((c) => !c.session);
    out.push({ id: 'cookies-set', title: 'Cookies set before interaction', status: third.length ? 'info' : 'good', observed: `${cookies.length} cookie(s) after page load without any interaction: ${persistent.length} persistent, ${third.length} third-party.`, detail: third.length ? `Third-party: ${[...new Set(third.map((c) => c.domain.replace(/^\./, '')))].slice(0, 8).join(', ')}` : undefined });
  }
  if (robots?.present) {
    const blocked = robots.aiCrawlers.filter((a) => a.blocked).map((a) => a.agent);
    out.push({ id: 'ai-crawlers', title: 'AI crawler policy (robots.txt)', status: 'info', observed: blocked.length ? `Blocks ${blocked.length} AI crawler(s): ${blocked.join(', ')}.` : 'No AI-specific crawler rules (GPTBot, ClaudeBot, CCBot…).' });
  }
  return out;
}
