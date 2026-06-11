/**
 * Magnus DB — Encryption Extension Unit Tests
 *
 * These tests verify the encryption logic WITHOUT requiring a database connection.
 * They test the pure encryption/decryption functions and format detection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptValue, decryptValue, isEncrypted } from '../encryptionExtension';

// Set a test encryption key for unit tests
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

test('encryptValue produces iv:authTag:cipher format', () => {
  const plaintext = 'test-secret-value';
  const encrypted = encryptValue(plaintext);

  const parts = encrypted.split(':');
  assert.equal(parts.length, 3, 'encrypted value should have 3 parts separated by colons');

  const [iv, authTag, cipher] = parts;
  assert.ok(iv && iv.length === 24, 'IV should be 24 hex chars (12 bytes)');
  assert.ok(authTag && authTag.length === 32, 'authTag should be 32 hex chars (16 bytes)');
  assert.ok(cipher && cipher.length > 0, 'cipher should not be empty');
});

test('decryptValue correctly decrypts encrypted values', () => {
  const plaintext = 'my-sensitive-plaid-token';
  const encrypted = encryptValue(plaintext);
  const decrypted = decryptValue(encrypted);

  assert.equal(decrypted, plaintext, 'decrypted value should match original plaintext');
});

test('decryptValue returns original if not encrypted format', () => {
  const plaintext = 'not-encrypted-value';
  const result = decryptValue(plaintext);

  assert.equal(result, plaintext, 'non-encrypted values should pass through unchanged');
});

test('isEncrypted detects encrypted format', () => {
  const encrypted = encryptValue('test');
  assert.equal(isEncrypted(encrypted), true, 'encrypted value should be detected');
});

test('isEncrypted rejects non-encrypted strings', () => {
  assert.equal(isEncrypted('plaintext'), false, 'plaintext should not match encrypted format');
  assert.equal(isEncrypted('foo:bar'), false, 'two-part string should not match');
  assert.equal(isEncrypted('foo:bar:baz'), false, 'non-hex parts should not match');
  assert.equal(isEncrypted(null), false, 'null should return false');
  assert.equal(isEncrypted(undefined), false, 'undefined should return false');
  assert.equal(isEncrypted(''), false, 'empty string should return false');
});

test('isEncrypted validates hex format in all parts', () => {
  // Valid format but with non-hex characters
  assert.equal(isEncrypted('gggggggggggggggggggggggg:hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh:iiii'), false);

  // Valid hex format
  const validEncrypted = encryptValue('test-value');
  assert.equal(isEncrypted(validEncrypted), true);
});

test('encryption produces unique ciphertext for same plaintext (random IV)', () => {
  const plaintext = 'same-value';
  const encrypted1 = encryptValue(plaintext);
  const encrypted2 = encryptValue(plaintext);

  assert.notEqual(encrypted1, encrypted2, 'same plaintext should produce different ciphertext due to random IV');

  // But both should decrypt to the same value
  assert.equal(decryptValue(encrypted1), plaintext);
  assert.equal(decryptValue(encrypted2), plaintext);
});
