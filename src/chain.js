import { sha256String, ZERO_HASH } from "./hash.js";

export { ZERO_HASH };

export function eventHash({ prevHash, itemId, actorId, action, deviceTime, fileHash }) {
  return sha256String(
    [prevHash, itemId, actorId, action, new Date(deviceTime).toISOString(), fileHash ?? ""].join("|")
  );
}
