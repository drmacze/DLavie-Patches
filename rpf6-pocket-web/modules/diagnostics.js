import {
  DIAGNOSTIC_SCHEMA_VERSION,
  DIAGNOSTIC_TAIL_SAMPLE_BYTES,
  DIAGNOSTIC_TOC_SAMPLE_BYTES,
  RPF6_HEADER_SIZE,
} from './constants.js';
import { bytesToHex } from './format.js';
import { sha256Hex } from './hash.js';
import { readRPF6Header } from './rpf6.js';

export function shannonEntropy(bytes) {
  if (!bytes.length) return 0;
  const counts = new Uint32Array(256);
  for (const byte of bytes) counts[byte] += 1;
  let entropy = 0;
  for (const count of counts) {
    if (!count) continue;
    const probability = count / bytes.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

export async function analyzeRPF6Archive(file) {
  const header = await readRPF6Header(file);
  const tocReadableBytes = Math.max(0, Math.min(header.tocSize, file.size - RPF6_HEADER_SIZE));
  const tocSampleLength = Math.min(tocReadableBytes, DIAGNOSTIC_TOC_SAMPLE_BYTES);
  const tailSampleLength = Math.min(file.size, DIAGNOSTIC_TAIL_SAMPLE_BYTES);

  const headerBuffer = await file.slice(0, Math.min(file.size, RPF6_HEADER_SIZE)).arrayBuffer();
  const tocSampleBuffer = await file.slice(
    RPF6_HEADER_SIZE,
    RPF6_HEADER_SIZE + tocSampleLength,
  ).arrayBuffer();
  const tailSampleBuffer = await file.slice(file.size - tailSampleLength, file.size).arrayBuffer();
  const previewBuffer = await file.slice(0, Math.min(file.size, 96)).arrayBuffer();

  const tocSample = new Uint8Array(tocSampleBuffer);
  const fingerprintSource = new Blob([
    headerBuffer,
    tocSampleBuffer,
    tailSampleBuffer,
    String(file.size),
  ]);
  const fingerprint = await sha256Hex(fingerprintSource);
  const entropy = shannonEntropy(tocSample);
  const encryptedLikely = header.encrypted || entropy >= 7.75;

  return {
    schema: 'rpf6-pocket-diagnostic',
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    archive: {
      name: file.name || 'archive.rpf',
      size: file.size,
      type: file.type || 'application/octet-stream',
      lastModified: Number.isFinite(file.lastModified) ? file.lastModified : null,
      sampleFingerprintSha256: fingerprint,
    },
    header,
    sampling: {
      tocSampleBytes: tocSampleLength,
      tailSampleBytes: tailSampleLength,
      tocEntropyBitsPerByte: Number(entropy.toFixed(5)),
      encryptedLikely,
      previewHex: bytesToHex(new Uint8Array(previewBuffer)),
    },
    capabilities: {
      inspectHeader: true,
      browseTableOfContents: !header.encrypted,
      extractRawEntries: !header.encrypted,
      patchExistingSlot: !header.encrypted,
      buildEnhancementPlan: true,
      decodeTextures: false,
      editLighting: false,
      editShaders: false,
      rebuildArchive: false,
    },
    safety: {
      decryptionAttempted: false,
      originalModified: false,
      processingLocation: 'device-local',
    },
  };
}
