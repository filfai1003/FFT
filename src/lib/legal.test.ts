import { legalUrl, SITE_URL } from './legal';

describe('legalUrl', () => {
  it('points to the pages of the install site', () => {
    expect(legalUrl('privacy')).toBe(`${SITE_URL}/privacy`);
    expect(legalUrl('terms', 'en')).toBe(`${SITE_URL}/terms`);
    expect(legalUrl('deleteAccount')).toBe(`${SITE_URL}/delete-account`);
  });

  it('opens the Italian version on a phone set to Italian', () => {
    expect(legalUrl('privacy', 'it')).toBe(`${SITE_URL}/privacy-it`);
    expect(legalUrl('terms', 'it')).toBe(`${SITE_URL}/terms-it`);
    expect(legalUrl('deleteAccount', 'it')).toBe(`${SITE_URL}/delete-account`);
  });

  it('has no trailing slash in the site address', () => {
    expect(SITE_URL.endsWith('/')).toBe(false);
  });
});
