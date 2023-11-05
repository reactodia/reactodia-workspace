const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const SPARQL_ENDPOINT = process.env.SPARQL_ENDPOINT;
const WIKIDATA_ENDPOINT = process.env.WIKIDATA_ENDPOINT
  ?? 'https://query.wikidata.org/sparql';

const EXAMPLES = [
  'rdf',
  'sparql',
  'styleCustomization',
  'turtleGraph',
  'wikidata'
];

/**
 * @type {import('webpack').Configuration}
 */
module.exports = {
  mode: 'development',
  entry: Object.fromEntries(EXAMPLES.map(key =>
    [key, path.join(__dirname, 'examples', key)]
  )),
  output: {
    path: path.join(__dirname, 'dist/examples'),
    filename: '[name].bundle.js',
    chunkFilename: '[id].chunk.js',
    publicPath: '',
    clean: true,
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
    ...EXAMPLES.map(key =>
      new HtmlWebpackPlugin({
        filename: `${key}.html`,
        title: `Reactodia Workspace: ${key}`,
        chunks: ['commons', key],
        template: path.join(__dirname, 'examples/resources/template.ejs'),
        templateParameters: {
          EXAMPLES,
        }
      })
    )
  ],
  devServer: {
    compress: true,
    port: 10555,
    client: {
      overlay: false,
    },
    proxy: {
      '/sparql**': {
          target: SPARQL_ENDPOINT,
          pathRewrite: {'/sparql' : ''},
          changeOrigin: true,
          secure: false,
      },
      '/wikidata**': {
          target: WIKIDATA_ENDPOINT || SPARQL_ENDPOINT,
          pathRewrite: {'/wikidata' : ''},
          changeOrigin: true,
          secure: false,
      }
    },
  }
};
