#!/usr/bin/env node

const webpack = require("webpack");
const { join } = require("path");
const config = require(join(process.cwd(), "./webpack.config.js"));

const compiler = webpack(config);

function filterByExtension(ext) {
  return v => v.indexOf("." + ext) !== -1;
}

function emitForWrangler(assets) {
  const bundle = {
    wasm: null,
    wasm_name: "",
    script: null,
  };

  const wasmModuleAsset = Object.keys(assets).find(filterByExtension("wasm"));
  const jsAssets = Object.keys(assets).filter(filterByExtension("js"));
  const hasWasmModule = wasmModuleAsset !== undefined;

  bundle.script =
    jsAssets.reduce((acc, k) => {
      const asset = assets[k];
      return acc + asset.source();
    }, "");

  if (hasWasmModule === true) {
    bundle.wasm = Buffer.from(assets[wasmModuleAsset].source()).toString();
    bundle.wasm_name = wasmModuleAsset;
  }

  console.log(JSON.stringify(bundle));
}

compiler.run((err, stats) => {
  if (err) {
    throw err;
  }
  emitForWrangler(stats.compilation.assets);
  // console.log(stats.toString({ colors: true }));
});
