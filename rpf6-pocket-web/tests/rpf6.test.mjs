import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatchedArchive, entryPath, parseRPF6Archive, readRPF6Header, RPFEncryptedError } from '../modules/rpf6.js';
import { makeSyntheticRPF6 } from './helpers.mjs';

const emptyNames = new Map();

test('reads a valid big-endian RPF6 header', async () => {
  const file = makeSyntheticRPF6();
  const header = await readRPF6Header(file);
  assert.equal(header.magicText, 'RPF6');
  assert.equal(header.entryCount, 2);
  assert.equal(header.encrypted, false);
  assert.equal(header.tocSize, 48);
});

test('parses directory hierarchy and file payload bounds', async () => {
  const file = makeSyntheticRPF6();
  const { entries } = await parseRPF6Archive(file);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].isDirectory, true);
  assert.equal(entries[1].size, 4);
  assert.equal(entries[1].archiveOffset, 64);
  assert.equal(entries[1].outOfBounds, false);
  assert.equal(entryPath(entries[1], entries, emptyNames), 'root/0x3C78F65E');
});

test('rejects encrypted TOC parsing but still allows header inspection', async () => {
  const file = makeSyntheticRPF6({ encryptedFlag: -3 });
  const header = await readRPF6Header(file);
  assert.equal(header.encrypted, true);
  await assert.rejects(() => parseRPF6Archive(file, header), RPFEncryptedError);
});

test('patch preserves reserved size bits and original unused slot tail', async () => {
  const file = makeSyntheticRPF6({ sizeField: 0xa0000004 });
  const { entries } = await parseRPF6Archive(file);
  const patched = await createPatchedArchive(file, entries[1], new Blob([Uint8Array.from([9, 8])]));
  const output = new Uint8Array(await patched.arrayBuffer());
  const view = new DataView(output.buffer);
  assert.equal(view.getUint32(40, false), 0xa0000002);
  assert.deepEqual(Array.from(output.slice(64, 68)), [9, 8, 3, 4]);
});
