# Custody: field app

Collection at the scene. React Native, Expo SDK 57. Part of **Custody**, ICSC 2026 Track H;
the backend and the full project README are in `hackathonBackend`.

All data used in the demonstration is synthetic.

## Why this app exists

The brief asks us to think about power and network cuts. This is where that is answered by
architecture rather than by a paragraph. At a scene the officer taps once, the file is
fingerprinted **on this device**, and the record is written to local storage. No network call
is anywhere on that path. Sync is a separate, later, interruptible activity.

That ordering is the whole claim: the fingerprint exists before the file has been anywhere,
so nothing between the scene and the server can alter it undetectably.

## Running

```bash
npm install
npx expo start
```

Then open it on a device or simulator. Tap **Setup** and set:

- **Server address** — the laptop's address on the local network, as the API prints on
  startup, e.g. `http://172.20.10.6:4000`. Never `localhost`: on a phone, localhost is the
  phone.
- **Officer badge** — e.g. `NPF-22841`
- **Case reference** — e.g. `CID-2026-0041`

## How it works

| Concern | Approach |
|---|---|
| Hashing | `expo-file-system` `File.open()` gives a seekable handle, so 4MB chunks are read with `handle.offset` and `readBytes()` and the whole file is never in memory |
| Digest | `expo-crypto` `Crypto.digest()` over raw bytes for chunk hashes, `digestStringAsync` over hex strings for the Merkle tree and the chain |
| Queue | `expo-sqlite`, written before anything else happens |
| Location | `expo-location`, optional, and never allowed to block sealing |
| Sync | batched, retried, and automatic once the server becomes reachable |

Each item shows exactly one of **Sealed, not synced**, **Synced**, or **Sync failed**, and the
header carries a count of everything still pending.

### Parity with the server

The device and the server must produce identical fingerprints or nothing verifies. Two rules
keep them in step, and both are asserted by `hackathonBackend/test/device-parity.test.mjs`:

1. a chunk hash is SHA-256 over the chunk's **raw bytes**
2. every other hash is SHA-256 over a UTF-8 **string of hex digits**

### The device does not sign its own events

It computes a provisional event hash so it can show a sealed state while offline, but it does
not send it. A device cannot know the server's item and actor ids before the item exists
there, so any hash it computed would be over different inputs. The server recomputes every
hash on arrival. The phone claims; the server records.
