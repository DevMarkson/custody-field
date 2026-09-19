// The local queue.
//
// Everything the officer does at a scene is written here first and to here
// only. Nothing in the collection path waits on a network call, because at a
// scene there may be no network for hours. Sync is a separate, later,
// interruptible activity.

import * as SQLite from "expo-sqlite";

let dbPromise;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("custody.db");
      await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS items (
          local_id         TEXT PRIMARY KEY NOT NULL,
          reference        TEXT NOT NULL,
          case_ref         TEXT NOT NULL,
          description      TEXT NOT NULL,
          file_name        TEXT NOT NULL,
          file_uri         TEXT NOT NULL,
          file_size_bytes  INTEGER NOT NULL,
          mime_type        TEXT,
          root_hash        TEXT NOT NULL,
          chunk_size_bytes INTEGER NOT NULL,
          chunk_hashes     TEXT NOT NULL,
          collected_at     TEXT NOT NULL,
          collected_by     TEXT NOT NULL,
          lat              REAL,
          lng              REAL,
          sync_state       TEXT NOT NULL DEFAULT 'pending',
          sync_error       TEXT,
          server_id        TEXT,
          sealed_at        TEXT
        );

        CREATE TABLE IF NOT EXISTS events (
          local_id     TEXT PRIMARY KEY NOT NULL,
          item_local   TEXT NOT NULL,
          item_ref     TEXT NOT NULL,
          action       TEXT NOT NULL,
          actor_badge  TEXT NOT NULL,
          note         TEXT,
          device_time  TEXT NOT NULL,
          local_hash   TEXT,
          sync_state   TEXT NOT NULL DEFAULT 'pending',
          sync_error   TEXT
        );

        CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function setSetting(key, value) {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO cache (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)]
  );
}

export async function getSetting(key, fallback = null) {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT value FROM cache WHERE key = ?", [key]);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export async function insertSealedItem(item) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO items (local_id, reference, case_ref, description, file_name, file_uri,
       file_size_bytes, mime_type, root_hash, chunk_size_bytes, chunk_hashes,
       collected_at, collected_by, lat, lng, sync_state)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
    [item.localId, item.reference, item.caseRef, item.description, item.fileName, item.fileUri,
     item.fileSizeBytes, item.mimeType ?? null, item.rootHash, item.chunkSizeBytes,
     JSON.stringify(item.chunkHashes), item.collectedAt, item.collectedBy,
     item.lat ?? null, item.lng ?? null]
  );
}

export async function queueEvent(event) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO events (local_id, item_local, item_ref, action, actor_badge, note,
       device_time, local_hash, sync_state)
     VALUES (?,?,?,?,?,?,?,?,'pending')`,
    [event.localId, event.itemLocal, event.itemRef, event.action, event.actorBadge,
     event.note ?? null, event.deviceTime, event.localHash ?? null]
  );
}

export async function listItems() {
  const db = await getDb();
  return db.getAllAsync("SELECT * FROM items ORDER BY collected_at DESC");
}

export async function pendingCounts() {
  const db = await getDb();
  const i = await db.getFirstAsync("SELECT COUNT(*) AS n FROM items WHERE sync_state != 'synced'");
  const e = await db.getFirstAsync("SELECT COUNT(*) AS n FROM events WHERE sync_state != 'synced'");
  return { items: i?.n ?? 0, events: e?.n ?? 0, total: (i?.n ?? 0) + (e?.n ?? 0) };
}

export async function pendingPayload() {
  const db = await getDb();
  const items = await db.getAllAsync("SELECT * FROM items WHERE sync_state != 'synced'");
  const events = await db.getAllAsync("SELECT * FROM events WHERE sync_state != 'synced'");
  return { items, events };
}

export async function markItemSynced(localId, serverId, sealedAt) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE items SET sync_state='synced', server_id=?, sealed_at=?, sync_error=NULL WHERE local_id=?",
    [serverId ?? null, sealedAt ?? null, localId]
  );
}

export async function markItemFailed(localId, error) {
  const db = await getDb();
  await db.runAsync("UPDATE items SET sync_state='failed', sync_error=? WHERE local_id=?",
    [String(error).slice(0, 300), localId]);
}

export async function markEventsSynced(itemRefs) {
  if (itemRefs.length === 0) return;
  const db = await getDb();
  const marks = itemRefs.map(() => "?").join(",");
  await db.runAsync(
    `UPDATE events SET sync_state='synced', sync_error=NULL WHERE item_ref IN (${marks})`,
    itemRefs
  );
}

export async function markEventsFailed(itemRefs, error) {
  if (itemRefs.length === 0) return;
  const db = await getDb();
  const marks = itemRefs.map(() => "?").join(",");
  await db.runAsync(
    `UPDATE events SET sync_state='failed', sync_error=? WHERE item_ref IN (${marks})`,
    [String(error).slice(0, 300), ...itemRefs]
  );
}

/** Demo reset: clears the phone's local record only. */
export async function clearLocal() {
  const db = await getDb();
  await db.execAsync("DELETE FROM items; DELETE FROM events;");
}
