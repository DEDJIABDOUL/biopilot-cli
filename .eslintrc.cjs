// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

module.exports = {
  env: {
    es2021: true,
    node: true,
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:react/recommended", "prettier"],
  overrides: [
    // BIOPILOT: BioPilot's own files carry BioPilot's header, not Microsoft's.
    {
      files: ["src/biopilot/**", "src/tests/biopilot/**", "src/tests/ui/catalog.test.ts", "scripts/build-db.ts"],
      rules: { "header/header": [2, "line", [" Copyright (c) BioPilot CLI contributors.", " Licensed under the MIT License."]] },
    },
    // BIOPILOT: the entry point starts with its shebang, which typescript-eslint 8 does not count as a comment:
    // the header rule would ask for a header above it. Its header is checked by eye.
    {
      files: ["src/index.ts"],
      rules: { "header/header": "off" },
    },
    {
      env: {
        node: true,
      },
      files: [".eslintrc.{js,cjs}"],
      parserOptions: {
        sourceType: "script",
      },
    },
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "react", "header"],
  rules: { "header/header": [2, "line", [" Copyright (c) Microsoft Corporation.", " Licensed under the MIT License."]] },
  settings: {
    react: {
      version: "detect",
    },
  },
};
