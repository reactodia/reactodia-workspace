const path = require('path');

/**
 * @type {import('webpack').Configuration}
 */
const mainConfig = {
  mode: 'none',
  entry: {
    'workspace': './src/workspace',
    'layout-sync': './src/layout-sync',
    'legacy-styles': './src/legacy-styles',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      type: 'module',
    },
    chunkLoading: false,
  },
  experiments: {
    outputModule: true,
  },
  optimization: {},
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
        type: 'asset/inline',
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
    ]
  },
  externals: [
    '@reactodia/hashmap',
    '@reactodia/worker-proxy',
    '@reactodia/worker-proxy/protocol',
    'clsx',
    'd3-color',
    'file-saver',
    'n3',
    'react',
    'react/jsx-runtime',
    'react-dom',
    'webcola',
  ],
  devtool: 'source-map',
};

/**
 * @type {import('webpack').Configuration}
 */
const workerConfig = {
  mode: 'none',
  target: 'webworker',
  entry: {
    'layout.worker': './src/layout.worker',
  },
  output: {
    ...mainConfig.output,
    chunkFormat: 'module',
  },
  experiments: mainConfig.experiments,
  optimization: mainConfig.optimization,
  resolve: {
    extensions: mainConfig.resolve.extensions,
  },
  module: {
    rules: [
      {
        test: /\.([cm]?ts|tsx)$/,
        loader: 'ts-loader',
      }
    ],
  },
  externals: mainConfig.externals,
  devtool: mainConfig.devtool,
};

module.exports = [mainConfig, workerConfig];
