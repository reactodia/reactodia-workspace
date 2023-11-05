const path = require('path');

/**
 * @type {import('webpack').Configuration}
 */
module.exports = {
  mode: 'none',
  entry: './src/index',
  output: {
    filename: 'reactodia-workspace.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      type: 'module',
    }
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
