// Builds the sync payload from local rows.
//
// Kept free of SQLite and fetch so the backend's test suite can import this
// module directly and assert the payload against the live API.

/**
 * @param deviceId stable identifier for this handset
 * @param items    rows from the local items table
 * @param events   rows from the local events table
 */
export function buildSyncPayload(deviceId, items, events) {
  return {
    deviceId,
    items: items.map((i) => ({
      caseRef: i.case_ref,
      reference: i.reference,
      description: i.description,
      fileName: i.file_name,
      fileSizeBytes: i.file_size_bytes,
      mimeType: i.mime_type,
      rootHash: i.root_hash,
      chunkSizeBytes: i.chunk_size_bytes,
      // stored as JSON text in SQLite, sent as a real array
      chunkHashes: typeof i.chunk_hashes === "string" ? JSON.parse(i.chunk_hashes) : i.chunk_hashes,
      collectedAt: i.collected_at,
      collectedBy: i.collected_by,
      collectionLat: i.lat,
      collectionLng: i.lng,
      collectionNote: i.collection_note ?? null,
      // Null: the handset holds the file at a private URI and knows nothing of
      // the evidence store's layout. The path is recorded on deposit. A guess
      // here would make an undeposited item look like a deleted one.
      storagePath: i.storage_path ?? null,
    })),
    // No eventHash: the device cannot know the server's item and actor ids
    // before the item exists there.
    events: events.map((e) => ({
      itemRef: e.item_ref,
      actorRef: e.actor_badge,
      action: e.action,
      note: e.note,
      deviceTime: e.device_time,
    })),
  };
}
