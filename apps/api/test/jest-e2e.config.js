/** @type {import('jest').Config} */
const path = require('path');

// __dirname = /Users/.../queuegate/apps/api/test
const projectRoot = path.resolve(__dirname, '../../..');
const apiNodeModules = path.join(projectRoot, 'apps', 'api', 'node_modules');
// pnpm virtual store at the workspace root
const pnpmStore = path.join(projectRoot, 'node_modules', '.pnpm');
// socket.io-client is installed for the web app, reachable via pnpm virtual store
const socketIoClientCjs = path.join(
  pnpmStore,
  'socket.io-client@4.8.3',
  'node_modules',
  'socket.io-client',
  'build',
  'cjs',
  'index.js',
);

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: projectRoot,
  roots: ['<rootDir>/test/integration'],
  testRegex: 'test/integration/.*\\.e2e\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: path.join(projectRoot, 'test', 'tsconfig.test.json'),
        diagnostics: false, // skip TS errors from socket.io-client type resolution
      },
    ],
  },
  testEnvironment: 'node',
  testTimeout: 60000,
  modulePaths: [apiNodeModules],
  moduleNameMapper: {
    '^socket\\.io-client$': socketIoClientCjs,
  },
};
