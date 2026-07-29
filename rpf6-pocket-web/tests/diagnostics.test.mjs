import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRPF6Archive, shannonEntropy } from '../modules/diagnostics.js';
import { makeSyntheticRPF6 } from './helpers.mjs';

test('entropy is zero for a constant sample', () => {
  assert.equal(shannonEntropy(new Uint8Array(1024)), 0);
});

test('entropy is eight for a uniform byte distribution', () => {
  const bytes = new Uint8Array(256 * 4);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 256;
  assert.ok(Math.abs(shannonEntropy(bytes) - 8) < 1e-12);
});

test('encrypted archive remains diagnosable without browsing capabilities', async () => {
  const report = await analyzeRPF6Archive(makeSyntheticRPF6({ encryptedFlag: -3 }));
  assert.equal(report.header.encryptionFlag, -3);
  assert.equal(report.capabilities.inspectHeader, true);
  assert.equal(report.capabilities.browseTableOfContents, false);
  assert.equal(report.safety.decryptionAttempted, false);
  assert.equal(report.archive.sampleFingerprintSha256.length, 64);
});
