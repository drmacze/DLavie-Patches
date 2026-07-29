import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, createZipStore } from '../modules/zip.js';

test('crc32 matches the standard test vector', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc32(bytes), 0xcbf43926);
});

test('createZipStore writes local, central, and end records', async () => {
  const zip = createZipStore([
    { name: 'summary.json', data: '{"ok":true}\n' },
    { name: 'reports/test.json', data: '{}\n' },
  ], { date: new Date('2026-01-02T03:04:06Z') });
  assert.equal(zip.type, 'application/zip');

  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.length - 12, true), 2);

  const text = new TextDecoder().decode(bytes);
  assert.match(text, /summary\.json/);
  assert.match(text, /reports\/test\.json/);
});

test('createZipStore rejects empty packs', () => {
  assert.throws(() => createZipStore([]), /minimal satu file/i);
});
