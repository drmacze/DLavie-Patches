import { safeFilename } from './format.js';

export const BATCH_SCHEMA = 'rpf6-batch-diagnostic';
export const BATCH_SCHEMA_VERSION = 1;

export function classifyDiagnostic(diagnostic) {
  if (!diagnostic?.header) return 'failed';
  return diagnostic.header.encrypted ? 'encrypted' : 'readable';
}

export function diagnosticReportFilename(diagnostic, index = 0) {
  const archiveName = diagnostic?.archive?.name || `archive-${index + 1}.rpf`;
  const base = archiveName.replace(/\.rpf$/i, '') || `archive-${index + 1}`;
  return `${String(index + 1).padStart(3, '0')}-${safeFilename(base)}-diagnostic.json`;
}

export function buildBatchSummary(results, generatedAt = new Date().toISOString()) {
  const normalized = results.map((result, index) => {
    if (result.diagnostic) {
      const diagnostic = result.diagnostic;
      return {
        index,
        status: classifyDiagnostic(diagnostic),
        archive: diagnostic.archive,
        header: diagnostic.header,
        sampling: {
          tocSampleBytes: diagnostic.sampling.tocSampleBytes,
          tailSampleBytes: diagnostic.sampling.tailSampleBytes,
          tocEntropyBitsPerByte: diagnostic.sampling.tocEntropyBitsPerByte,
          encryptedLikely: diagnostic.sampling.encryptedLikely,
        },
        capabilities: diagnostic.capabilities,
        reportFile: `reports/${diagnosticReportFilename(diagnostic, index)}`,
      };
    }

    return {
      index,
      status: 'failed',
      archive: {
        name: result.name || `archive-${index + 1}.rpf`,
        size: Number.isFinite(result.size) ? result.size : null,
        type: result.type || 'application/octet-stream',
        lastModified: Number.isFinite(result.lastModified) ? result.lastModified : null,
      },
      error: result.error || 'Diagnosis gagal.',
      reportFile: null,
    };
  });

  const counts = normalized.reduce((total, item) => {
    total[item.status] += 1;
    return total;
  }, { readable: 0, encrypted: 0, failed: 0 });

  return {
    schema: BATCH_SCHEMA,
    schemaVersion: BATCH_SCHEMA_VERSION,
    generatedAt,
    processingLocation: 'device-local',
    totalFiles: normalized.length,
    counts,
    archives: normalized,
    safety: {
      filesUploaded: false,
      decryptionAttempted: false,
      originalsModified: false,
    },
  };
}

export function buildBatchReadme(summary) {
  return [
    'RPF6 Enhanced Lab — Batch Diagnostic Pack',
    '',
    `Generated: ${summary.generatedAt}`,
    `Total: ${summary.totalFiles}`,
    `TOC readable: ${summary.counts.readable}`,
    `Encrypted: ${summary.counts.encrypted}`,
    `Failed: ${summary.counts.failed}`,
    '',
    'Isi paket:',
    '- summary.json: ringkasan semua arsip.',
    '- reports/: satu laporan diagnostik JSON per arsip yang berhasil dianalisis.',
    '',
    'Catatan keselamatan:',
    '- File RPF diproses lokal di perangkat dan tidak dimasukkan ke paket ZIP.',
    '- Tidak ada dekripsi, kunci game, bypass DRM, atau perubahan pada arsip asli.',
    '- Status "readable" berarti header tidak menandai TOC sebagai terenkripsi; validasi editor penuh tetap dilakukan saat arsip dibuka satu per satu.',
    '',
  ].join('\n');
}
