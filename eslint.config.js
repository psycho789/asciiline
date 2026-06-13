import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": ["error", { "varsIgnorePattern": "^_" }],
      "no-undef": "error",
      "no-console": "off",
      "eqeqeq": "error",
      "prefer-const": "error",
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        sessionStorage: "readonly",
        location: "readonly",
        WebSocket: "readonly",
        TextDecoder: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        HTMLElement: "readonly",
      },
    },
  },
];
