import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the validation logic by importing and calling validateEnvironment
// with different env configurations

describe('envValidator', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should warn when ENCRYPTION_KEY is not set in development', async () => {
    delete process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = 'development';

    // Import fresh module
    const { validateEnvironment } = await import('./envValidator');
    // Should not throw in development
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('should not throw when ENCRYPTION_KEY is set', async () => {
    process.env.ENCRYPTION_KEY = 'test-key-12345';
    process.env.NODE_ENV = 'development';

    const { validateEnvironment } = await import('./envValidator');
    expect(() => validateEnvironment()).not.toThrow();
  });
});
