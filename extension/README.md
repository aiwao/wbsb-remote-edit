# Remote Edit Bridge Extension

Manifest V3 browser extension popup for `wbsb-remote-edit`, built with pnpm, Vite+, and Vue 3.

The popup reads the current article on `*://wbsb.dev/articles/new*` and `*://wbsb.dev/articles/*/edit*`, using wbsb's TipTap Markdown state for the article body. The bundled page script writes edited Markdown back to the wbsb editor.

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

`vp build` also works after dependencies are installed. In a fresh checkout, run `vp install` first, or use `pnpm run build`, which installs the locked dependencies before running `vp build`.

Load the built extension from `dist/` in Chrome, or select `dist/manifest.json` in Firefox temporary add-on debugging.
