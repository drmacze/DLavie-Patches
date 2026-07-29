import { analyzeRPF6Archive } from './modules/diagnostics.js';
import {
  downloadBlob,
  downloadJSON,
  formatBytes,
  formatDecimal,
  formatNumber,
  safeFilename,
} from './modules/format.js';
import {
  buildBatchReadme,
  buildBatchSummary,
  classifyDiagnostic,
  diagnosticReportFilename,
} from './modules/batch.js';
import { createZipStore } from './modules/zip.js';

const state = {
  results: [],
  runId: 0,
  processing: false,
  generatedAt: null,
};

const $ = (id) => document.getElementById(id);
const ui = {
  input: $('batchInput'),
  replaceInput: $('batchReplaceInput'),
  hero: $('batchHero'),
  workspace: $('batchWorkspace'),
  title: $('batchTitle'),
  subtitle: $('batchSubtitle'),
  status: $('batchStatus'),
  total: $('totalCount'),
  readable: $('readableCount'),
  encrypted: $('encryptedCount'),
  failed: $('failedCount'),
  progressLabel: $('progressLabel'),
  progressPercent: $('progressPercent'),
  progressBar: $('progressBar'),
  downloadPack: $('downloadPackButton'),
  downloadSummary: $('downloadSummaryButton'),
  clear: $('clearBatchButton'),
  list: $('batchList'),
  resultCount: $('resultCount'),
  toast: $('toast'),
};

ui.input.addEventListener('change', handleSelection);
ui.replaceInput.addEventListener('change', handleSelection);
ui.downloadPack.addEventListener('click', downloadPack);
ui.downloadSummary.addEventListener('click', downloadSummary);
ui.clear.addEventListener('click', clearBatch);
registerServiceWorker();

async function handleSelection(event) {
  const selected = Array.from(event.target.files || []);
  event.target.value = '';
  const files = selected
    .filter((file) => /\.rpf$/i.test(file.name))
    .sort((left, right) => left.name.localeCompare(right.name, 'id-ID', { numeric: true }));

  if (!files.length) {
    showToast('Tidak ada file .rpf yang dipilih.', 5000);
    return;
  }

  const runId = state.runId + 1;
  state.runId = runId;
  state.processing = true;
  state.generatedAt = null;
  state.results = files.map((file) => ({
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    status: 'queued',
    diagnostic: null,
    error: null,
  }));

  ui.hero.hidden = true;
  ui.workspace.hidden = false;
  ui.list.replaceChildren();
  for (let index = 0; index < state.results.length; index += 1) appendResultRow(index);
  updateSummary(0);
  ui.downloadPack.disabled = true;
  ui.downloadSummary.disabled = true;
  ui.title.textContent = 'Memindai arsip';
  ui.subtitle.textContent = `${formatNumber(files.length)} file diproses berurutan di perangkat.`;
  setBatchStatus('Memindai', 'status-scanning');

  for (let index = 0; index < state.results.length; index += 1) {
    if (state.runId !== runId) return;
    const result = state.results[index];
    result.status = 'processing';
    updateResultRow(index);
    ui.subtitle.textContent = `Menganalisis ${result.name} (${index + 1}/${state.results.length})`;

    try {
      result.diagnostic = await analyzeRPF6Archive(result.file);
      result.status = classifyDiagnostic(result.diagnostic);
    } catch (error) {
      result.status = 'failed';
      result.error = error?.message || 'Diagnosis gagal.';
    } finally {
      result.file = null;
    }

    updateResultRow(index);
    updateSummary(index + 1);
    await yieldToBrowser();
  }

  if (state.runId !== runId) return;
  state.processing = false;
  state.generatedAt = new Date().toISOString();
  ui.title.textContent = 'Pemindaian selesai';
  ui.subtitle.textContent = 'Paket laporan siap diunduh.';
  setBatchStatus('Selesai', 'status-ready');
  ui.downloadPack.disabled = false;
  ui.downloadSummary.disabled = false;
  showToast(`${formatNumber(state.results.length)} arsip selesai dianalisis.`, 5000);
}

function appendResultRow(index) {
  const row = document.createElement('article');
  row.className = 'batch-row status-queued';
  row.dataset.index = String(index);
  row.setAttribute('role', 'listitem');

  const icon = document.createElement('span');
  icon.className = 'batch-row-icon';
  icon.dataset.role = 'icon';
  icon.textContent = '…';

  const main = document.createElement('div');
  main.className = 'batch-row-main';
  const name = document.createElement('div');
  name.className = 'batch-row-name';
  name.dataset.role = 'name';
  const meta = document.createElement('div');
  meta.className = 'batch-row-meta';
  meta.dataset.role = 'meta';
  main.append(name, meta);

  const status = document.createElement('span');
  status.className = 'status-badge batch-row-status';
  status.dataset.role = 'status';

  row.append(icon, main, status);
  ui.list.append(row);
  updateResultRow(index);
}

function updateResultRow(index) {
  const result = state.results[index];
  const row = ui.list.querySelector(`[data-index="${index}"]`);
  if (!row) return;
  const icon = row.querySelector('[data-role="icon"]');
  const name = row.querySelector('[data-role="name"]');
  const meta = row.querySelector('[data-role="meta"]');
  const badge = row.querySelector('[data-role="status"]');

  row.className = `batch-row status-${result.status}`;
  name.textContent = result.name;

  if (result.status === 'queued') {
    icon.textContent = '…';
    meta.textContent = `${formatBytes(result.size)} • menunggu giliran`;
    setRowBadge(badge, 'Antre', '');
    return;
  }
  if (result.status === 'processing') {
    icon.textContent = '↻';
    meta.textContent = `${formatBytes(result.size)} • membaca header dan sampel`;
    setRowBadge(badge, 'Proses', 'status-scanning');
    return;
  }
  if (result.status === 'failed') {
    icon.textContent = '!';
    meta.textContent = `${formatBytes(result.size)} • ${result.error}`;
    setRowBadge(badge, 'Gagal', 'status-failed-badge');
    return;
  }

  const { header, sampling } = result.diagnostic;
  icon.textContent = result.status === 'readable' ? '✓' : '⌁';
  meta.textContent = [
    formatBytes(result.size),
    `${formatNumber(header.entryCount)} entry`,
    `flag ${header.encryptionFlag}`,
    `entropy ${formatDecimal(sampling.tocEntropyBitsPerByte, 2)}`,
  ].join(' • ');
  setRowBadge(
    badge,
    result.status === 'readable' ? 'TOC terbuka' : `Encrypted ${header.encryptionFlag}`,
    result.status === 'readable' ? 'status-readable-badge' : 'status-blocked',
  );
}

function setRowBadge(element, text, extraClass) {
  element.textContent = text;
  element.className = `status-badge batch-row-status ${extraClass}`.trim();
}

function updateSummary(completed) {
  const counts = state.results.reduce((total, result) => {
    if (result.status === 'readable') total.readable += 1;
    if (result.status === 'encrypted') total.encrypted += 1;
    if (result.status === 'failed') total.failed += 1;
    return total;
  }, { readable: 0, encrypted: 0, failed: 0 });

  const total = state.results.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  ui.total.textContent = formatNumber(total);
  ui.readable.textContent = formatNumber(counts.readable);
  ui.encrypted.textContent = formatNumber(counts.encrypted);
  ui.failed.textContent = formatNumber(counts.failed);
  ui.progressLabel.textContent = `${formatNumber(completed)} / ${formatNumber(total)}`;
  ui.progressPercent.textContent = `${percent}%`;
  ui.progressBar.style.width = `${percent}%`;
  ui.resultCount.textContent = formatNumber(total);
}

function createSummary() {
  return buildBatchSummary(state.results, state.generatedAt || new Date().toISOString());
}

function downloadSummary() {
  if (state.processing || !state.results.length) return;
  downloadJSON(createSummary(), batchFilename('summary.json'));
  showToast('Ringkasan batch diunduh.');
}

function downloadPack() {
  if (state.processing || !state.results.length) return;
  try {
    const summary = createSummary();
    const files = [
      { name: 'README.txt', data: buildBatchReadme(summary) },
      { name: 'summary.json', data: `${JSON.stringify(summary, null, 2)}\n` },
    ];

    state.results.forEach((result, index) => {
      if (!result.diagnostic) return;
      files.push({
        name: `reports/${diagnosticReportFilename(result.diagnostic, index)}`,
        data: `${JSON.stringify(result.diagnostic, null, 2)}\n`,
      });
    });

    const zip = createZipStore(files);
    downloadBlob(zip, batchFilename('diagnostic-pack.zip'));
    showToast('Pack ZIP siap disimpan.', 5000);
  } catch (error) {
    showToast(error?.message || 'Gagal membuat pack ZIP.', 6500);
  }
}

function batchFilename(suffix) {
  const date = new Date().toISOString().slice(0, 10);
  return safeFilename(`rpf6-batch-${date}-${suffix}`);
}

function clearBatch() {
  state.runId += 1;
  state.processing = false;
  state.results = [];
  state.generatedAt = null;
  ui.list.replaceChildren();
  ui.workspace.hidden = true;
  ui.hero.hidden = false;
  ui.downloadPack.disabled = true;
  ui.downloadSummary.disabled = true;
  showToast('Batch dibersihkan.');
}

function setBatchStatus(text, className) {
  ui.status.textContent = text;
  ui.status.className = `status-badge ${className}`;
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}

let toastTimer;
function showToast(message, duration = 3500) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  if (duration > 0) {
    toastTimer = setTimeout(() => {
      ui.toast.hidden = true;
    }, duration);
  }
}
