import { joaat } from '../modules/hash.js';

export function makeSyntheticRPF6({ encryptedFlag = 0, sizeField = 0xa0000004 } = {}) {
  const entryCount = 2;
  const headerSize = 16;
  const tocEntrySize = 20;
  const tocSize = 48;
  const payloadOffset = headerSize + tocSize;
  const totalSize = payloadOffset + 4;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52504636, false);
  view.setUint32(4, entryCount, false);
  view.setUint32(8, 0, false);
  view.setInt32(12, encryptedFlag, false);

  // Root directory: child range [1, 2)
  view.setUint32(16, 0, false);
  view.setUint32(20, 0, false);
  view.setUint32(24, 0x80000001, false);
  view.setUint32(28, 1, false);
  view.setUint32(32, 0, false);

  // File entry.
  const fileOffset = headerSize + tocEntrySize;
  view.setUint32(fileOffset, joaat('sample.bin'), false);
  view.setUint32(fileOffset + 4, sizeField, false);
  view.setUint32(fileOffset + 8, payloadOffset / 8, false);
  view.setUint32(fileOffset + 12, 0, false);
  view.setUint32(fileOffset + 16, 0, false);

  new Uint8Array(buffer, payloadOffset, 4).set([1, 2, 3, 4]);
  return new File([buffer], 'synthetic.rpf', { type: 'application/octet-stream', lastModified: 0 });
}
