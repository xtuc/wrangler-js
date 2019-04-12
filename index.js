#!/usr/bin/env node

const webpack = require("webpack");
const { Readable } = require("stream");
const { put } = require("request");
const { createReadStream } = require("fs");
const { join } = require("path");
const config = require(join(process.cwd(), "./webpack.config.js"));

const compiler = webpack(config);
const { CF_ACCOUNT_ID, CF_ACCOUNT_EMAIL, CF_API_KEY } = process.env;
const WASM_BINDING = "wasmprogram";

function filterByExtension(ext) {
  return v => v.indexOf("." + ext) !== -1;
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

function updateWorker(assets) {
  const options = {
    url: `https://api.cloudflare.com/client/v4/zones/${CF_ACCOUNT_ID}/workers/script`,
    headers: {
      "X-Auth-Email": CF_ACCOUNT_EMAIL,
      "X-Auth-Key": CF_API_KEY,
      "Content-Type": "multipart/form-data"
    }
  };

  const request = put(options, (err, httpResponse, body) => {
    if (err) {
      throw err;
    }

    const res = JSON.parse(body);

    if (res.success === true) {
      console.log("Deployed!");
    } else {
      console.log(res.errors, res.messages);
    }
  });

  const form = request.form();
  const wasmModuleAsset = Object.keys(assets).find(filterByExtension("wasm"));
  const jsAssets = Object.keys(assets).filter(filterByExtension("js"));
  const hasWasmModule = wasmModuleAsset !== null;

  const script =
    createPrologue(wasmModuleAsset) +
    jsAssets.reduce((acc, k) => {
      const asset = assets[k];
      return acc + asset.source();
    }, "");

  form.append("metadata", createMetadata(hasWasmModule), {
    contentType: "application/json"
  });
  form.append("script", script, { contentType: "application/javascript" });
  if (hasWasmModule === true) {
    form.append(WASM_BINDING, Buffer.from(assets[wasmModuleAsset].source()), {
      contentType: "application/wasm"
    });
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
  updateWorker(stats.compilation.assets);
  console.log(stats.toString({ colors: true }));
});
