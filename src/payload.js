// Building the sync payload.
//
// Kept apart from api.js and from SQLite so that it is a pure function of the
// rows the device holds. That lets the backend's test suite import this exact
// module and assert that what the phone would send is what the server
// accepts, without an emulator in the loop. The shape of this object is a
// contract between two repositories, and contracts that are only checked by
// hand drift.

/**
 * @param deviceId  stable identifier for this handset
 * @param items     rows from the local `items` table
 * @param events    rows from the local `events` table
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
      // Deliberately null. The handset holds the file at a private file:// URI
      // and knows nothing about where the evidence store keeps things. The
      // fingerprint travels now; the exhibit is deposited separately and the
      // store path is recorded then. Sending a guess here would make an item
      // that was never deposited look like an item that was deleted.
      storagePath: i.storage_path ?? null,
    })),
    // Deliberately no eventHash. The device cannot know the server's item and
    // actor ids before the item exists there, so any hash it computed would be
    // over different inputs and would be rejected. The phone claims; the
    // server records.
    events: events.map((e) => ({
      itemRef: e.item_ref,
      actorRef: e.actor_badge,
      action: e.action,
      note: e.note,
      deviceTime: e.device_time,
    })),
  };
}
