import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";

export const CHUNK_SIZE = 4 * 1024 * 1024;
export const ZERO_HASH = "0".repeat(64);

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export async function sha256Bytes(bytes) {
  return toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
}

export async function sha256String(text) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    if (hashes.length === 0) hashes.push(await sha256Bytes(new Uint8Array(0)));
  } finally {
    handle.close();
  }

  return { chunkHashes: hashes, fileSizeBytes: totalBytes, chunkSizeBytes: chunkSize };
}

export async function merkleRoot(chunkHashes) {
  if (chunkHashes.length === 0) return sha256String("");
  let level = [...chunkHashes];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) next.push(await sha256String(level[i] + level[i + 1]));
      else next.push(level[i]);
    }
    level = next;
  }
  return level[0];
}

export async function fingerprintFile(uri, options = {}) {
  const { chunkHashes, fileSizeBytes, chunkSizeBytes } = await hashChunks(uri, options);
  return {
    rootHash: await merkleRoot(chunkHashes),
    chunkHashes,
    fileSizeBytes,
    chunkSizeBytes,
  };
}

export const shortHash = (hash) =>
  hash ? `${hash.slice(0, 8)} ${hash.slice(8, 16)}`.toUpperCase() : "";
