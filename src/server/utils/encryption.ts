/**
 * Utility for encrypting and decrypting sensitive data
 */
import crypto from 'crypto';

// @group Configuration : Encryption secret
// Prefer an operator-supplied secret via the EZPM2GUI_SECRET env var. When it is
// not set we fall back to legacy constants so existing installs can still decrypt
// previously stored data — but a warning is emitted so deployments exposed over
// LAN/tunnel are nudged to configure a real secret.
const LEGACY_KEY = 'ezpm2gui-encryption-key-12345678901234';
const LEGACY_IV = 'ezpm2gui-iv-1234';

const SECRET = process.env.EZPM2GUI_SECRET;
if (!SECRET) {
  console.warn(
    '[security] EZPM2GUI_SECRET is not set — using built-in default encryption key. ' +
    'Set EZPM2GUI_SECRET to protect stored remote-server credentials.'
  );
}

const ENCRYPTION_KEY = SECRET || LEGACY_KEY;
const ENCRYPTION_IV = SECRET ? `${SECRET}-iv` : LEGACY_IV;
const ALGORITHM = 'aes-256-cbc';

// @group Utilities : Derive the 32-byte AES key from the configured secret.
// NOTE: the key is sliced from a base64 string (rather than raw digest bytes)
// for backward compatibility — changing this would make data encrypted by
// older versions undecryptable.
function deriveKey(): string {
  return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').slice(0, 32);
}

// @group Utilities : Static IV used only to read data written by older versions.
function deriveLegacyIV(): string {
  return crypto.createHash('sha256').update(String(ENCRYPTION_IV)).digest('base64').slice(0, 16);
}

/**
 * Encrypt a string. A fresh random IV is generated per call and prepended to
 * the ciphertext ("ivHex:cipherHex") so identical plaintexts no longer produce
 * identical ciphertexts.
 * @param text The text to encrypt
 * @returns The encrypted text
 */
export function encrypt(text: string): string {
  if (!text) return '';

  try {
    const key = deriveKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return '';
  }
}

/**
 * Decrypt an encrypted string. Handles both the current format ("ivHex:cipher")
 * and the legacy format (ciphertext only, encrypted with the static IV).
 * @param encryptedText The encrypted text
 * @returns The decrypted text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';

  try {
    const key = deriveKey();

    let iv: Buffer | string;
    let ciphertext: string;
    const sep = encryptedText.indexOf(':');
    if (sep !== -1) {
      // Current format — IV travels with the ciphertext
      iv = Buffer.from(encryptedText.slice(0, sep), 'hex');
      ciphertext = encryptedText.slice(sep + 1);
    } else {
      // Legacy format — decrypt with the old static IV
      iv = deriveLegacyIV();
      ciphertext = encryptedText;
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '';
  }
}

// ---------------------------------------------------------------------------
// RSA-OAEP key pair for in-transit encryption
// A fresh key pair is generated once per server process and kept in memory.
// The public key is shared with clients so they can encrypt sensitive fields
// before sending them over the network. The private key never leaves the server.
// ---------------------------------------------------------------------------

let _rsaPrivateKey: crypto.KeyObject | null = null;
let _rsaPublicKeyPem: string | null = null;

function getOrCreateRSAKeyPair(): { publicKeyPem: string; privateKey: crypto.KeyObject } {
  if (!_rsaPrivateKey || !_rsaPublicKeyPem) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    _rsaPrivateKey = privateKey;
    _rsaPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  }
  return { publicKeyPem: _rsaPublicKeyPem, privateKey: _rsaPrivateKey };
}

/**
 * Returns the server's RSA public key in PEM (SPKI) format.
 * Expose this via a GET endpoint so clients can encrypt before sending.
 */
export function getRSAPublicKey(): string {
  return getOrCreateRSAKeyPair().publicKeyPem;
}

/**
 * Hybrid-encrypted payload sent by the client.
 * - encryptedKey : RSA-OAEP encrypted 256-bit AES key (base64)
 * - iv           : 12-byte AES-GCM IV (base64)
 * - data         : AES-256-GCM ciphertext + 16-byte auth-tag (base64)
 */
export interface EncryptedPayload {
  encryptedKey: string;
  iv: string;
  data: string;
}

/**
 * Decrypts a hybrid-encrypted payload produced by the client.
 * 1. Unwraps the AES key with RSA-OAEP (SHA-256)
 * 2. Decrypts the data with AES-256-GCM
 */
export function decryptTransitPayload(payload: EncryptedPayload): string {
  const { privateKey } = getOrCreateRSAKeyPair();

  // Step 1 — decrypt the AES-256 key with RSA-OAEP / SHA-256
  const encryptedAesKey = Buffer.from(payload.encryptedKey, 'base64');
  const aesKey = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedAesKey
  );

  // Step 2 — decrypt data with AES-256-GCM
  // WebCrypto appends the 16-byte auth tag at the end of the ciphertext buffer
  const iv = Buffer.from(payload.iv, 'base64');
  const encryptedBuf = Buffer.from(payload.data, 'base64');
  const authTag = encryptedBuf.slice(encryptedBuf.length - 16);
  const ciphertext = encryptedBuf.slice(0, encryptedBuf.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
