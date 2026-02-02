/**
 * E2EE Encryption support for Push CLI.
 *
 * Decrypts end-to-end encrypted todo fields using
 * the Swift keychain helper binary.
 */

import { execFileSync } from 'child_process';
import { createDecipheriv } from 'crypto';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HELPER_PATH = join(__dirname, '../bin/push-keychain-helper');

// Cached encryption key
let cachedKey = null;
let keyCheckDone = false;
let keyAvailable = false;

/**
 * Check if the keychain helper binary exists.
 *
 * @returns {boolean}
 */
function helperExists() {
  return existsSync(HELPER_PATH);
}

/**
 * Get the encryption key from the macOS Keychain.
 *
 * @returns {Buffer|null} The 32-byte encryption key or null
 */
export function getEncryptionKey() {
  if (cachedKey !== null) {
    return cachedKey;
  }

  if (!helperExists()) {
    return null;
  }

  try {
    const result = execFileSync(HELPER_PATH, [], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const keyBase64 = result.trim();
    if (!keyBase64) {
      return null;
    }

    cachedKey = Buffer.from(keyBase64, 'base64');
    return cachedKey;
  } catch (error) {
    // Exit codes:
    // 1 = Key not found in Keychain
    // 2 = iCloud Keychain not available
    // Other = Unexpected error
    return null;
  }
}

/**
 * Decrypt an AES-256-GCM encrypted value.
 *
 * Format: version (1 byte) + nonce (12 bytes) + ciphertext + tag (16 bytes)
 *
 * @param {Buffer} ciphertext - The encrypted data
 * @returns {string} Decrypted plaintext
 */
export function decrypt(ciphertext) {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('Encryption key not available');
  }

  // Check version byte
  const version = ciphertext[0];
  if (version !== 0) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  // Extract components
  const nonce = ciphertext.slice(1, 13);        // 12 bytes
  const encrypted = ciphertext.slice(13, -16);  // Ciphertext without tag
  const authTag = ciphertext.slice(-16);        // Last 16 bytes

  // Decrypt
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Decrypt a potentially encrypted todo field.
 *
 * Returns the original value if:
 * - The value is null/undefined
 * - The value is too short to be encrypted
 * - Decryption fails (returns original)
 *
 * @param {string} value - The field value (possibly base64 encoded ciphertext)
 * @returns {string} Decrypted value or original
 */
export function decryptTodoField(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  // Encrypted values are base64 and at least 40+ chars
  // (version + nonce + min ciphertext + tag)
  if (value.length < 40) {
    return value;
  }

  // Quick check: if it doesn't look like base64, skip
  if (!/^[A-Za-z0-9+/]+=*$/.test(value)) {
    return value;
  }

  try {
    const decoded = Buffer.from(value, 'base64');

    // Check if it starts with version byte 0
    if (decoded.length < 30 || decoded[0] !== 0) {
      return value;
    }

    return decrypt(decoded);
  } catch {
    // Decryption failed - return original value
    return value;
  }
}

/**
 * Check if E2EE is available on this machine.
 *
 * @returns {[boolean, string]} Tuple of [available, message]
 */
export function isE2EEAvailable() {
  if (keyCheckDone) {
    return [keyAvailable, keyAvailable ? 'E2EE available' : 'E2EE not available'];
  }

  // Check platform
  if (process.platform !== 'darwin') {
    keyCheckDone = true;
    keyAvailable = false;
    return [false, 'E2EE requires macOS'];
  }

  // Check helper binary
  if (!helperExists()) {
    keyCheckDone = true;
    keyAvailable = false;
    return [false, 'Keychain helper not installed'];
  }

  // Try to get the key
  try {
    const key = getEncryptionKey();
    keyCheckDone = true;
    keyAvailable = key !== null;

    if (keyAvailable) {
      return [true, 'E2EE available'];
    } else {
      return [false, 'Encryption key not in Keychain'];
    }
  } catch (error) {
    keyCheckDone = true;
    keyAvailable = false;
    return [false, `E2EE check failed: ${error.message}`];
  }
}

/**
 * Clear the cached encryption key.
 * Useful for testing or when the key might have changed.
 */
export function clearKeyCache() {
  cachedKey = null;
  keyCheckDone = false;
  keyAvailable = false;
}

export { HELPER_PATH };
