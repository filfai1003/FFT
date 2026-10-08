const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expo,
  prettier,
  { ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/*'] },
]);
