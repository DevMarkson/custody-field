// The custody chain, device side.
//
// The device computes an event hash so it can show a sealed state offline
// and so the server has something to check it against. The server recomputes
// every hash on arrival and rejects the batch if ours disagrees. Ours is a
// claim; the server's is the record.

import { sha256String, ZERO_HASH } from "./hash.js";

export { ZERO_HASH };

export function eventHash({ prevHash, itemId, actorId, action, deviceTime, fileHash }) {
  return sha256String(
    [prevHash, itemId, actorId, action, new Date(deviceTime).toISOString(), fileHash ?? ""].join("|")
  );
}
