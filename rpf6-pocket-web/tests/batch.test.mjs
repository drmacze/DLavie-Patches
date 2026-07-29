import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBatchSummary,
  classifyDiagnostic,
  diagnosticReportFilename,
} from '../modules/batch.js';

function diagnostic(name, encrypted, flag) {
  return {
    archive: { name, size: 123, sampleFingerprintSha256: 'abc' },
    header: { encrypted, encryptionFlag: flag, entryCount: 3 },
    sampling: {
      tocSampleBytes: 60,
      tailSampleBytes: 123,
      tocEntropyBitsPerByte: encrypted ? 7.99 : 4.2,
      encryptedLikely: encrypted,
    },
    capabilities: { inspectHeader: true },
  };
}

test('classifyDiagnostic distinguishes readable and encrypted archives', () => {
  assert.equal(classifyDiagnostic(diagnostic('a.rpf', false, 0)), 'readable');
  assert.equal(classifyDiagnostic(diagnostic('b.rpf', true, -3)), 'encrypted');
  assert.equal(classifyDiagnostic(null), 'failed');
});

test('buildBatchSummary counts results and creates unique report paths', () => {
  const results = [
    { diagnostic: diagnostic('same.rpf', true, -3) },
    { diagnostic: diagnostic('same.rpf', false, 0) },
    { name: 'bad.rpf', size: 9, error: 'Magic invalid' },
  ];
  const summary = buildBatchSummary(results, '2026-07-30T00:00:00.000Z');
  assert.equal(summary.totalFiles, 3);
  assert.deepEqual(summary.counts, { readable: 1, encrypted: 1, failed: 1 });
  assert.equal(summary.archives[0].reportFile, 'reports/001-same-diagnostic.json');
  assert.equal(summary.archives[1].reportFile, 'reports/002-same-diagnostic.json');
  assert.equal(summary.archives[2].reportFile, null);
  assert.equal(summary.safety.filesUploaded, false);
});

test('diagnosticReportFilename sanitizes names', () => {
  const value = diagnosticReportFilename(diagnostic('bad:name.rpf', true, -3), 4);
  assert.equal(value, '005-bad_name-diagnostic.json');
});
