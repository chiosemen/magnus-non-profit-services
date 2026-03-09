import { config } from 'dotenv';
import { join } from 'path';

// Load .env from project root (../../ from packages/db)
config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import test from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt, encryptNullable, decryptNullable } from '../encryption';
import { isEncrypted } from '../encryptionExtension';

test('isEncrypted detects encrypted format', () => {
  const plaintext = 'secret-value';
  const encrypted = encrypt(plaintext);

  assert.equal(isEncrypted(encrypted), true, 'should detect encrypted string');
  assert.equal(isEncrypted(plaintext), false, 'should not detect plaintext');
  assert.equal(isEncrypted(null), false, 'should handle null');
  assert.equal(isEncrypted(''), false, 'should handle empty string');
});

test('isEncrypted validates format structure', () => {
  // Valid format
  assert.equal(isEncrypted('abcd1234:ef567890:1234567890'), true);

  // Invalid formats
  assert.equal(isEncrypted('onlyonepart'), false);
  assert.equal(isEncrypted('two:parts'), false);
  assert.equal(isEncrypted('notHex:123:456'), false);
  assert.equal(isEncrypted('123:456:'), false);
  assert.equal(isEncrypted(':123:456'), false);
});

test('encryptNullable handles null values', () => {
  assert.equal(encryptNullable(null), null);

  const encrypted = encryptNullable('test');
  assert.notEqual(encrypted, null);
  assert.equal(isEncrypted(encrypted!), true);
});

test('decryptNullable handles null values', () => {
  assert.equal(decryptNullable(null), null);

  const plaintext = 'test-value';
  const encrypted = encrypt(plaintext);
  const decrypted = decryptNullable(encrypted);

  assert.equal(decrypted, plaintext);
});

test('round-trip encryption maintains data integrity', () => {
  const testValues = [
    'simple-string',
    'with spaces and special!@#$%',
    '123456789',
    'unicode-🎉-emoji',
    'SSN: 123-45-6789',
    'access-sandbox-token-1234567890',
  ];

  for (const value of testValues) {
    const encrypted = encrypt(value);
    assert.equal(isEncrypted(encrypted), true, `should detect as encrypted: ${value}`);

    const decrypted = decrypt(encrypted);
    assert.equal(decrypted, value, `should preserve: ${value}`);
  }
});

test('encrypted values are different each time (random IV)', () => {
  const plaintext = 'test-value';

  const encrypted1 = encrypt(plaintext);
  const encrypted2 = encrypt(plaintext);

  // Different IVs mean different ciphertexts
  assert.notEqual(encrypted1, encrypted2, 'encrypted values should differ due to random IV');

  // But both decrypt to same value
  assert.equal(decrypt(encrypted1), plaintext);
  assert.equal(decrypt(encrypted2), plaintext);
});

test('isEncrypted rejects invalid formats', () => {
  // Too few parts
  assert.equal(isEncrypted('abc'), false);
  assert.equal(isEncrypted('abc:def'), false);

  // Too many parts
  assert.equal(isEncrypted('abc:def:ghi:jkl'), false);

  // Non-hex characters
  assert.equal(isEncrypted('xyz123:abc456:def789'), false);
  assert.equal(isEncrypted('abc-def:123-456:789-012'), false);

  // Empty parts
  assert.equal(isEncrypted('::'), false);
  assert.equal(isEncrypted('abc::def'), false);
});
