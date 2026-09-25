import { fetchDocument, type SafeFetchOptions } from '../fetch.js';
import type { HttpStageData } from '../../types.js';

/** Recognise bot-challenge / WAF block pages so we can stop and report "restricted". */
export function detectChallenge(status: number, headers: Record<string, string>, body: string): HttpStageData['challenge'] {
  const server = headers['server'] ?? '';
  if (headers['cf-mitigated'] === 'challenge' || /<title>Just a moment\.\.\.<\/title>|cf-chl-|challenge-platform/i.test(body)) {
    return { vendor: 'Cloudflare', evidence: headers['cf-mitigated'] ? 'cf-mitigated: challenge' : 'Cloudflare challenge page' };
  }
  if (/AkamaiGHost/i.test(server) && (status === 403 || /Access Denied/i.test(body))) return { vendor: 'Akamai', evidence: `Server: ${server}, HTTP ${status}` };
  if (headers['x-iinfo'] || headers['x-cdn'] === 'Imperva' || /incapsula|_Incapsula_Resource/i.test(body)) return { vendor: 'Imperva Incapsula', evidence: 'Incapsula markers' };
  if (headers['x-datadome'] || /datadome/i.test(headers['set-cookie'] ?? '') || /captcha-delivery\.com/i.test(body)) return { vendor: 'DataDome', evidence: 'DataDome markers' };
  if (/perimeterx|_px[A-Za-z0-9]*=|px-captcha/i.test(body)) return { vendor: 'PerimeterX (HUMAN)', evidence: 'PerimeterX markers' };
  if (/Request unsuccessful\. Incapsula/i.test(body)) return { vendor: 'Imperva Incapsula', evidence: 'Incapsula block page' };
  if (/<title>Attention Required!/i.test(body)) return { vendor: 'Cloudflare', evidence: 'Cloudflare block page' };
  if (headers['x-sucuri-id'] && status === 403) return { vendor: 'Sucuri', evidence: 'x-sucuri-id + HTTP 403' };
  if (status === 403 && /wordfence/i.test(body)) return { vendor: 'Wordfence', evidence: 'Wordfence block page' };
  if (status === 429) return { vendor: 'Rate limit', evidence: 'HTTP 429' };
  return null;
}

/**
 * Fetch the main document following redirects. If the user gave https:// we also try one
 * HEAD-less GET of http:// only if https failed at the network level (no second request
 * otherwise, to keep the footprint small). `httpsRedirect` is determined from the chain.
 */
export async function gatherHttp(url: string, opts: SafeFetchOptions): Promise<HttpStageData> {
  const first = await fetchDocument(url, opts);
  let chain = first.chain;
  let final = first.final;
  let requestedUrl = url;

  // https:// unreachable at all → try http:// once (site may be http-only).
  if (!final && chain.length === 0 && url.startsWith('https://') && first.deniedReason && /fetch|network|timeout|ECONN|TLS|certificate/i.test(first.deniedReason)) {
    const httpUrl = 'http://' + url.slice('https://'.length);
    const second = await fetchDocument(httpUrl, opts);
    chain = second.chain;
    final = second.final;
    requestedUrl = httpUrl;
    if (!final) first.deniedReason = second.deniedReason ?? first.deniedReason;
  }

  const httpsRedirect =
    requestedUrl.startsWith('http://') ? chain.some((h) => h.location?.startsWith('https://')) : null;

  const challenge = final ? detectChallenge(final.status, final.headers, final.body) : null;
  if (final && !final.protocol) {
    // Workers/undici don't expose the negotiated protocol; infer h2/h3 hints from headers.
    final.protocol = final.headers['alt-svc']?.includes('h3') ? 'h3-advertised' : null;
  }
  return { requestedUrl, chain, final, httpsRedirect, challenge, error: final ? null : (first.deniedReason ?? 'No response') };
}
