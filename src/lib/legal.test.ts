import { legalUrl, SITE_URL } from './legal';

describe('legalUrl', () => {
  it('points to the English pages of the install site', () => {
    expect(legalUrl('privacy')).toBe(`${SITE_URL}/privacy`);
    expect(legalUrl('terms')).toBe(`${SITE_URL}/terms`);
    expect(legalUrl('deleteAccount')).toBe(`${SITE_URL}/delete-account`);
  });

  it('has no trailing slash in the site address', () => {
    expect(SITE_URL.endsWith('/')).toBe(false);
  });
});
