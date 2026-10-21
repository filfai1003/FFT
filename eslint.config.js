const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expo,
  prettier,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'node_modules/*',
      'supabase/*',
      'server/*',
      'admin/*',
      'site/*',
      'tools/*',
      'build/*',
      'backup/*',
      '.claude/*',
    ],
  },
  { files: ['jest.setup.js'], languageOptions: { globals: { jest: 'readonly' } } },
  {
    // UI copy must go through i18n: no literal text inside JSX.
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx', 'src/app/dev/**'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        { noStrings: false, allowedStrings: ['/', '·', '—', '×'] },
      ],
      // Figtree comes as one font file per weight: a fontWeight on it makes Android fall back to
      // the system font (Roboto). Use the Text props (medium, semibold) or a fontFamily token.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='fontWeight']",
          message:
            'Use <Text semibold|medium> or fontFamily tokens, not fontWeight (Android falls back to Roboto).',
        },
      ],
    },
  },
]);
