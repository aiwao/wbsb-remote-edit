# Remote Edit Bridge Extension

Manifest V3 browser extension popup for `wbsb-remote-edit`, built with pnpm, Vite+, Vue 3, and Turndown.

The bundled content script runs only on `*://wbsb.dev/articles/new`, reads the article title input, and converts the article body HTML children to Markdown.

## Commands

```sh
nix develop --command sh -lc 'cd extension && pnpm run build'
nix develop --command sh -lc 'cd extension && pnpm run dev'
nix develop --command sh -lc 'cd extension && pnpm run preview'
```

From inside this directory:

```sh
pnpm run build
pnpm run dev
pnpm run preview
```

Load the built extension from `dist/` in Chrome, or select `dist/manifest.json` in Firefox temporary add-on debugging.
