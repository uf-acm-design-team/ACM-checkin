import { buildCheckinLink } from '../../../lib/checkin-link';
import { parseCheckinLink } from './checkin-link';

describe('parseCheckinLink', () => {
  it('reads the slug from a production link', () => {
    expect(parseCheckinLink('https://acm-checkin.vercel.app/acm/checkin')).toBe('acm');
  });

  it('accepts local-dev hosts with ports (localhost and a LAN IP)', () => {
    expect(parseCheckinLink('http://localhost:3000/acm/checkin')).toBe('acm');
    expect(parseCheckinLink('http://192.168.1.20:3000/acm/checkin')).toBe('acm');
  });

  it('allows one trailing slash and surrounding whitespace', () => {
    expect(parseCheckinLink('https://x.com/acm/checkin/')).toBe('acm');
    expect(parseCheckinLink('  https://x.com/acm/checkin\n')).toBe('acm');
  });

  it('ignores a query string and hash', () => {
    expect(parseCheckinLink('https://x.com/acm/checkin?meeting=42#top')).toBe('acm');
  });

  it('keeps a hyphenated slug intact', () => {
    expect(parseCheckinLink('https://x.com/color-stack/checkin')).toBe('color-stack');
  });

  it("keeps the slug's case exactly as the web encoded it", () => {
    expect(parseCheckinLink('https://x.com/ACM/checkin')).toBe('ACM');
  });

  it('decodes a percent-encoded slug', () => {
    expect(parseCheckinLink('https://x.com/a%20b/checkin')).toBe('a b');
    expect(parseCheckinLink('https://x.com/%41CM/checkin')).toBe('ACM');
  });

  it('rejects text that is not a URL', () => {
    expect(parseCheckinLink('')).toBeNull();
    expect(parseCheckinLink('   ')).toBeNull();
    expect(parseCheckinLink('hello world')).toBeNull();
    expect(parseCheckinLink('acm/checkin')).toBeNull();
    expect(parseCheckinLink('WIFI:T:WPA;S:ClubNet;P:secret;;')).toBeNull();
  });

  it('rejects protocols other than http and https', () => {
    expect(parseCheckinLink('exp://192.168.1.20:8081/acm/checkin')).toBeNull();
    expect(parseCheckinLink('ftp://x.com/acm/checkin')).toBeNull();
    expect(parseCheckinLink('mailto:officer@example.com')).toBeNull();
  });

  it('rejects other paths', () => {
    expect(parseCheckinLink('https://x.com/')).toBeNull();
    expect(parseCheckinLink('https://x.com/acm')).toBeNull();
    expect(parseCheckinLink('https://x.com/acm/admin-dashboard')).toBeNull();
    expect(parseCheckinLink('https://x.com/acm/checkin/states-preview')).toBeNull();
    expect(parseCheckinLink('https://x.com/a/b/checkin')).toBeNull();
    expect(parseCheckinLink('https://x.com/acm/checkin//')).toBeNull();
  });

  it('rejects a missing slug', () => {
    expect(parseCheckinLink('https://x.com/checkin')).toBeNull();
    expect(parseCheckinLink('https://x.com//checkin')).toBeNull();
  });

  it('rejects malformed percent-encoding', () => {
    expect(parseCheckinLink('https://x.com/%E0%A4%A/checkin')).toBeNull();
    expect(parseCheckinLink('https://x.com/%/checkin')).toBeNull();
  });

  it('rejects a slug that decodes to contain "/"', () => {
    expect(parseCheckinLink('https://x.com/a%2Fb/checkin')).toBeNull();
  });
});

describe('agreement with the web link format (lib/checkin-link.ts)', () => {
  const origins = [
    'https://acm-checkin.vercel.app',
    'https://acm-checkin.vercel.app/',
    'http://localhost:3000',
    'http://192.168.1.20:3000',
  ];

  it.each(origins)('parses what buildCheckinLink makes for %s', (origin) => {
    expect(parseCheckinLink(buildCheckinLink('acm', origin))).toBe('acm');
    expect(parseCheckinLink(buildCheckinLink('color-stack', origin))).toBe('color-stack');
    expect(parseCheckinLink(buildCheckinLink('a b', origin))).toBe('a b');
      expect(parseCheckinLink(buildCheckinLink('ACM', origin))).toBe('ACM');
  });
});
