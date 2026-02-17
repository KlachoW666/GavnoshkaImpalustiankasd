import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt } from './encrypt';

describe('encrypt/decrypt', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('without ENCRYPTION_KEY (Base64 fallback)', () => {
    beforeEach(() => {
      delete process.env.ENCRYPTION_KEY;
    });

    it('should encode to base64 with b64: prefix', () => {
      const result = encrypt('hello world');
      expect(result).toMatch(/^b64:/);
    });

    it('should decode base64 back to original', () => {
      const encoded = encrypt('test-api-key-123');
      const decoded = decrypt(encoded);
      expect(decoded).toBe('test-api-key-123');
    });

    it('should handle empty string', () => {
      const encoded = encrypt('');
      const decoded = decrypt(encoded);
      expect(decoded).toBe('');
    });

    it('should handle special characters', () => {
      const original = 'key=abc&secret=xyz!@#$%^&*()';
      const encoded = encrypt(original);
      const decoded = decrypt(encoded);
      expect(decoded).toBe(original);
    });
  });

  describe('with ENCRYPTION_KEY (AES-256-GCM)', () => {
    beforeEach(() => {
      process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing';
    });

    it('should encrypt and decrypt correctly', () => {
      const original = 'my-secret-api-key';
      const encrypted = encrypt(original);
      // Should NOT have b64: prefix (real encryption)
      expect(encrypted).not.toMatch(/^b64:/);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const original = 'same-text';
      const enc1 = encrypt(original);
      const enc2 = encrypt(original);
      expect(enc1).not.toBe(enc2);
      // But both should decrypt to the same value
      expect(decrypt(enc1)).toBe(original);
      expect(decrypt(enc2)).toBe(original);
    });

    it('should return null for invalid ciphertext', () => {
      const result = decrypt('invalid-base64-data!!!');
      expect(result).toBeNull();
    });

    it('should return null for empty input', () => {
      const result = decrypt('');
      expect(result).toBeNull();
    });
  });
});
