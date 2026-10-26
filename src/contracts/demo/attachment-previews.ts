import type { AttachmentPreviewService } from '../conversation';
import { failure, success } from '../common';
import { demoId } from './store';
/** Only explicitly supplied image data URLs; never fetch an external thumbnail. */
export function createDemoAttachmentPreviews(images: Readonly<Record<string, string>>) {
  const sources = { ...images };
  const leases = new Set<string>();
  const service: AttachmentPreviewService = {
    async acquire(assetId) {
      const url = sources[assetId];
      if (!url) return failure('FILE_MISSING', '演示附件未提供缩略图', ['choose-file']);
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(url)) return failure('INVALID_INPUT', '演示缩略图必须是本地图片 data URL');
      const leaseId = demoId(); leases.add(leaseId); return success({ leaseId, url });
    },
    release(leaseId) { leases.delete(leaseId); },
  };
  return { service, controls: { activeLeases: () => leases.size } };
}
