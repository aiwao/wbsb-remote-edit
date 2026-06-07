import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

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
        content: "src/content/index.js",
        index: "index.html",
      },
      output: {
        entryFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: /^vue$/,
        replacement: fileURLToPath(new URL("./src/vendor/vue-runtime.js", import.meta.url)),
      },
    ],
  },
});
