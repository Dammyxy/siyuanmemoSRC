var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// plugin.json
var require_plugin = __commonJS({
  "plugin.json"(exports, module) {
    module.exports = {
      name: "siyuan-plugin-fsrs",
      author: "Dammy",
      url: "https://github.com/Dammy/siyuan-plugin-fsrs",
      version: "0.0.1",
      minAppVersion: "2.10.14",
      backends: [
        "all"
      ],
      frontends: [
        "all"
      ],
      displayName: {
        default: "FSRS Flashcard",
        en_US: "FSRS Flashcard",
        zh_CN: "FSRS \u95EA\u5361"
      },
      description: {
        default: "Modern flashcard plugin based on FSRS v6 algorithm with incremental reading support",
        en_US: "Modern flashcard plugin based on FSRS v6 algorithm with incremental reading support",
        zh_CN: "\u57FA\u4E8E FSRS v6 \u7B97\u6CD5\u7684\u73B0\u4EE3\u95EA\u5361\u63D2\u4EF6\uFF0C\u652F\u6301\u589E\u91CF\u9605\u8BFB"
      },
      readme: {
        default: "README.md",
        en_US: "README.md",
        zh_CN: "README_zh_CN.md"
      },
      funding: {
        custom: []
      },
      keywords: [
        "flashcard",
        "spaced-repetition",
        "fsrs",
        "incremental-reading"
      ]
    };
  }
});

// vite.config.ts
import { resolve } from "node:path";
import vue from "file:///H:/project-F/flashcard/siyuan-plugin-fsrs/node_modules/.pnpm/@vitejs+plugin-vue@5.2.4_vi_e282b19d774bdb303f0e58e460d57ac4/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import fg from "file:///H:/project-F/flashcard/siyuan-plugin-fsrs/node_modules/.pnpm/fast-glob@3.3.3/node_modules/fast-glob/out/index.js";
import minimist from "file:///H:/project-F/flashcard/siyuan-plugin-fsrs/node_modules/.pnpm/minimist@1.2.8/node_modules/minimist/index.js";
import livereload from "file:///H:/project-F/flashcard/siyuan-plugin-fsrs/node_modules/.pnpm/rollup-plugin-livereload@2.0.5/node_modules/rollup-plugin-livereload/dist/index.cjs.js";
import {
  defineConfig,
  loadEnv
} from "file:///H:/project-F/flashcard/siyuan-plugin-fsrs/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.30_sass@1.97.2/node_modules/vite/dist/node/index.js";
import { viteStaticCopy } from "file:///H:/project-F/flashcard/siyuan-plugin-fsrs/node_modules/.pnpm/vite-plugin-static-copy@1.0_9e5bc4b5a836a15ff7ee737342a7a8c7/node_modules/vite-plugin-static-copy/dist/index.js";
import zipPack from "file:///H:/project-F/flashcard/siyuan-plugin-fsrs/node_modules/.pnpm/vite-plugin-zip-pack@1.2.4__ba13c1eb8def4e2f8d91f67ae45a28f1/node_modules/vite-plugin-zip-pack/dist/esm/index.mjs";
var __vite_injected_original_dirname = "H:\\project-F\\flashcard\\siyuan-plugin-fsrs";
var pluginInfo = require_plugin();
var vite_config_default = defineConfig(({
  mode
}) => {
  console.log("mode=>", mode);
  const env = loadEnv(mode, process.cwd());
  const {
    VITE_SIYUAN_WORKSPACE_PATH
  } = env;
  console.log("env=>", env);
  const siyuanWorkspacePath = VITE_SIYUAN_WORKSPACE_PATH;
  let devDistDir = "./dev";
  if (!siyuanWorkspacePath) {
    console.log("\nSiyuan workspace path is not set.");
  } else {
    console.log(`
Siyuan workspace path is set:
${siyuanWorkspacePath}`);
    devDistDir = `${siyuanWorkspacePath}/data/plugins/${pluginInfo.name}`;
  }
  console.log(`
Plugin will build to:
${devDistDir}`);
  const args = minimist(process.argv.slice(2));
  const isWatch = args.watch || args.w || false;
  const distDir = isWatch ? devDistDir : "./dist";
  console.log();
  console.log("isWatch=>", isWatch);
  console.log("distDir=>", distDir);
  return {
    resolve: {
      alias: {
        "@": resolve(__vite_injected_original_dirname, "src")
      }
    },
    plugins: [
      vue(),
      viteStaticCopy({
        targets: [
          {
            src: "./README*.md",
            dest: "./"
          },
          {
            src: "./icon.png",
            dest: "./"
          },
          {
            src: "./preview.png",
            dest: "./"
          },
          {
            src: "./plugin.json",
            dest: "./"
          },
          {
            src: "./src/i18n/**",
            dest: "./i18n/"
          }
        ]
      })
    ],
    // https://github.com/vitejs/vite/issues/1930
    // https://vitejs.dev/guide/env-and-mode.html#env-files
    // https://github.com/vitejs/vite/discussions/3058#discussioncomment-2115319
    // 在这里自定义变量
    define: {
      "process.env.DEV_MODE": `"${isWatch}"`,
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV)
    },
    build: {
      // 输出路径
      outDir: distDir,
      emptyOutDir: !isWatch,
      // 构建后是否生成 source map 文件
      sourcemap: false,
      // 设置为 false 可以禁用最小化混淆
      // 或是用来指定是应用哪种混淆器
      // boolean | 'terser' | 'esbuild'
      // 不压缩，用于调试
      minify: !isWatch,
      lib: {
        // Could also be a dictionary or array of multiple entry points
        entry: resolve(__vite_injected_original_dirname, "src/index.ts"),
        // the proper extensions will be added
        fileName: "index",
        formats: ["cjs"]
      },
      rollupOptions: {
        plugins: [
          ...isWatch ? [
            livereload(devDistDir),
            {
              // 监听静态资源文件
              name: "watch-external",
              async buildStart() {
                const files = await fg([
                  "src/i18n/*.json",
                  "./README*.md",
                  "./plugin.json"
                ]);
                for (const file of files) {
                  this.addWatchFile(file);
                }
              }
            }
          ] : [
            zipPack({
              inDir: "./dist",
              outDir: "./",
              outFileName: "package.zip"
            })
          ]
        ],
        // make sure to externalize deps that shouldn't be bundled
        // into your library
        external: ["siyuan", "process"],
        output: {
          entryFileNames: "[name].js",
          assetFileNames: (assetInfo) => {
            if (assetInfo.name === "style.css") {
              return "index.css";
            }
            return assetInfo.name;
          }
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsicGx1Z2luLmpzb24iLCAidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIntcclxuICBcIm5hbWVcIjogXCJzaXl1YW4tcGx1Z2luLWZzcnNcIixcclxuICBcImF1dGhvclwiOiBcIkRhbW15XCIsXHJcbiAgXCJ1cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vRGFtbXkvc2l5dWFuLXBsdWdpbi1mc3JzXCIsXHJcbiAgXCJ2ZXJzaW9uXCI6IFwiMC4wLjFcIixcclxuICBcIm1pbkFwcFZlcnNpb25cIjogXCIyLjEwLjE0XCIsXHJcbiAgXCJiYWNrZW5kc1wiOiBbXHJcbiAgICBcImFsbFwiXHJcbiAgXSxcclxuICBcImZyb250ZW5kc1wiOiBbXHJcbiAgICBcImFsbFwiXHJcbiAgXSxcclxuICBcImRpc3BsYXlOYW1lXCI6IHtcclxuICAgIFwiZGVmYXVsdFwiOiBcIkZTUlMgRmxhc2hjYXJkXCIsXHJcbiAgICBcImVuX1VTXCI6IFwiRlNSUyBGbGFzaGNhcmRcIixcclxuICAgIFwiemhfQ05cIjogXCJGU1JTIFx1OTVFQVx1NTM2MVwiXHJcbiAgfSxcclxuICBcImRlc2NyaXB0aW9uXCI6IHtcclxuICAgIFwiZGVmYXVsdFwiOiBcIk1vZGVybiBmbGFzaGNhcmQgcGx1Z2luIGJhc2VkIG9uIEZTUlMgdjYgYWxnb3JpdGhtIHdpdGggaW5jcmVtZW50YWwgcmVhZGluZyBzdXBwb3J0XCIsXHJcbiAgICBcImVuX1VTXCI6IFwiTW9kZXJuIGZsYXNoY2FyZCBwbHVnaW4gYmFzZWQgb24gRlNSUyB2NiBhbGdvcml0aG0gd2l0aCBpbmNyZW1lbnRhbCByZWFkaW5nIHN1cHBvcnRcIixcclxuICAgIFwiemhfQ05cIjogXCJcdTU3RkFcdTRFOEUgRlNSUyB2NiBcdTdCOTdcdTZDRDVcdTc2ODRcdTczQjBcdTRFRTNcdTk1RUFcdTUzNjFcdTYzRDJcdTRFRjZcdUZGMENcdTY1MkZcdTYzMDFcdTU4OUVcdTkxQ0ZcdTk2MDVcdThCRkJcIlxyXG4gIH0sXHJcbiAgXCJyZWFkbWVcIjoge1xyXG4gICAgXCJkZWZhdWx0XCI6IFwiUkVBRE1FLm1kXCIsXHJcbiAgICBcImVuX1VTXCI6IFwiUkVBRE1FLm1kXCIsXHJcbiAgICBcInpoX0NOXCI6IFwiUkVBRE1FX3poX0NOLm1kXCJcclxuICB9LFxyXG4gIFwiZnVuZGluZ1wiOiB7XHJcbiAgICBcImN1c3RvbVwiOiBbXVxyXG4gIH0sXHJcbiAgXCJrZXl3b3Jkc1wiOiBbXHJcbiAgICBcImZsYXNoY2FyZFwiLFxyXG4gICAgXCJzcGFjZWQtcmVwZXRpdGlvblwiLFxyXG4gICAgXCJmc3JzXCIsXHJcbiAgICBcImluY3JlbWVudGFsLXJlYWRpbmdcIlxyXG4gIF1cclxufSIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiSDpcXFxccHJvamVjdC1GXFxcXGZsYXNoY2FyZFxcXFxzaXl1YW4tcGx1Z2luLWZzcnNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkg6XFxcXHByb2plY3QtRlxcXFxmbGFzaGNhcmRcXFxcc2l5dWFuLXBsdWdpbi1mc3JzXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9IOi9wcm9qZWN0LUYvZmxhc2hjYXJkL3NpeXVhbi1wbHVnaW4tZnNycy92aXRlLmNvbmZpZy50c1wiOy8qIGVzbGludC1kaXNhYmxlIG5vZGUvcHJlZmVyLWdsb2JhbC9wcm9jZXNzICovXHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tIFwibm9kZTpwYXRoXCJcclxuaW1wb3J0IHZ1ZSBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tdnVlXCJcclxuaW1wb3J0IGZnIGZyb20gXCJmYXN0LWdsb2JcIlxyXG5pbXBvcnQgbWluaW1pc3QgZnJvbSBcIm1pbmltaXN0XCJcclxuaW1wb3J0IGxpdmVyZWxvYWQgZnJvbSBcInJvbGx1cC1wbHVnaW4tbGl2ZXJlbG9hZFwiXHJcbmltcG9ydCB7XHJcbiAgZGVmaW5lQ29uZmlnLFxyXG4gIGxvYWRFbnYsXHJcbn0gZnJvbSBcInZpdGVcIlxyXG5pbXBvcnQgeyB2aXRlU3RhdGljQ29weSB9IGZyb20gXCJ2aXRlLXBsdWdpbi1zdGF0aWMtY29weVwiXHJcbmltcG9ydCB6aXBQYWNrIGZyb20gXCJ2aXRlLXBsdWdpbi16aXAtcGFja1wiXHJcblxyXG5jb25zdCBwbHVnaW5JbmZvID0gcmVxdWlyZShcIi4vcGx1Z2luLmpzb25cIilcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoe1xyXG4gIG1vZGUsXHJcbn0pID0+IHtcclxuXHJcbiAgY29uc29sZS5sb2coJ21vZGU9PicsIG1vZGUpXHJcbiAgY29uc3QgZW52ID0gbG9hZEVudihtb2RlLCBwcm9jZXNzLmN3ZCgpKVxyXG4gIGNvbnN0IHtcclxuICAgIFZJVEVfU0lZVUFOX1dPUktTUEFDRV9QQVRILFxyXG4gIH0gPSBlbnZcclxuICBjb25zb2xlLmxvZygnZW52PT4nLCBlbnYpXHJcblxyXG5cclxuICBjb25zdCBzaXl1YW5Xb3Jrc3BhY2VQYXRoID0gVklURV9TSVlVQU5fV09SS1NQQUNFX1BBVEhcclxuICBsZXQgZGV2RGlzdERpciA9ICcuL2RldidcclxuICBpZiAoIXNpeXVhbldvcmtzcGFjZVBhdGgpIHtcclxuICAgIGNvbnNvbGUubG9nKFwiXFxuU2l5dWFuIHdvcmtzcGFjZSBwYXRoIGlzIG5vdCBzZXQuXCIpXHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnNvbGUubG9nKGBcXG5TaXl1YW4gd29ya3NwYWNlIHBhdGggaXMgc2V0OlxcbiR7c2l5dWFuV29ya3NwYWNlUGF0aH1gKVxyXG4gICAgZGV2RGlzdERpciA9IGAke3NpeXVhbldvcmtzcGFjZVBhdGh9L2RhdGEvcGx1Z2lucy8ke3BsdWdpbkluZm8ubmFtZX1gXHJcbiAgfVxyXG4gIGNvbnNvbGUubG9nKGBcXG5QbHVnaW4gd2lsbCBidWlsZCB0bzpcXG4ke2RldkRpc3REaXJ9YClcclxuXHJcbiAgY29uc3QgYXJncyA9IG1pbmltaXN0KHByb2Nlc3MuYXJndi5zbGljZSgyKSlcclxuICBjb25zdCBpc1dhdGNoID0gYXJncy53YXRjaCB8fCBhcmdzLncgfHwgZmFsc2VcclxuICBjb25zdCBkaXN0RGlyID0gaXNXYXRjaCA/IGRldkRpc3REaXIgOiBcIi4vZGlzdFwiXHJcblxyXG4gIGNvbnNvbGUubG9nKClcclxuICBjb25zb2xlLmxvZyhcImlzV2F0Y2g9PlwiLCBpc1dhdGNoKVxyXG4gIGNvbnNvbGUubG9nKFwiZGlzdERpcj0+XCIsIGRpc3REaXIpXHJcblxyXG4gIHJldHVybiB7XHJcbiAgICByZXNvbHZlOiB7XHJcbiAgICAgIGFsaWFzOiB7XHJcbiAgICAgICAgXCJAXCI6IHJlc29sdmUoX19kaXJuYW1lLCBcInNyY1wiKSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcblxyXG4gICAgcGx1Z2luczogW1xyXG4gICAgICB2dWUoKSxcclxuICAgICAgdml0ZVN0YXRpY0NvcHkoe1xyXG4gICAgICAgIHRhcmdldHM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiBcIi4vUkVBRE1FKi5tZFwiLFxyXG4gICAgICAgICAgICBkZXN0OiBcIi4vXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6IFwiLi9pY29uLnBuZ1wiLFxyXG4gICAgICAgICAgICBkZXN0OiBcIi4vXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6IFwiLi9wcmV2aWV3LnBuZ1wiLFxyXG4gICAgICAgICAgICBkZXN0OiBcIi4vXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6IFwiLi9wbHVnaW4uanNvblwiLFxyXG4gICAgICAgICAgICBkZXN0OiBcIi4vXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6IFwiLi9zcmMvaTE4bi8qKlwiLFxyXG4gICAgICAgICAgICBkZXN0OiBcIi4vaTE4bi9cIixcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgfSksXHJcbiAgICBdLFxyXG5cclxuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS92aXRlanMvdml0ZS9pc3N1ZXMvMTkzMFxyXG4gICAgLy8gaHR0cHM6Ly92aXRlanMuZGV2L2d1aWRlL2Vudi1hbmQtbW9kZS5odG1sI2Vudi1maWxlc1xyXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3ZpdGVqcy92aXRlL2Rpc2N1c3Npb25zLzMwNTgjZGlzY3Vzc2lvbmNvbW1lbnQtMjExNTMxOVxyXG4gICAgLy8gXHU1NzI4XHU4RkQ5XHU5MUNDXHU4MUVBXHU1QjlBXHU0RTQ5XHU1M0Q4XHU5MUNGXHJcbiAgICBkZWZpbmU6IHtcclxuICAgICAgXCJwcm9jZXNzLmVudi5ERVZfTU9ERVwiOiBgXCIke2lzV2F0Y2h9XCJgLFxyXG4gICAgICBcInByb2Nlc3MuZW52Lk5PREVfRU5WXCI6IEpTT04uc3RyaW5naWZ5KHByb2Nlc3MuZW52Lk5PREVfRU5WKSxcclxuICAgIH0sXHJcblxyXG4gICAgYnVpbGQ6IHtcclxuICAgICAgLy8gXHU4RjkzXHU1MUZBXHU4REVGXHU1Rjg0XHJcbiAgICAgIG91dERpcjogZGlzdERpcixcclxuICAgICAgZW1wdHlPdXREaXI6ICFpc1dhdGNoLFxyXG5cclxuICAgICAgLy8gXHU2Nzg0XHU1RUZBXHU1NDBFXHU2NjJGXHU1NDI2XHU3NTFGXHU2MjEwIHNvdXJjZSBtYXAgXHU2NTg3XHU0RUY2XHJcbiAgICAgIHNvdXJjZW1hcDogZmFsc2UsXHJcblxyXG4gICAgICAvLyBcdThCQkVcdTdGNkVcdTRFM0EgZmFsc2UgXHU1M0VGXHU0RUU1XHU3OTgxXHU3NTI4XHU2NzAwXHU1QzBGXHU1MzE2XHU2REY3XHU2REM2XHJcbiAgICAgIC8vIFx1NjIxNlx1NjYyRlx1NzUyOFx1Njc2NVx1NjMwN1x1NUI5QVx1NjYyRlx1NUU5NFx1NzUyOFx1NTRFQVx1NzlDRFx1NkRGN1x1NkRDNlx1NTY2OFxyXG4gICAgICAvLyBib29sZWFuIHwgJ3RlcnNlcicgfCAnZXNidWlsZCdcclxuICAgICAgLy8gXHU0RTBEXHU1MzhCXHU3RjI5XHVGRjBDXHU3NTI4XHU0RThFXHU4QzAzXHU4QkQ1XHJcbiAgICAgIG1pbmlmeTogIWlzV2F0Y2gsXHJcblxyXG4gICAgICBsaWI6IHtcclxuICAgICAgICAvLyBDb3VsZCBhbHNvIGJlIGEgZGljdGlvbmFyeSBvciBhcnJheSBvZiBtdWx0aXBsZSBlbnRyeSBwb2ludHNcclxuICAgICAgICBlbnRyeTogcmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjL2luZGV4LnRzXCIpLFxyXG4gICAgICAgIC8vIHRoZSBwcm9wZXIgZXh0ZW5zaW9ucyB3aWxsIGJlIGFkZGVkXHJcbiAgICAgICAgZmlsZU5hbWU6IFwiaW5kZXhcIixcclxuICAgICAgICBmb3JtYXRzOiBbXCJjanNcIl0sXHJcbiAgICAgIH0sXHJcbiAgICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgICBwbHVnaW5zOiBbXHJcbiAgICAgICAgICAuLi4oaXNXYXRjaFxyXG4gICAgICAgICAgICA/IFtcclxuICAgICAgICAgICAgICAgIGxpdmVyZWxvYWQoZGV2RGlzdERpciksXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgIC8vIFx1NzZEMVx1NTQyQ1x1OTc1OVx1NjAwMVx1OEQ0NFx1NkU5MFx1NjU4N1x1NEVGNlxyXG4gICAgICAgICAgICAgICAgICBuYW1lOiBcIndhdGNoLWV4dGVybmFsXCIsXHJcbiAgICAgICAgICAgICAgICAgIGFzeW5jIGJ1aWxkU3RhcnQoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBhd2FpdCBmZyhbXHJcbiAgICAgICAgICAgICAgICAgICAgICBcInNyYy9pMThuLyouanNvblwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgXCIuL1JFQURNRSoubWRcIixcclxuICAgICAgICAgICAgICAgICAgICAgIFwiLi9wbHVnaW4uanNvblwiLFxyXG4gICAgICAgICAgICAgICAgICAgIF0pXHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZFdhdGNoRmlsZShmaWxlKVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgXVxyXG4gICAgICAgICAgICA6IFtcclxuICAgICAgICAgICAgICAgIHppcFBhY2soe1xyXG4gICAgICAgICAgICAgICAgICBpbkRpcjogXCIuL2Rpc3RcIixcclxuICAgICAgICAgICAgICAgICAgb3V0RGlyOiBcIi4vXCIsXHJcbiAgICAgICAgICAgICAgICAgIG91dEZpbGVOYW1lOiBcInBhY2thZ2UuemlwXCIsXHJcbiAgICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgICBdKSxcclxuICAgICAgICBdLFxyXG5cclxuICAgICAgICAvLyBtYWtlIHN1cmUgdG8gZXh0ZXJuYWxpemUgZGVwcyB0aGF0IHNob3VsZG4ndCBiZSBidW5kbGVkXHJcbiAgICAgICAgLy8gaW50byB5b3VyIGxpYnJhcnlcclxuICAgICAgICBleHRlcm5hbDogW1wic2l5dWFuXCIsIFwicHJvY2Vzc1wiXSxcclxuXHJcbiAgICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgICBlbnRyeUZpbGVOYW1lczogXCJbbmFtZV0uanNcIixcclxuICAgICAgICAgIGFzc2V0RmlsZU5hbWVzOiAoYXNzZXRJbmZvKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChhc3NldEluZm8ubmFtZSA9PT0gXCJzdHlsZS5jc3NcIikge1xyXG4gICAgICAgICAgICAgIHJldHVybiBcImluZGV4LmNzc1wiXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGFzc2V0SW5mby5uYW1lXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH1cclxufSlcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFDRSxNQUFRO0FBQUEsTUFDUixRQUFVO0FBQUEsTUFDVixLQUFPO0FBQUEsTUFDUCxTQUFXO0FBQUEsTUFDWCxlQUFpQjtBQUFBLE1BQ2pCLFVBQVk7QUFBQSxRQUNWO0FBQUEsTUFDRjtBQUFBLE1BQ0EsV0FBYTtBQUFBLFFBQ1g7QUFBQSxNQUNGO0FBQUEsTUFDQSxhQUFlO0FBQUEsUUFDYixTQUFXO0FBQUEsUUFDWCxPQUFTO0FBQUEsUUFDVCxPQUFTO0FBQUEsTUFDWDtBQUFBLE1BQ0EsYUFBZTtBQUFBLFFBQ2IsU0FBVztBQUFBLFFBQ1gsT0FBUztBQUFBLFFBQ1QsT0FBUztBQUFBLE1BQ1g7QUFBQSxNQUNBLFFBQVU7QUFBQSxRQUNSLFNBQVc7QUFBQSxRQUNYLE9BQVM7QUFBQSxRQUNULE9BQVM7QUFBQSxNQUNYO0FBQUEsTUFDQSxTQUFXO0FBQUEsUUFDVCxRQUFVLENBQUM7QUFBQSxNQUNiO0FBQUEsTUFDQSxVQUFZO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUE7QUFBQTs7O0FDbkNBLFNBQVMsZUFBZTtBQUN4QixPQUFPLFNBQVM7QUFDaEIsT0FBTyxRQUFRO0FBQ2YsT0FBTyxjQUFjO0FBQ3JCLE9BQU8sZ0JBQWdCO0FBQ3ZCO0FBQUEsRUFDRTtBQUFBLEVBQ0E7QUFBQSxPQUNLO0FBQ1AsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTyxhQUFhO0FBWHBCLElBQU0sbUNBQW1DO0FBYXpDLElBQU0sYUFBYTtBQUVuQixJQUFPLHNCQUFRLGFBQWEsQ0FBQztBQUFBLEVBQzNCO0FBQ0YsTUFBTTtBQUVKLFVBQVEsSUFBSSxVQUFVLElBQUk7QUFDMUIsUUFBTSxNQUFNLFFBQVEsTUFB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
