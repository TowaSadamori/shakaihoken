// @ts-check
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = tseslint.config(
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic, // もしあれば
      ...angular.configs.tsRecommended,
      eslintPluginPrettierRecommended // ← ★TSファイルの設定にPrettierを適用
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // ... (既存のAngular ESLintルール)
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {}, // ここではPrettierを適用しない
  }
  // eslintPluginPrettierRecommended // ← ★ここからは削除（またはコメントアウト）
);