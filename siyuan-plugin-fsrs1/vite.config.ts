/* eslint-disable node/prefer-global/process */
import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import fg from "fast-glob";
import minimist from "minimist";
import livereload from "rollup-plugin-livereload";
import {
    defineConfig,
    loadEnv,
} from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import zipPack from "vite-plugin-zip-pack";

const pluginInfo = require("./plugin.json");

export default defineConfig(({
    mode,
}) => {
    console.log('mode=>', mode);
    const env = loadEnv(mode, process.cwd());
    const { VITE_SIYUAN_WORKSPACE_PATH } = env;
    console.log('env=>', env);

    const siyuanWorkspacePath = VITE_SIYUAN_WORKSPACE_PATH;
    let devDistDir = './dev';
    if (!siyuanWorkspacePath) {
        console.log("\nSiyuan workspace path is not set.");
    } else {
        console.log(`\nSiyuan workspace path is set:\n${siyuanWorkspacePath}`);
        devDistDir = `${siyuanWorkspacePath}/data/plugins/${pluginInfo.name}`;
    }
    console.log(`\nPlugin will build to:\n${devDistDir}`);

    const args = minimist(process.argv.slice(2));
    const isWatch = args.watch || args.w || false;
    const distDir = isWatch ? devDistDir : "./dist";

    console.log();
    console.log("isWatch=>", isWatch);
    console.log("distDir=>", distDir);

    return {
        resolve: {
            alias: {
                "@": resolve(__dirname, "src"),
            },
        },

        plugins: [
            vue(),
            viteStaticCopy({
                targets: [
                    { src: "./README*.md", dest: "./" },
                    { src: "./icon.png", dest: "./" },
                    { src: "./plugin.json", dest: "./" },
                    { src: "./src/i18n/**", dest: "./i18n/" },
                ],
            }),
        ],

        define: {
            "process.env.DEV_MODE": `"${isWatch}"`,
            "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
        },

        build: {
            outDir: distDir,
            emptyOutDir: !isWatch,
            sourcemap: isWatch,
            minify: !isWatch,

            lib: {
                entry: resolve(__dirname, "src/index.ts"),
                fileName: "index",
                formats: ["cjs"],
            },

            rollupOptions: {
                plugins: [
                    ...(isWatch
                        ? [
                            livereload(devDistDir),
                            {
                                name: "watch-external",
                                async buildStart() {
                                    const files = await fg([
                                        "src/i18n/*.json",
                                        "./README*.md",
                                        "./plugin.json",
                                    ]);
                                    for (const file of files) {
                                        this.addWatchFile(file);
                                    }
                                },
                            },
                        ]
                        : [
                            zipPack({
                                inDir: "./dist",
                                outDir: "./",
                                outFileName: "package.zip",
                            }),
                        ]),
                ],

                external: ["siyuan", "process"],

                output: {
                    entryFileNames: "[name].js",
                    assetFileNames: (assetInfo) => {
                        if (assetInfo.name === "style.css") {
                            return "index.css";
                        }
                        return assetInfo.name || '';
                    },
                },
            },
        },
    };
});
