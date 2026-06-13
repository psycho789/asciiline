import js from "@eslint/js";

const browserGlobals = {
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
    Worker: "readonly",
    OffscreenCanvas: "readonly",
    ImageData: "readonly",
};

const workerGlobals = {
    self: "readonly",
    importScripts: "readonly",
    OffscreenCanvas: "readonly",
    AsciilineGlyphAtlas: "writable",
};

export default [
    js.configs.recommended,
    {
        files: ["app.js"],
        rules: {
            "no-unused-vars": ["error", { "varsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-console": "off",
            eqeqeq: "error",
            "prefer-const": "error",
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: browserGlobals,
        },
    },
    {
        files: ["client/glyph_atlas.js"],
        rules: {
            "no-unused-vars": ["error", { "varsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-console": "off",
            eqeqeq: "error",
            "prefer-const": "error",
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...browserGlobals,
                self: "writable",
            },
        },
    },
    {
        files: ["client/render_worker.js"],
        rules: {
            "no-unused-vars": ["error", { "varsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-console": "off",
            eqeqeq: "error",
            "prefer-const": "error",
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: workerGlobals,
        },
    },
];
