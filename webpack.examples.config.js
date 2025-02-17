const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

/**
 * @param {Record<string, string>} env 
 * @param {string[]} argv
 * @returns {import('webpack').Configuration[]}
 */
module.exports = (env, argv) => {
  const IS_DEV_SERVER = Boolean(process.env.WEBPACK_SERVE);

  const WIKIDATA_ENDPOINT = env.WIKIDATA_ENDPOINT
    ?? 'https://query.wikidata.org/sparql';

  const EXAMPLES = [
    'index',
    'basic',
    'design',
    'i18n',
    'rdf',
    'rdfClassic',
    'sparql',
    'stressTest',
    'styleCustomization',
    'wikidata'
  ];

  /**
   * @type {import('webpack').Configuration}
   */
  const mainConfig = {
    mode: 'development',
    entry: {
      ...Object.fromEntries(EXAMPLES.map(key =>
        [key, path.join(__dirname, 'examples', key)]
      )),
    },
    output: {
      path: path.join(__dirname, 'dist/examples'),
      filename: (pathData) => {
        if (pathData.chunk.name.endsWith('.worker')) {
          return '[name].js';
        }
        return '[name].[contenthash].bundle.js';
      },
      chunkFilename: '[id].[contenthash].chunk.js',
      publicPath: '',
    },
    optimization: {
      splitChunks: {
        cacheGroups: {
          commons: {
            name: 'commons',
            chunks: 'initial',
            minChunks: 2,
          }
        }
      },
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
      alias: {
        '@images': path.resolve(__dirname, 'images'),
        '@codicons': '@vscode/codicons/src/icons/',
      },
    },
    module: {
      rules: [
        {
          test: /\.(png|svg)$/,
          type: 'asset/resource',
          generator: {
            filename: 'assets/icon-[hash][ext]',
          }
        },
        {
          test: /\.([cm]?ts|tsx)$/,
          loader: 'ts-loader',
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.scss$/,
          use: ['style-loader', 'css-loader', 'sass-loader'],
        },
        {
          test: /\.ttl$/,
          type: 'asset/source',
        },
      ]
    },
    plugins: [
      new webpack.DefinePlugin({
        'WIKIDATA_ENDPOINT': IS_DEV_SERVER ? 'undefined' : `'${WIKIDATA_ENDPOINT}'`,
      }),
      ...EXAMPLES.map(key =>
        new HtmlWebpackPlugin({
          filename: `${key}.html`,
          title: `Reactodia Workspace: ${key}`,
          chunks: ['commons', key],
          template: path.join(__dirname, 'examples/resources/template.ejs'),
          templateParameters: {
            EXAMPLES: EXAMPLES.filter(key => key !== 'index'),
          }
        })
      )
    ],
  };

  /**
   * @type {import('webpack').Configuration}
   */
  const workerConfig = {
    mode: 'development',
    target: 'webworker',
    entry: {
      'layout.worker': path.join(__dirname, 'src', 'layout.worker'),
    },
    output: {
      path: path.join(__dirname, 'dist/examples'),
      filename: '[name].js',
      publicPath: '',
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.([cm]?ts|tsx)$/,
          loader: 'ts-loader',
        }
      ]
    },
  };

  return [workerConfig, mainConfig];
};
