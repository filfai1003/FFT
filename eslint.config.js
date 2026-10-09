const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expo,
  prettier,
  { ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/*', 'server/*', 'admin/*', 'site/*', 'tools/*', 'build/*'] },
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
    },
  },
]);
