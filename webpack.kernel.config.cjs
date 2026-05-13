const path = require("node:path");
const { EsbuildPlugin } = require("esbuild-loader");

module.exports = (_env, argv) => {
  const production = argv.mode === "production";

  return {
    mode: argv.mode || "development",
    watch: !production,
    devtool: production ? false : "inline-source-map",
    entry: {
      kernel: "./src/kernel.ts",
    },
    experiments: {
      outputModule: true,
    },
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, "build/kernel"),
      library: {
        type: "module",
      },
    },
    externals: {
      siyuan: "siyuan",
    },
    optimization: {
      minimize: production,
      minimizer: [
        new EsbuildPlugin(),
      ],
    },
    resolve: {
      extensions: [".ts", ".js", ".json"],
    },
    module: {
      rules: [
        {
          test: /\.ts(x?)$/,
          include: [path.resolve(__dirname, "src")],
          use: [
            {
              loader: "esbuild-loader",
              options: {
                target: "esnext",
              },
            },
          ],
        },
      ],
    },
    plugins: [],
  };
};
