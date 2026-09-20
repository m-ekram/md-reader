import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

/**
 * Deliberately close to the recommended sets.
 *
 * The value here is catching the classes of mistake this project has actually
 * made — an unused import, a floating promise, a `computed` used for a side
 * effect — not enforcing a house style. Formatting is Prettier's job, and
 * `eslint-config-prettier` turns off every rule that would argue with it.
 */
export default ts.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'spike/PHASE0-*.md'] },

  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },

  // The renderer runs in a browser; main, preload and scripts run in Node.
  {
    files: ['src/renderer/**', 'src/preload/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['src/main/**', 'scripts/**', 'e2e/**', '*.config.*', 'spike/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Editor code touches both: DOM types plus Node-side helpers in tests.
    files: ['**/*.test.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  {
    rules: {
      // Underscore-prefixed arguments are conventional for "required by the
      // signature, deliberately unused".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Plenty of legitimate uses in editor and Electron plumbing; the compiler
      // already refuses the dangerous ones.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Single-word component names are fine for an app's own components.
      'vue/multi-word-component-names': 'off',
      // This codebase uses long attribute lists that Prettier already wraps.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',
    },
  },

  {
    // CommonJS scripts use require() by definition.
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    // Tests reach into internals and stub globals; the strictness that helps in
    // application code gets in the way here.
    files: ['**/*.test.ts', 'e2e/**', 'spike/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  prettier
)
