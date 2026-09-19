// The sync client.
//
// Sync is deferred, batched and interruptible. It never blocks collection.
// Note what is NOT uploaded: the evidence file itself. Only the fingerprint
// and the metadata travel. That avoids request size limits entirely and is
// closer to how real evidence handling works, where the exhibit goes to the
// store and the paperwork goes to the registry.

import {
  pendingPayload, markItemSynced, markItemFailed,
  markEventsSynced, markEventsFailed,
} from "./db.js";
import { buildSyncPayload } from "./payload.js";

const TIMEOUT_MS = 12000;

async function request(base, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkServer(base) {
  const health = await request(base, "/api/health");
  return health?.ok === true;
}

export async function fetchActors(base) {
  return request(base, "/api/actors");
}

export async function fetchCases(base) {
  return request(base, "/api/cases");
}

/**
 * Push everything queued on this device.
 *
 * The device deliberately does NOT send its own event hashes. It cannot know
 * the server's item and actor ids until the item exists there, so any hash it
 * computed would be over different inputs and would be rejected. The device's
 * local hash is for showing a sealed state offline; the server's is the
 * record. This is the honest division: the phone claims, the server records.
 */
export async function sync(base) {
  const { items, events } = await pendingPayload();
  if (items.length === 0 && events.length === 0) {
    return { skipped: true, sealed: 0, appended: 0 };
  }

  const payload = buildSyncPayload("field-phone-07", items, events);

  let result;
  try {
    result = await request(base, "/api/custody/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // The whole batch failed: no network, or the server rejected it. Mark
    // everything failed and leave it queued. Nothing is lost.
    await markItemFailed(items[0]?.local_id ?? "", err.message);
    for (const i of items) await markItemFailed(i.local_id, err.message);
    await markEventsFailed(events.map((e) => e.item_ref), err.message);
    throw err;
  }

  const sealedByRef = new Map((result.sealed ?? []).map((s) => [s.reference, s]));
  const rejectedRefs = new Set((result.rejected ?? []).map((r) => r.reference).filter(Boolean));

  for (const i of items) {
    const sealed = sealedByRef.get(i.reference);
    if (sealed) await markItemSynced(i.local_id, sealed.itemId, sealed.sealedAt);
    else if (rejectedRefs.has(i.reference)) {
      const why = result.rejected.find((r) => r.reference === i.reference)?.error ?? "rejected";
      await markItemFailed(i.local_id, why);
    }
  }

  const appendedRefs = items
    .filter((i) => sealedByRef.has(i.reference))
    .map((i) => i.reference);
  await markEventsSynced(appendedRefs);

  return {
    sealed: result.sealed?.length ?? 0,
    appended: result.appended?.length ?? 0,
    rejected: result.rejected?.length ?? 0,
    syncedAt: result.syncedAt,
  };
}
