const path = require('path');

/**
 * @type {import('webpack').Configuration}
 */
const mainConfig = {
  mode: 'none',
  entry: {
    'reactodia-workspace': './src/index',
    'worker-protocol': './src/worker-protocol',
    'default-layouts.worker': './src/default-layouts.worker',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      type: 'module',
    },
  },
  experiments: {
    outputModule: true,
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
    'd3-color',
    'file-saver',
    'n3',
    'react',
    'react-dom',
    'webcola',
  ],
};

/**
 * @type {import('webpack').Configuration}
 */
const workerConfig = {
  mode: 'none',
  target: 'webworker',
  entry: {
    'worker-protocol': './src/worker-protocol',
    'default-layouts.worker': './src/default-layouts.worker',
  },
  output: {
    ...mainConfig.output,
    chunkFormat: 'module',
  },
  experiments: mainConfig.experiments,
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
};

module.exports = [mainConfig, workerConfig];
