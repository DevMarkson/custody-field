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
      chunkHashes: typeof i.chunk_hashes === "string" ? JSON.parse(i.chunk_hashes) : i.chunk_hashes,
      collectedAt: i.collected_at,
      collectedBy: i.collected_by,
      collectionLat: i.lat,
      collectionLng: i.lng,
      collectionNote: i.collection_note ?? (i.duration_ms ? `Audio duration: ${Math.round(i.duration_ms / 1000)}s` : null),
      storagePath: i.storage_path ?? null,
    })),
    events: events.map((e) => ({
      itemRef: e.item_ref,
      actorRef: e.actor_badge,
      action: e.action,
      note: e.note,
      deviceTime: e.device_time,
    })),
  };
}
