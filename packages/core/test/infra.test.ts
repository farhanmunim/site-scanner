import { describe, expect, it } from 'vitest';
import { summariseInfra } from '../src/analyze/infra.js';
import type { DnsRecords } from '../src/types.js';

const dns = (NS: string[], MX: { priority: number; exchange: string }[] = []): DnsRecords => ({ A: [], AAAA: [], CNAME: [], MX, NS, TXT: [], CAA: [], SOA: null, dnssec: false, dmarc: [], mtaSts: [], dkimSelectors: [], bimi: [] } as unknown as DnsRecords);

describe('DNS provider naming', () => {
  it('calls the site\'s own nameservers self-hosted, using the registrable domain', () => {
    expect(summariseInfra([], [], dns(['ddns0.bbc.co.uk', 'ddns1.bbc.co.uk']), null, 'bbc.co.uk').dnsProvider?.name).toBe('Self-hosted (bbc.co.uk)');
  });
  it('names unknown third-party nameservers by their domain', () => {
    expect(summariseInfra([], [], dns(['ns1.example.net']), null, 'example.org').dnsProvider?.name).toBe('example.net nameservers');
  });
  it('keeps known providers', () => {
    expect(summariseInfra([], [], dns(['dee.ns.cloudflare.com']), null, 'example.org').dnsProvider?.name).toBe('Cloudflare DNS');
  });
});

describe('email provider naming', () => {
  it('calls the site\'s own mail server self-hosted', () => {
    expect(summariseInfra([], [], dns(['ns1.livedns.co.uk'], [{ priority: 10, exchange: 'mailserver.salikandco.com' }]), null, 'salikandco.com').emailProvider?.name).toBe('Self-hosted (salikandco.com)');
  });
  it('knows Fasthosts', () => {
    const i = summariseInfra([], [], dns(['ns1.livedns.co.uk'], [{ priority: 10, exchange: 'mx.livemail.co.uk' }]), null, 'example.co.uk');
    expect(i.dnsProvider?.name).toBe('Fasthosts DNS');
    expect(i.emailProvider?.name).toBe('Fasthosts Email');
  });
});
