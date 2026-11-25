/** Turn a network/TLS error code into a sentence a site owner can act on. */
const REASONS: [RegExp, string][] = [
  [/UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT/, "the server's certificate chain is incomplete"],
  [/CERT_HAS_EXPIRED/, 'the certificate has expired'],
  [/ERR_TLS_CERT_ALTNAME_INVALID|Hostname\/IP does not match/, 'the certificate is for a different name'],
  [/SELF_SIGNED|DEPTH_ZERO_SELF_SIGNED/, 'the certificate is self-signed'],
  [/ENOTFOUND|EAI_AGAIN/, 'the domain does not resolve'],
  [/ECONNREFUSED/, 'the server refused the connection'],
  [/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|TimeoutError/, 'the server did not respond in time'],
  [/ECONNRESET|EPIPE|UND_ERR_SOCKET/, 'the connection was dropped'],
  [/EHOSTUNREACH|ENETUNREACH/, 'the server could not be reached'],
  [/Redirect loop/, 'the site redirects in a loop'],
  [/Too many redirects/, 'the site redirects too many times']
];

export function explainFailure(note: string | null | undefined): string {
  if (!note) return 'the page could not be loaded';
  for (const [re, text] of REASONS) if (re.test(note)) return text;
  const code = /Network error: ([A-Z_0-9]+)/.exec(note)?.[1];
  return code ? `the connection failed (${code})` : note.replace(/\.$/, '');
}
