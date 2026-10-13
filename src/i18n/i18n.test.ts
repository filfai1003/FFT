import i18n from './index';

describe('i18n', () => {
  it('translates English keys', () => {
    expect(i18n.t('common.save')).toBe('Save');
    expect(i18n.t('nav.today')).toBe('Home');
  });

  it('falls back to English for unsupported languages', async () => {
    await i18n.changeLanguage('xx');
    expect(i18n.t('common.cancel')).toBe('Cancel');
    await i18n.changeLanguage('en');
  });
});
