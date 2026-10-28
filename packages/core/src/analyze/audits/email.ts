import type { BlocklistData, DnsRecords, Finding } from '../../types.js';

/** Email authentication as publicly visible in DNS. Descriptive, never "your email is insecure". */
export function auditEmail(dns: DnsRecords, registrable: string, blocklists?: BlocklistData | null): Finding[] {
  const out: Finding[] = [];
  const hasMx = dns.MX.length > 0;
  out.push(hasMx ? { id: 'mx', title: 'Receives email', status: 'info', observed: dns.MX.map((m) => `${m.priority} ${m.exchange}`).join(', ') } : { id: 'mx', title: 'Receives email', status: 'info', observed: 'No MX records. The domain does not appear to receive email.' });

  const spf = dns.TXT.filter((t) => /^v=spf1\b/i.test(t));
  if (spf.length === 1) {
    const rec = spf[0]!;
    // The `all` term, or (for redirect-only records) the one the redirect resolves to. Matching on whole terms
    // avoids hits inside domain names such as include:_spf.install.com.
    const ownAll = rec.split(/\s+/).slice(1).map((t) => /^([+\-~?]?)all$/i.exec(t)).find(Boolean);
    const all = ownAll ? (ownAll[1] ?? '') : (dns.spf?.allQualifier ?? '');
    const walked = dns.spf?.totalLookups;
    const lookups = walked ?? (rec.match(/\b(include|a|mx|ptr|exists|redirect)[:=]?/gi) ?? []).length;
    const status: Finding['status'] = all === '-' || all === '~' ? 'good' : all === '?' ? 'warn' : 'warn';
    out.push({ id: 'spf', title: 'Approved senders (SPF)', status, observed: `${rec}`, detail: all === '+' || all === '' ? 'The record ends without ~all/-all, so it does not tell receivers to reject unknown senders.' : lookups > 10 ? `${dns.spf ? `${lookups} DNS lookups after following every include` : `Around ${lookups} DNS-lookup mechanisms`}; SPF permits 10, beyond which receivers treat the record as an error (permerror).` : 'SPF lists the servers allowed to send mail for this domain.', evidence: [{ source: 'dns', key: 'TXT', value: rec }] });
  } else if (spf.length > 1) out.push({ id: 'spf', title: 'Approved senders (SPF)', status: 'bad', observed: `${spf.length} SPF records found; receivers treat multiple records as a permanent error.` });
  else out.push({ id: 'spf', title: 'Approved senders (SPF)', status: hasMx ? 'warn' : 'info', observed: 'No SPF record observed.', detail: hasMx ? 'Without SPF, anyone can send mail claiming to be from this domain and receivers cannot tell.' : 'A domain that sends no mail can still be spoofed. Publishing "v=spf1 -all" and a DMARC record with p=reject tells receivers to drop any mail claiming to come from it.' });

  const dmarc = dns.dmarc.find((t) => /^v=DMARC1\b/i.test(t));
  if (dmarc) {
    const p = /\bp=(none|quarantine|reject)/i.exec(dmarc)?.[1]?.toLowerCase() ?? 'none';
    const pct = /\bpct=(\d+)/i.exec(dmarc)?.[1];
    const rua = /\brua=/i.test(dmarc);
    out.push({ id: 'dmarc', title: 'Spoofing policy (DMARC)', status: p === 'reject' ? 'good' : p === 'quarantine' ? 'good' : 'warn', observed: `p=${p}${pct ? `, pct=${pct}` : ''}${rua ? ', aggregate reports enabled' : ', no reporting address'}.`, detail: p === 'none' ? 'p=none only monitors; spoofed mail is still delivered. Moving to quarantine/reject (once SPF/DKIM are aligned) tells receivers to act.' : 'DMARC tells receivers what to do with mail that fails SPF/DKIM alignment.', evidence: [{ source: 'dns', key: '_dmarc TXT', value: dmarc }] });
  } else out.push({ id: 'dmarc', title: 'Spoofing policy (DMARC)', status: hasMx ? 'warn' : 'info', observed: 'No DMARC record observed.', detail: 'DMARC is what lets receivers reject spoofed mail and lets you receive reports about it.' });

  out.push(dns.dkimSelectors.length ? { id: 'dkim', title: 'Email signing (DKIM)', status: 'good', observed: `DKIM key(s) found for common selector(s): ${dns.dkimSelectors.join(', ')}.`, detail: 'Only well-known selectors were checked; a domain can use any selector name, so absence here is not proof of absence.' } : { id: 'dkim', title: 'Email signing (DKIM)', status: 'unknown', observed: 'No DKIM key found under common selector names.', detail: 'DKIM selectors are arbitrary, so this check can miss them. It does not mean DKIM is not configured.' });

  const mta = dns.mtaSts.find((t) => /^v=STSv1\b/i.test(t));
  out.push(mta ? { id: 'mta-sts', title: 'Encrypted delivery (MTA-STS)', status: 'good', observed: 'MTA-STS policy record present.', detail: 'Tells sending servers to require TLS when delivering to this domain.' } : { id: 'mta-sts', title: 'Encrypted delivery (MTA-STS)', status: 'info', observed: 'Not observed (uncommon; optional hardening).' });
  out.push(dns.tlsRpt?.length ? { id: 'tls-rpt', title: 'TLS failure reports (TLS-RPT)', status: 'good', observed: dns.tlsRpt[0]!, detail: 'Senders email a report when they cannot deliver mail to you over TLS.' } : { id: 'tls-rpt', title: 'TLS failure reports (TLS-RPT)', status: 'info', observed: 'Not observed (optional; pairs with MTA-STS).' });
  const tlsaHosts = Object.keys(dns.tlsa ?? {});
  if (hasMx) out.push(tlsaHosts.length ? { id: 'dane', title: 'DANE for mail (TLSA)', status: 'good', observed: `TLSA records for ${tlsaHosts.join(', ')}.`, detail: 'DANE pins the mail server certificate in DNS; it needs DNSSEC to be meaningful.' } : { id: 'dane', title: 'DANE for mail (TLSA)', status: 'info', observed: 'No TLSA records on the mail servers (uncommon; optional hardening).' });
  if (dns.bimi.length) out.push({ id: 'bimi', title: 'Brand logo in inbox (BIMI)', status: 'info', observed: 'BIMI record present (brand logo in supporting inboxes).' });

  out.push(dns.CAA.length ? { id: 'caa', title: 'Certificate issuer lock (CAA)', status: 'good', observed: dns.CAA.join('; '), detail: 'CAA restricts which certificate authorities may issue certificates for the domain.' } : { id: 'caa', title: 'Certificate issuer lock (CAA)', status: 'info', observed: 'No CAA records. Any public CA may issue certificates for the domain (the default).' });
  out.push(dns.dnssec ? { id: 'dnssec', title: 'DNS tamper-proofing (DNSSEC)', status: 'good', observed: 'Resolver validated the zone (AD flag set).' } : { id: 'dnssec', title: 'DNS tamper-proofing (DNSSEC)', status: 'info', observed: 'Not validated. DNSSEC is uncommon and optional.' });
  void registrable;

  const spf2 = dns.spf;
  if (spf2) {
    if (spf2.totalLookups > 10) out.push({ id: 'spf-lookups', title: 'SPF lookup limit', status: 'bad', observed: `${spf2.totalLookups} of 10 allowed DNS lookups used. Receivers return permerror and ignore SPF.`, detail: 'Remove unused include: entries, or flatten rarely changing providers into ip4:/ip6: ranges.' });
    else if (spf2.totalLookups >= 9) out.push({ id: 'spf-lookups', title: 'SPF lookup limit', status: 'warn', observed: `${spf2.totalLookups} of 10 allowed DNS lookups used; one more include breaks SPF.` });
    else out.push({ id: 'spf-lookups', title: 'SPF lookup limit', status: 'good', observed: `${spf2.totalLookups} of 10 allowed DNS lookups used.` });
    if (spf2.voidLookups > 2) out.push({ id: 'spf-void', title: 'SPF void lookups', status: 'warn', observed: `${spf2.voidLookups} lookups returned nothing; receivers stop after 2.`, detail: spf2.errors.slice(0, 3).join('; ') });
    if (spf2.hasPtr) out.push({ id: 'spf-ptr', title: 'SPF uses ptr', status: 'warn', observed: 'The ptr mechanism is slow, unreliable and discouraged by RFC 7208.' });
    if (spf2.allQualifier === '+' || spf2.allQualifier === '?') out.push({ id: 'spf-all', title: 'SPF allows everyone', status: 'warn', observed: `Ends with ${spf2.allQualifier}all, which authorises (or ignores) unlisted senders.` });
    const broken = spf2.errors.filter((e) => !/No SPF record/.test(e)).slice(0, 3);
    if (broken.length) out.push({ id: 'spf-errors', title: 'SPF record errors', status: 'warn', observed: broken.join('; ') });
  }
  if (blocklists) {
    const mail = blocklists.listed.filter((h) => h.role === 'mail');
    const web = blocklists.listed.filter((h) => h.role === 'web');
    const hits = [...mail, ...web];
    if (hits.length) out.push({ id: 'blocklist', title: 'IP blocklists', status: mail.length ? 'bad' : 'warn', observed: hits.map((h) => `${h.subject} (${h.role}) on ${h.list}`).join('; '), detail: mail.length ? 'A listed mail server will have mail rejected or sent to spam. Find out why the IP was listed and request delisting from that list.' : 'The web server IP appears on a blocklist; this matters mainly if the same IP sends email.' });
    else if (blocklists.checked.length) out.push({ id: 'blocklist', title: 'IP blocklists', status: 'good', observed: `${blocklists.checked.length} IP(s) checked against ${blocklists.lists.length - blocklists.unavailable.length} lists; none list them.${blocklists.unavailable.length ? ` ${blocklists.unavailable.join(', ')} did not answer.` : ''}` });
    else out.push({ id: 'blocklist', title: 'IP blocklists', status: 'info', observed: 'No directly checkable IP (web traffic is behind a CDN and no mail server IPv4 was found).' });
  }
  return out;
}
