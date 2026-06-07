# Remote Edit Bridge Extension

Manifest V3 browser extension popup for `wbsb-remote-edit`, built with pnpm, Vite+, and Vue 3.

The popup reads the current article only on `*://wbsb.dev/articles/new`, using wbsb's TipTap Markdown state for the article body. The bundled content script writes edited Markdown back to the wbsb editor.

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
