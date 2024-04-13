const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const webpack = require('webpack');
const WebpackDevMiddleware = require('webpack-dev-middleware');

const examplesConfiguration = require('./webpack.examples.config');

const configurations = examplesConfiguration(
  {...process.env, WEBPACK_SERVE: true},
  process.argv
);

const SERVE_PORT = process.env.SERVE_PORT ? Number(process.env.SERVE_PORT) : 10555;
const SPARQL_ENDPOINT = process.env.SPARQL_ENDPOINT;
const WIKIDATA_ENDPOINT = process.env.WIKIDATA_ENDPOINT
  ?? 'https://query.wikidata.org/sparql';

const app = express();

for (const config of configurations) {
  const compiler = webpack(config);

  app.use(WebpackDevMiddleware(compiler, {
    publicPath: config.output.publicPath,
  }));
}

if (SPARQL_ENDPOINT) {
  app.use(createProxyMiddleware('/sparql**', {
    target: SPARQL_ENDPOINT,
    pathRewrite: {'/sparql' : ''},
    changeOrigin: true,
    secure: false,
  }));
}

app.use(createProxyMiddleware('/wikidata**', {
  target: WIKIDATA_ENDPOINT || SPARQL_ENDPOINT,
  pathRewrite: {'/wikidata' : ''},
  changeOrigin: true,
  secure: false,
}));

// eslint-disable-next-line no-console
console.log(`Running Webpack server at http://localhost:${SERVE_PORT}`);
const server = app.listen(SERVE_PORT, 'localhost');
