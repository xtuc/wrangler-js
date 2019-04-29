#!/usr/bin/env node

const webpack = require("webpack");
const { writeFileSync } = require("fs");
const { join } = require("path");
const config = require(join(process.cwd(), "./webpack.config.js"));

const compiler = webpack(config);
const WASM_BINDING = "wasmprogram";

function filterByExtension(ext) {
  return v => v.indexOf("." + ext) !== -1;
}

function toOutput(name) {
  return `./worker/${name}`;
}

function createPrologue(wasmFilename) {
  return `
    const window = this;

    function fetch(name) {
      if (name === "${wasmFilename}") {
        return Promise.resolve({
          arrayBuffer() {
            return ${WASM_BINDING}; // defined in bindinds
          }
        });
      }
      throw new Error("unreachable: attempt to fetch " + name);
    }
  `;
}

function emitForWrangler(assets) {
  const wasmModuleAsset = Object.keys(assets).find(filterByExtension("wasm"));
  const jsAssets = Object.keys(assets).filter(filterByExtension("js"));
  const hasWasmModule = wasmModuleAsset !== undefined;

  const script =
    createPrologue(wasmModuleAsset) +
    jsAssets.reduce((acc, k) => {
      const asset = assets[k];
      return acc + asset.source();
    }, "");

  writeFileSync(toOutput("script.js"), script);
  writeFileSync(toOutput("metadata.json"), createMetadata(hasWasmModule));

  if (hasWasmModule === true) {
    writeFileSync(
      toOutput("module.wasm"),
      Buffer.from(assets[wasmModuleAsset].source())
    );
  }
}

function createMetadata(hasWasmModule) {
  const metadata = { body_part: "script" };

  if (hasWasmModule === true) {
    metadata.bindings = [
      {
        name: WASM_BINDING,
        type: "wasm_module",
        part: WASM_BINDING
      }
    ];
  }

  return JSON.stringify(metadata);
}

compiler.run((err, stats) => {
  if (err) {
    throw err;
  }
  emitForWrangler(stats.compilation.assets);
  console.log(stats.toString({ colors: true }));
});
