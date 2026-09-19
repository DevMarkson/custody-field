// On-device chunked hashing and the Merkle tree.
//
// This is the whole point of the field app. The fingerprint is taken here,
// at the scene, on the collecting officer's own phone, before the file goes
// anywhere else. Nothing between the scene and the server can alter the file
// without it being detectable.
//
// This file must produce byte-identical results to the server's hash.js.
// Two rules keep them in step:
//   1. a chunk hash is SHA-256 over the chunk's raw bytes
//   2. every other hash is SHA-256 over a UTF-8 STRING of hex digits
// Change either one on one side only and every fingerprint ever taken
// becomes unverifiable.
//
// SDK 57 note: expo-file-system's File.open() returns a FileHandle with a
// seekable `offset` and `readBytes(length)`, so we read 4MB at a time and
// never hold the whole file in memory. That is what makes the claim about a
// 100GB extraction on a cheap phone true rather than aspirational.

import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";

export const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB, same as the server
export const ZERO_HASH = "0".repeat(64);

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** SHA-256 over raw bytes. Used for chunk hashes only. */
export async function sha256Bytes(bytes) {
  return toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
}

/** SHA-256 over a UTF-8 string. Used for the tree and the chain. */
export async function sha256String(text) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/** Let the UI paint between chunks so the progress bar actually moves. */
const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Hash a file in fixed size chunks, seeking rather than loading.
 * onProgress receives { chunks, totalChunks, bytes, totalBytes }.
 */
export async function hashChunks(uri, { chunkSize = CHUNK_SIZE, onProgress } = {}) {
  const file = new File(uri);
  const totalBytes = file.size ?? 0;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / chunkSize));
  const handle = file.open();
  const hashes = [];

  try {
    let offset = 0;
    while (offset < totalBytes) {
      handle.offset = offset;
      const take = Math.min(chunkSize, totalBytes - offset);
      const bytes = handle.readBytes(take);
      hashes.push(await sha256Bytes(bytes));
      offset += take;
      if (onProgress) {
        onProgress({ chunks: hashes.length, totalChunks, bytes: offset, totalBytes });
      }
      await yieldToUi();
    }
    // An empty file still has one chunk hash, of nothing, so that an empty
    // file and a missing file are not the same thing.
    if (hashes.length === 0) hashes.push(await sha256Bytes(new Uint8Array(0)));
  } finally {
    handle.close();
  }

  return { chunkHashes: hashes, fileSizeBytes: totalBytes, chunkSizeBytes: chunkSize };
}

/**
 * Build a binary Merkle tree over the chunk hashes and return the root.
 * A node with no sibling is promoted unchanged to the next level.
 */
export async function merkleRoot(chunkHashes) {
  if (chunkHashes.length === 0) return sha256String("");
  let level = [...chunkHashes];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) next.push(await sha256String(level[i] + level[i + 1]));
      else next.push(level[i]); // odd node promoted
    }
    level = next;
  }
  return level[0];
}

/** Fingerprint a file: chunk hashes plus the Merkle root over them. */
export async function fingerprintFile(uri, options = {}) {
  const { chunkHashes, fileSizeBytes, chunkSizeBytes } = await hashChunks(uri, options);
  return {
    rootHash: await merkleRoot(chunkHashes),
    chunkHashes,
    fileSizeBytes,
    chunkSizeBytes,
  };
}

/** The short form shown on screen. A full hash on a phone is unreadable. */
export const shortHash = (hash) =>
  hash ? `${hash.slice(0, 8)} ${hash.slice(8, 16)}`.toUpperCase() : "";
