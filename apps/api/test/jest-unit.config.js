/** @type {import('jest').Config} */
const path = require('path');

// __dirname = /Users/.../queuegate/apps/api/test
const projectRoot = path.resolve(__dirname, '../../..');

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: projectRoot,
  roots: ['<rootDir>/test/unit'],
  testRegex: 'test/unit/.*\\.test\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: path.join(projectRoot, 'test', 'tsconfig.test.json'),
      },
    ],
  },
  testEnvironment: 'node',
  testTimeout: 15000,
};
