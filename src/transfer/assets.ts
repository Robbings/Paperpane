import type { TransferAsset } from '@/contracts/transfer';

export function imageReferences(value: unknown): Set<string> {
  const hashes = new Set<string>();
  function visit(v: unknown) {
    if (typeof v === 'string') {
      for (const match of v.matchAll(/paperpane-asset:([a-f0-9]{64})/g)) hashes.add(match[1]!);
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  }
  visit(value);
  return hashes;
}

export const assetMime = (asset: Pick<TransferAsset, 'mimeType'>) => asset.mimeType ?? 'application/pdf';
export const assetPath = (asset: Pick<TransferAsset, 'mimeType' | 'sha256'>) =>
  `assets/${asset.sha256}.${assetMime(asset) === 'image/png' ? 'png' : 'pdf'}`;
