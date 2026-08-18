// Flat ESLint config for elftia-plugin-computer-use — self-contained (this
// repo installs its own devDependencies; no reference to the elftia host
// monorepo). Enforces the elftia style basics: no `var`, `eqeqeq`,
// `prefer-const`, import order (simple-import-sort).
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    // The vitest suite (.ts run through esbuild — no tsconfig project here,
    // so no type-aware rules).
    files: ['tests/**/*.ts', 'vitest.config.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
      globals: { ...globals.node },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node ESM tooling (the verify-layout walk + this config itself).
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: { ...globals.node },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'no-console': 'off', // scripts print by design
    },
  },
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
];
