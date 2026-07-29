const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;
const CRC_TABLE = createCRCTable();

function createCRCTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeData(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new TextEncoder().encode(String(value));
}

function dosDateTime(date = new Date()) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function assertClassicZipLimit(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${label} melebihi batas ZIP klasik.`);
  }
}

export function createZipStore(files, options = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Paket ZIP memerlukan minimal satu file.');
  }
  assertClassicZipLimit(files.length, 'Jumlah file', MAX_UINT16);

  const timestamp = dosDateTime(options.date || new Date());
  const entries = [];
  let localOffset = 0;

  for (const source of files) {
    const name = String(source.name || '').replace(/^\/+/, '');
    if (!name || name.endsWith('/')) throw new Error('Nama file ZIP tidak valid.');
    const nameBytes = new TextEncoder().encode(name);
    const data = encodeData(source.data);
    assertClassicZipLimit(nameBytes.length, 'Panjang nama file', MAX_UINT16);
    assertClassicZipLimit(data.length, 'Ukuran file', MAX_UINT32);
    assertClassicZipLimit(localOffset, 'Offset ZIP', MAX_UINT32);

    const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, UTF8_FLAG);
    writeUint16(localView, 8, STORE_METHOD);
    writeUint16(localView, 10, timestamp.time);
    writeUint16(localView, 12, timestamp.date);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, data.length);
    writeUint32(localView, 22, data.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    entries.push({ nameBytes, data, checksum, localHeader, localOffset });
    localOffset += localHeader.length + data.length;
  }

  assertClassicZipLimit(localOffset, 'Ukuran data ZIP', MAX_UINT32);
  const centralParts = [];
  let centralSize = 0;

  for (const entry of entries) {
    const header = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(header.buffer);
    writeUint32(view, 0, 0x02014b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 20);
    writeUint16(view, 8, UTF8_FLAG);
    writeUint16(view, 10, STORE_METHOD);
    writeUint16(view, 12, timestamp.time);
    writeUint16(view, 14, timestamp.date);
    writeUint32(view, 16, entry.checksum);
    writeUint32(view, 20, entry.data.length);
    writeUint32(view, 24, entry.data.length);
    writeUint16(view, 28, entry.nameBytes.length);
    writeUint16(view, 30, 0);
    writeUint16(view, 32, 0);
    writeUint16(view, 34, 0);
    writeUint16(view, 36, 0);
    writeUint32(view, 38, 0);
    writeUint32(view, 42, entry.localOffset);
    header.set(entry.nameBytes, 46);
    centralParts.push(header);
    centralSize += header.length;
  }

  assertClassicZipLimit(centralSize, 'Central directory', MAX_UINT32);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, localOffset);
  writeUint16(endView, 20, 0);

  const blobParts = [];
  for (const entry of entries) blobParts.push(entry.localHeader, entry.data);
  blobParts.push(...centralParts, end);
  return new Blob(blobParts, { type: 'application/zip' });
}
