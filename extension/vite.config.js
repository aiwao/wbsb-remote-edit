import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const projectVersion = process.env.WBSB_REMOTE_EDIT_VERSION?.trim() || readProjectVersionFromNix();

function readProjectVersionFromNix() {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));

  try {
    const version = execFileSync("nix", ["run", ".#version"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

    if (!version) {
      throw new Error("nix run .#version returned an empty version");
    }

    return version;
  } catch (error) {
    const stderr = error?.stderr?.toString().trim();
    const detail = stderr || (error instanceof Error ? error.message : String(error));

    throw new Error(`Could not read project version by running nix run .#version: ${detail}`);
  }
}

function manifestVersionPlugin() {
  let distDir;

  return {
    name: "wbsb-remote-edit-manifest-version",
    configResolved(config) {
      distDir = path.isAbsolute(config.build.outDir)
        ? config.build.outDir
        : path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const manifestPath = fileURLToPath(new URL("./public/manifest.json", import.meta.url));
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.version = projectVersion;

      mkdirSync(distDir, { recursive: true });
      writeFileSync(path.join(distDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: "index.html",
      },
      output: {
        entryFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  plugins: [vue(), manifestVersionPlugin()],
  resolve: {
    alias: [
      {
        find: /^vue$/,
        replacement: fileURLToPath(new URL("./src/vendor/vue-runtime.js", import.meta.url)),
      },
    ],
  },
});
