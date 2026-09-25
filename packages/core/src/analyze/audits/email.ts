import type { DnsRecords, Finding } from '../../types.js';

/** Email authentication as publicly visible in DNS. Descriptive, never "your email is insecure". */
export function auditEmail(dns: DnsRecords, registrable: string): Finding[] {
  const out: Finding[] = [];
  const hasMx = dns.MX.length > 0;
  out.push(hasMx ? { id: 'mx', title: 'Receives email', status: 'info', observed: dns.MX.map((m) => `${m.priority} ${m.exchange}`).join(', ') } : { id: 'mx', title: 'Receives email', status: 'info', observed: 'No MX records. The domain does not appear to receive email.' });

  const spf = dns.TXT.filter((t) => /^v=spf1\b/i.test(t));
  if (spf.length === 1) {
    const rec = spf[0]!;
    const all = /([~\-?+]?)all\b/i.exec(rec)?.[1] ?? '';
    const lookups = (rec.match(/\b(include|a|mx|ptr|exists|redirect)[:=]?/gi) ?? []).length;
    const status: Finding['status'] = all === '-' || all === '~' ? 'good' : all === '?' ? 'warn' : 'warn';
    out.push({ id: 'spf', title: 'Approved senders (SPF)', status, observed: `${rec}`, detail: all === '+' || all === '' ? 'The record ends without ~all/-all, so it does not tell receivers to reject unknown senders.' : lookups > 10 ? `Around ${lookups} DNS-lookup mechanisms; SPF permits 10, beyond which receivers treat the record as an error.` : 'SPF lists the servers allowed to send mail for this domain.', evidence: [{ source: 'dns', key: 'TXT', value: rec }] });
  } else if (spf.length > 1) out.push({ id: 'spf', title: 'Approved senders (SPF)', status: 'bad', observed: `${spf.length} SPF records found; receivers treat multiple records as a permanent error.` });
  else out.push({ id: 'spf', title: 'Approved senders (SPF)', status: hasMx ? 'warn' : 'info', observed: 'No SPF record observed.', detail: hasMx ? 'Without SPF, anyone can send mail claiming to be from this domain and receivers cannot tell.' : 'A domain that sends no mail can publish "v=spf1 -all" to say so.' });

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
  const tlsRpt = dns.TXT.find(() => false);
  void tlsRpt;
  if (dns.bimi.length) out.push({ id: 'bimi', title: 'Brand logo in inbox (BIMI)', status: 'info', observed: 'BIMI record present (brand logo in supporting inboxes).' });

  out.push(dns.CAA.length ? { id: 'caa', title: 'Certificate issuer lock (CAA)', status: 'good', observed: dns.CAA.join('; '), detail: 'CAA restricts which certificate authorities may issue certificates for the domain.' } : { id: 'caa', title: 'Certificate issuer lock (CAA)', status: 'info', observed: 'No CAA records. Any public CA may issue certificates for the domain (the default).' });
  out.push(dns.dnssec ? { id: 'dnssec', title: 'DNS tamper-proofing (DNSSEC)', status: 'good', observed: 'Resolver validated the zone (AD flag set).' } : { id: 'dnssec', title: 'DNS tamper-proofing (DNSSEC)', status: 'info', observed: 'Not validated. DNSSEC is uncommon and optional.' });
  void registrable;
  return out;
}
