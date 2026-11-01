import type { TransferRecord } from '@/contracts/transfer';

/** Device-local concurrency tokens and file availability are not shared content. */
export function recordPayload(row: TransferRecord): TransferRecord {
  const value = structuredClone(row);
  delete value.revision;
  delete value.updatedAt;
  delete value.save;
  delete value.documentKey;
  if (value.file && typeof value.file === 'object') delete (value.file as TransferRecord).availability;
  if (value.value && typeof value.value === 'object') {
    const body = value.value as TransferRecord;
    delete body.revision;
    if (String(value.key).startsWith('notes:v1:') && body.version && typeof body.version === 'object') {
      delete (body.version as TransferRecord).revision;
      delete (body.version as TransferRecord).updatedAt;
    }
  }
  // ZIP/WebDAV serialize JSON. An absent optional field and an in-memory
  // `undefined` field must compare identically after that round trip.
  return JSON.parse(JSON.stringify(value)) as TransferRecord;
}
