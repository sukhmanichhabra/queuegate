import { getSecret, getSecretRequired } from './secrets';

describe('Secrets Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getSecret', () => {
    it('should return the environment variable if it exists', () => {
      process.env.TEST_SECRET = 'my-secret-value';
      expect(getSecret('TEST_SECRET')).toBe('my-secret-value');
    });

    it('should return undefined if the environment variable does not exist and no default is provided', () => {
      delete process.env.TEST_SECRET;
      expect(getSecret('TEST_SECRET')).toBeUndefined();
    });

    it('should return the default value if the environment variable does not exist', () => {
      delete process.env.TEST_SECRET;
      expect(getSecret('TEST_SECRET', 'default-value')).toBe('default-value');
    });

    it('should NOT return the default value if the environment variable exists', () => {
      process.env.TEST_SECRET = 'actual-value';
      expect(getSecret('TEST_SECRET', 'default-value')).toBe('actual-value');
    });
  });

  describe('getSecretRequired', () => {
    it('should return the environment variable if it exists', () => {
      process.env.TEST_SECRET = 'my-secret-value';
      expect(getSecretRequired('TEST_SECRET')).toBe('my-secret-value');
    });

    it('should throw an error if the environment variable does not exist', () => {
      delete process.env.TEST_SECRET;
      expect(() => getSecretRequired('TEST_SECRET')).toThrow('Required secret "TEST_SECRET" is not set.');
    });
  });
});
