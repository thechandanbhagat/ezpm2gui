/**
 * Utility for encrypting and decrypting sensitive data
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Simple encryption implementation with fixed key/iv for development
// In production, this should be replaced with proper key management
const ENCRYPTION_KEY = 'ezpm2gui-encryption-key-12345678901234';
const ENCRYPTION_IV = 'ezpm2gui-iv-1234'; 
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt a string
 * @param text The text to encrypt
 * @returns The encrypted text
 */
export function encrypt(text: string): string {
  if (!text) return '';
  
  try {
    // Ensure key and IV are the correct length
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').slice(0, 32);
    const iv = crypto.createHash('sha256').update(String(ENCRYPTION_IV)).digest('base64').slice(0, 16);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return '';
  }
}

/**
 * Decrypt an encrypted string
 * @param encryptedText The encrypted text
 * @returns The decrypted text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';

  try {
    // Ensure key and IV are the correct length
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').slice(0, 32);
    const iv = crypto.createHash('sha256').update(String(ENCRYPTION_IV)).digest('base64').slice(0, 16);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '';
  }
}
