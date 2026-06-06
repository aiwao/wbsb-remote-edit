# AGENTS.md

## Browser Extension Checks

- Use the Nix dev shell for extension tooling.
- When changing files under `extension/`, run:

```sh
nix develop --command web-ext lint --source-dir extension
```

- Keep the extension compatible with both Chrome and Firefox. The shared Manifest V3 file should continue to pass `web-ext lint` with zero errors, warnings, and notices.
