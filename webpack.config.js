'use strict';
const CopyPlugin = require('copy-webpack-plugin');

const path = require('path');

const CONTEXT_PATH = path.resolve(__dirname);
const DIST_PATH = `${CONTEXT_PATH}/dist/compiled/`;
const SRC_PATH = `${CONTEXT_PATH}/src`;

module.exports = {
  mode: 'production',
  context: CONTEXT_PATH,
  entry: {
    'content-script': `${SRC_PATH}/ts/contentScript.ts`,
    'popup': `${SRC_PATH}/ts/popup.ts`
  },
  output: {
    publicPath: '/',
    path: DIST_PATH,
    filename: '[name].js',
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json']
  },
  module: {
    rules: [
      { test: /\.[jt]sx?$/, loader: 'ts-loader', exclude: /node_modules/, }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/popup.html', to: `${DIST_PATH}/popup.html` },
        { from: 'src/popup.css', to: `${DIST_PATH}/popup.css` },
        { from: 'resources/90.png', to: `${DIST_PATH}/resources` },
        { from: 'resources/128.png', to: `${DIST_PATH}/resources` }
      ]
    })
  ]
};
