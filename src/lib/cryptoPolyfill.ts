/**
 * crypto.randomUUID polyfill.
 *
 * The Web Crypto API exposes crypto.randomUUID only in secure contexts
 * (HTTPS or localhost). The VPS frontend is served over plain HTTP at
 * http://185.248.33.125:3000/, so several browsers (notably Firefox /
 * Safari) leave crypto.randomUUID undefined and the app crashes with
 * "crypto.randomUUID is not a function" the first time anything that
 * generates an ID renders.
 *
 * This module installs a v4-UUID fallback that delegates to the real
 * implementation when available and falls back to crypto.getRandomValues
 * (which IS exposed over HTTP) when not. It must be imported at app
 * entry, before any code that calls crypto.randomUUID().
 */

declare global {
  interface Crypto {
    randomUUID(): `${string}-${string}-${string}-${string}-${string}`;
  }
}

function v4Fallback(): string {
  // RFC 4122 v4 UUID, generated from getRandomValues (when available) or
  // Math.random (last resort). Variant bits set in field 8 (index 8).
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Variant 10
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
  return (
    `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-` +
    `${hex[4]}${hex[5]}-` +
    `${hex[6]}${hex[7]}-` +
    `${hex[8]}${hex[9]}-` +
    `${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`
  );
}

if (typeof globalThis.crypto === 'undefined') {
  // Older runtimes — wire a minimal shim so the rest of the app can keep
  // using `crypto.randomUUID()`. We don't try to recreate getRandomValues.
  (globalThis as any).crypto = {};
}

if (typeof globalThis.crypto.randomUUID !== 'function') {
  globalThis.crypto.randomUUID = v4Fallback as Crypto['randomUUID'];
}

export {};
