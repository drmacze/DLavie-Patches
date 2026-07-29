import {
  MAX_ENTRY_COUNT,
  MAX_PATCH_SIZE,
  RPF6_ALIGNMENT,
  RPF6_HEADER_SIZE,
  RPF6_MAGIC,
  RPF6_TOC_ENTRY_SIZE,
} from './constants.js';
import { hex32, roundUp } from './format.js';

export class RPFError extends Error {
  constructor(message, code = 'RPF_ERROR') {
    super(message);
    this.name = 'RPFError';
    this.code = code;
  }
}

export class RPFEncryptedError extends RPFError {
  constructor(header) {
    super(`TOC terenkripsi (flag ${header.encryptionFlag}).`, 'RPF_ENCRYPTED');
    this.name = 'RPFEncryptedError';
    this.header = header;
  }
}

export async function readRPF6Header(file) {
  if (!file || typeof file.slice !== 'function') {
    throw new RPFError('Sumber file tidak valid.', 'INVALID_SOURCE');
  }
  if (file.size < RPF6_HEADER_SIZE) {
    throw new RPFError('File terlalu kecil untuk menjadi RPF6.', 'FILE_TOO_SMALL');
  }

  const buffer = await file.slice(0, RPF6_HEADER_SIZE).arrayBuffer();
  const view = new DataView(buffer);
  const magic = view.getUint32(0, false);
  if (magic !== RPF6_MAGIC) {
    throw new RPFError(`Magic RPF6 tidak valid: 0x${hex32(magic)}.`, 'INVALID_MAGIC');
  }

  const entryCount = view.getUint32(4, false);
  const debugDataOffset = view.getUint32(8, false);
  const encryptionFlag = view.getInt32(12, false);
  if (entryCount > MAX_ENTRY_COUNT) {
    throw new RPFError(`Jumlah entry tidak masuk akal: ${entryCount}.`, 'ENTRY_COUNT_LIMIT');
  }

  const tocSize = roundUp(entryCount * RPF6_TOC_ENTRY_SIZE, RPF6_ALIGNMENT);
  return {
    magic,
    magicText: 'RPF6',
    entryCount,
    debugDataOffset,
    encryptionFlag,
    encrypted: encryptionFlag !== 0,
    tocSize,
    tocStart: RPF6_HEADER_SIZE,
    tocEnd: RPF6_HEADER_SIZE + tocSize,
  };
}

export async function parseRPF6Archive(file, suppliedHeader = null) {
  const header = suppliedHeader || await readRPF6Header(file);
  if (header.encrypted) throw new RPFEncryptedError(header);
  if (header.tocEnd > file.size) {
    throw new RPFError('TOC berada di luar ukuran file.', 'TOC_OUT_OF_BOUNDS');
  }

  const tocBuffer = await file.slice(header.tocStart, header.tocEnd).arrayBuffer();
  const tocView = new DataView(tocBuffer);
  const entries = new Array(header.entryCount);
  const parents = new Array(header.entryCount).fill(null);

  for (let index = 0; index < header.entryCount; index += 1) {
    const offset = index * RPF6_TOC_ENTRY_SIZE;
    const nameHash = tocView.getUint32(offset, false);
    const second = tocView.getUint32(offset + 4, false);
    const third = tocView.getUint32(offset + 8, false);
    const fourth = tocView.getUint32(offset + 12, false);
    const fifth = tocView.getUint32(offset + 16, false);
    const isDirectory = (third & 0x80000000) !== 0;

    entries[index] = isDirectory
      ? {
          index,
          nameHash,
          isDirectory: true,
          flags: second,
          childStart: third & 0x7fffffff,
          childCount: fourth & 0x0fffffff,
          unknown: fifth,
        }
      : createFileEntry(index, nameHash, second, third, fourth, fifth);
  }

  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const end = entry.childStart + entry.childCount;
    if (entry.childStart > header.entryCount || end > header.entryCount) {
      throw new RPFError(`Rentang child direktori #${entry.index} tidak valid.`, 'INVALID_DIRECTORY_RANGE');
    }
    for (let child = entry.childStart; child < end; child += 1) {
      if (child !== entry.index) parents[child] = entry.index;
    }
  }

  entries.forEach((entry, index) => {
    entry.parentIndex = parents[index];
    if (!entry.isDirectory && entry.archiveOffset + entry.size > file.size) {
      entry.outOfBounds = true;
    }
  });

  return { header, entries };
}

function createFileEntry(index, nameHash, rawSizeField, encodedOffset, flag1, flag2) {
  const isResource = (flag1 & 0x80000000) !== 0;
  const extended = (flag2 & 0x80000000) !== 0;
  const archiveOffset = isResource
    ? (encodedOffset & 0x7fffff00) * 8
    : (encodedOffset & 0x7fffffff) * 8;

  return {
    index,
    nameHash,
    isDirectory: false,
    rawSizeField,
    size: rawSizeField & MAX_PATCH_SIZE,
    encodedOffset,
    archiveOffset,
    flag1,
    flag2,
    isResource,
    resourceType: isResource ? encodedOffset & 0xff : null,
    isCompressed: !isResource && !extended && (flag1 & 0x40000000) !== 0,
    usesExtendedFlags: extended,
    outOfBounds: false,
  };
}

export function entryName(entry, names) {
  if (entry.isDirectory && entry.nameHash === 0) return 'root';
  return names.get(entry.nameHash) || `0x${hex32(entry.nameHash)}`;
}

export function entryPath(entry, entries, names) {
  const components = [entryName(entry, names)];
  const visited = new Set();
  let parentIndex = entry.parentIndex;
  while (parentIndex !== null && entries[parentIndex] && !visited.has(parentIndex)) {
    visited.add(parentIndex);
    const parent = entries[parentIndex];
    components.push(entryName(parent, names));
    parentIndex = parent.parentIndex;
  }
  return components.reverse().join('/');
}

export async function createPatchedArchive(file, entry, replacement) {
  if (!file || !entry || entry.isDirectory || !replacement) {
    throw new RPFError('Input patch tidak lengkap.', 'INVALID_PATCH_INPUT');
  }
  if (replacement.size > MAX_PATCH_SIZE) {
    throw new RPFError('File pengganti melebihi field ukuran 28-bit.', 'PATCH_SIZE_LIMIT');
  }
  if (replacement.size > entry.size) {
    throw new RPFError('File pengganti lebih besar dari slot entry.', 'PATCH_SLOT_OVERFLOW');
  }

  const sizeFieldOffset = RPF6_HEADER_SIZE + entry.index * RPF6_TOC_ENTRY_SIZE + 4;
  const payloadStart = entry.archiveOffset;
  const payloadEnd = payloadStart + entry.size;
  if (payloadEnd > file.size || sizeFieldOffset + 4 > payloadStart) {
    throw new RPFError('Layout entry tidak aman untuk patch in-place.', 'UNSAFE_PATCH_LAYOUT');
  }

  const originalSizeFieldBuffer = await file.slice(sizeFieldOffset, sizeFieldOffset + 4).arrayBuffer();
  const originalSizeField = new DataView(originalSizeFieldBuffer).getUint32(0, false);
  const preservedTopBits = originalSizeField & 0xf0000000;
  const sizeBytes = new ArrayBuffer(4);
  new DataView(sizeBytes).setUint32(
    0,
    preservedTopBits | (replacement.size & MAX_PATCH_SIZE),
    false,
  );

  const preservedSlotTail = file.slice(payloadStart + replacement.size, payloadEnd);
  return new Blob([
    file.slice(0, sizeFieldOffset),
    sizeBytes,
    file.slice(sizeFieldOffset + 4, payloadStart),
    replacement,
    preservedSlotTail,
    file.slice(payloadEnd),
  ], { type: 'application/octet-stream' });
}
