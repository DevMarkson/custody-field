// Device side event hashing.
//
// Computed so a sealed state can be shown offline. The server recomputes every
// hash on arrival and its result is the record.

import { sha256String, ZERO_HASH } from "./hash.js";

export { ZERO_HASH };

export function eventHash({ prevHash, itemId, actorId, action, deviceTime, fileHash }) {
  return sha256String(
    [prevHash, itemId, actorId, action, new Date(deviceTime).toISOString(), fileHash ?? ""].join("|")
  );
}
