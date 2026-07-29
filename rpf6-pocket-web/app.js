import { PAGE_SIZE } from './modules/constants.js';
import { analyzeRPF6Archive } from './modules/diagnostics.js';
import {
  debounce,
  downloadBlob,
  downloadJSON,
  formatBytes,
  formatDecimal,
  formatNumber,
  hex32,
  safeFilename,
} from './modules/format.js';
import { joaat } from './modules/hash.js';
import { ENHANCEMENT_PROFILES, PIPELINE_MODULES, getProfile } from './modules/profiles.js';
import { createEnhancementProject, normalizeProject } from './modules/project.js';
import {
  createPatchedArchive,
  entryName,
  entryPath,
  parseRPF6Archive,
} from './modules/rpf6.js';

const state = {
  file: null,
  diagnostic: null,
  header: null,
  entries: [],
  names: new Map(),
  filtered: [],
  renderedCount: 0,
  selectedIndex: null,
  installPrompt: null,
  activeTab: 'overview',
  importedProject: null,
};

const $ = (id) => document.getElementById(id);
const ui = {
  archiveInput: $('archiveInput'),
  archiveReplaceInput: $('archiveReplaceInput'),
  namesInput: $('namesInput'),
  namesButton: $('namesButton'),
  replacementInput: $('replacementInput'),
  projectInput: $('projectInput'),
  welcomeCard: $('welcomeCard'),
  workspace: $('workspace'),
  archiveName: $('archiveName'),
  archiveMeta: $('archiveMeta'),
  archiveStatus: $('archiveStatus'),
  archiveTabButton: $('archiveTabButton'),
  archiveLockedCard: $('archiveLockedCard'),
  archiveBrowser: $('archiveBrowser'),
  overviewEntryCount: $('overviewEntryCount'),
  overviewEncryption: $('overviewEncryption'),
  overviewEntropy: $('overviewEntropy'),
  overviewMode: $('overviewMode'),
  capabilityGrid: $('capabilityGrid'),
  nextActionTitle: $('nextActionTitle'),
  nextActionText: $('nextActionText'),
  nextActionButton: $('nextActionButton'),
  entryCount: $('entryCount'),
  fileCount: $('fileCount'),
  directoryCount: $('directoryCount'),
  visibleCount: $('visibleCount'),
  entryList: $('entryList'),
  emptyList: $('emptyList'),
  loadMoreButton: $('loadMoreButton'),
  searchInput: $('searchInput'),
  typeFilter: $('typeFilter'),
  closeArchiveButton: $('closeArchiveButton'),
  entryDialog: $('entryDialog'),
  detailName: $('detailName'),
  detailPath: $('detailPath'),
  detailGrid: $('detailGrid'),
  detailNote: $('detailNote'),
  fileActions: $('fileActions'),
  extractButton: $('extractButton'),
  profileSelect: $('profileSelect'),
  profileBadge: $('profileBadge'),
  profileSummary: $('profileSummary'),
  projectNotes: $('projectNotes'),
  exportProjectButton: $('exportProjectButton'),
  pipelineList: $('pipelineList'),
  diagMagic: $('diagMagic'),
  diagFlag: $('diagFlag'),
  diagTocSize: $('diagTocSize'),
  diagSampleSize: $('diagSampleSize'),
  diagnosticGrid: $('diagnosticGrid'),
  hexPreview: $('hexPreview'),
  exportDiagnosticButton: $('exportDiagnosticButton'),
  toast: $('toast'),
  installButton: $('installButton'),
};

initialize();

function initialize() {
  populateProfiles();
  renderProfileSummary();
  renderPipeline();
  bindEvents();
  setupInstallPrompt();
  registerServiceWorker();
}

function bindEvents() {
  ui.archiveInput.addEventListener('change', handleArchiveSelection);
  ui.archiveReplaceInput.addEventListener('change', handleArchiveSelection);
  ui.namesInput.addEventListener('change', handleNamesSelection);
  ui.searchInput.addEventListener('input', debounce(applyFilters, 130));
  ui.typeFilter.addEventListener('change', applyFilters);
  ui.loadMoreButton.addEventListener('click', renderNextPage);
  ui.closeArchiveButton.addEventListener('click', resetWorkspace);
  ui.extractButton.addEventListener('click', extractSelected);
  ui.replacementInput.addEventListener('change', patchSelected);
  ui.profileSelect.addEventListener('change', renderProfileSummary);
  ui.exportProjectButton.addEventListener('click', exportProject);
  ui.projectInput.addEventListener('change', importProject);
  ui.exportDiagnosticButton.addEventListener('click', exportDiagnostic);
  ui.nextActionButton.addEventListener('click', () => {
    setActiveTab(state.header?.encrypted ? 'diagnostics' : 'archive');
  });

  for (const button of document.querySelectorAll('[data-tab]')) {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  }
  for (const button of document.querySelectorAll('[data-open-tab]')) {
    button.addEventListener('click', () => setActiveTab(button.dataset.openTab));
  }
}

async function handleArchiveSelection(event) {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;

  try {
    showToast('Menganalisis header dan sampel arsip…', 0);
    const diagnostic = await analyzeRPF6Archive(file);
    let entries = [];
    if (!diagnostic.header.encrypted) {
      ({ entries } = await parseRPF6Archive(file, diagnostic.header));
    }

    state.file = file;
    state.diagnostic = diagnostic;
    state.header = diagnostic.header;
    state.entries = entries;
    state.names.clear();
    state.filtered = [];
    state.renderedCount = 0;
    state.selectedIndex = null;
    state.importedProject = null;

    updateWorkspace();
    setActiveTab('overview');
    showToast(
      diagnostic.header.encrypted
        ? `RPF6 dikenali. TOC terenkripsi (flag ${diagnostic.header.encryptionFlag}); mode diagnostik aktif.`
        : `RPF6 terbaca: ${formatNumber(entries.length)} entry.`,
      6500,
    );
  } catch (error) {
    resetWorkspace();
    showToast(error.message || 'Gagal membaca arsip.', 7000);
  }
}

async function handleNamesSelection(event) {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file || !state.entries.length) return;

  try {
    const text = await file.text();
    let loaded = 0;
    for (const rawLine of text.split(/\r?\n/)) {
      const name = rawLine.trim();
      if (!name || name.startsWith('#')) continue;
      state.names.set(joaat(name), name);
      loaded += 1;
    }
    applyFilters();
    showToast(`${formatNumber(loaded)} nama dimuat.`);
  } catch (error) {
    showToast(`Names.txt gagal dibaca: ${error.message}`, 6000);
  }
}

function updateWorkspace() {
  ui.welcomeCard.hidden = true;
  ui.workspace.hidden = false;
  updateArchiveSummary();
  renderOverview();
  renderArchivePanel();
  renderDiagnostics();
  renderProfileSummary();
}

function updateArchiveSummary() {
  const { archive, header } = state.diagnostic;
  ui.archiveName.textContent = archive.name;
  ui.archiveMeta.textContent = `${formatBytes(archive.size)} • ${formatNumber(header.entryCount)} entry header • lokal di perangkat`;
  ui.archiveStatus.textContent = header.encrypted ? `Encrypted ${header.encryptionFlag}` : 'TOC terbaca';
  ui.archiveStatus.className = `status-badge ${header.encrypted ? 'status-blocked' : 'status-ready'}`;
  ui.namesButton.hidden = header.encrypted;
}

function renderOverview() {
  const { header, sampling, capabilities } = state.diagnostic;
  ui.overviewEntryCount.textContent = formatNumber(header.entryCount);
  ui.overviewEncryption.textContent = header.encrypted ? String(header.encryptionFlag) : 'Tidak';
  ui.overviewEntropy.textContent = formatDecimal(sampling.tocEntropyBitsPerByte, 2);
  ui.overviewMode.textContent = header.encrypted ? 'Diagnostik' : 'Editor raw';

  const capabilityLabels = [
    ['inspectHeader', 'Inspeksi header'],
    ['browseTableOfContents', 'Browse TOC'],
    ['extractRawEntries', 'Ekstrak raw'],
    ['patchExistingSlot', 'Patch slot'],
    ['buildEnhancementPlan', 'Rancang enhancement'],
    ['decodeTextures', 'Decode texture'],
    ['editLighting', 'Edit lighting'],
    ['editShaders', 'Edit shader'],
    ['rebuildArchive', 'Rebuild penuh'],
  ];
  ui.capabilityGrid.replaceChildren();
  for (const [key, label] of capabilityLabels) {
    const item = document.createElement('article');
    const enabled = Boolean(capabilities[key]);
    item.className = `capability-item ${enabled ? 'capability-ready' : 'capability-waiting'}`;
    const symbol = document.createElement('span');
    symbol.textContent = enabled ? '✓' : '•';
    const text = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = label;
    const small = document.createElement('small');
    small.textContent = enabled ? 'Tersedia sekarang' : capabilityReason(key);
    text.append(strong, small);
    item.append(symbol, text);
    ui.capabilityGrid.append(item);
  }

  if (header.encrypted) {
    ui.nextActionTitle.textContent = 'Ekspor laporan dan cari sampel asset yang dapat dibaca';
    ui.nextActionText.textContent = 'Arsip ini aman untuk didiagnosis, tetapi TOC tidak dapat dibrowse tanpa dekripsi yang sah. Blueprint enhancement tetap dapat dibuat dari tab Enhance.';
    ui.nextActionButton.textContent = 'Buka diagnostik';
  } else {
    ui.nextActionTitle.textContent = 'Inventaris entry lalu identifikasi asset visual';
    ui.nextActionText.textContent = 'Muat names.txt bila tersedia, cari resource kandidat, ekstrak sampel kecil, lalu gunakan project manifest untuk mencatat target texture, lighting, dan material.';
    ui.nextActionButton.textContent = 'Buka arsip';
  }
}

function capabilityReason(key) {
  const reasons = {
    browseTableOfContents: 'Menunggu TOC terbaca',
    extractRawEntries: 'Menunggu TOC terbaca',
    patchExistingSlot: 'Menunggu TOC terbaca',
    decodeTextures: 'Menunggu format sampel',
    editLighting: 'Menunggu file konfigurasi',
    editShaders: 'Menunggu metadata/material',
    rebuildArchive: 'Modul masih direncanakan',
  };
  return reasons[key] || 'Belum tersedia';
}

function renderArchivePanel() {
  const encrypted = state.header.encrypted;
  ui.archiveLockedCard.hidden = !encrypted;
  ui.archiveBrowser.hidden = encrypted;
  ui.archiveTabButton.classList.toggle('tab-warning', encrypted);
  if (!encrypted) {
    updateArchiveStats();
    applyFilters();
  } else {
    ui.entryList.replaceChildren();
  }
}

function updateArchiveStats() {
  const files = state.entries.filter((entry) => !entry.isDirectory);
  ui.entryCount.textContent = formatNumber(state.entries.length);
  ui.fileCount.textContent = formatNumber(files.length);
  ui.directoryCount.textContent = formatNumber(state.entries.length - files.length);
}

function applyFilters() {
  if (!state.file || state.header.encrypted) return;
  const query = ui.searchInput.value.trim().toLowerCase();
  const filter = ui.typeFilter.value;

  state.filtered = state.entries.filter((entry) => {
    if (filter === 'file' && entry.isDirectory) return false;
    if (filter === 'directory' && !entry.isDirectory) return false;
    if (filter === 'resource' && (entry.isDirectory || !entry.isResource)) return false;
    if (filter === 'compressed' && (entry.isDirectory || !entry.isCompressed)) return false;
    if (filter === 'invalid' && (entry.isDirectory || !entry.outOfBounds)) return false;
    if (!query) return true;
    const name = entryName(entry, state.names).toLowerCase();
    const path = entryPath(entry, state.entries, state.names).toLowerCase();
    return name.includes(query)
      || path.includes(query)
      || `0x${hex32(entry.nameHash)}`.toLowerCase().includes(query);
  });

  state.renderedCount = 0;
  ui.entryList.replaceChildren();
  ui.visibleCount.textContent = formatNumber(state.filtered.length);
  ui.emptyList.hidden = state.filtered.length !== 0;
  renderNextPage();
}

function renderNextPage() {
  const end = Math.min(state.renderedCount + PAGE_SIZE, state.filtered.length);
  const fragment = document.createDocumentFragment();

  for (let index = state.renderedCount; index < end; index += 1) {
    const entry = state.filtered[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `entry-row ${entry.outOfBounds ? 'entry-invalid' : ''}`;
    button.dataset.index = String(entry.index);
    button.setAttribute('role', 'listitem');

    const icon = document.createElement('span');
    icon.className = 'entry-icon';
    icon.textContent = entry.isDirectory ? '▰' : entry.isResource ? '◆' : '▤';

    const main = document.createElement('span');
    main.className = 'entry-main';
    const name = document.createElement('div');
    name.className = 'entry-name';
    name.textContent = entryName(entry, state.names);
    const path = document.createElement('div');
    path.className = 'entry-path';
    path.textContent = entryPath(entry, state.entries, state.names);
    main.append(name, path);

    const size = document.createElement('span');
    size.className = 'entry-size';
    size.textContent = entry.isDirectory ? `${entry.childCount} item` : formatBytes(entry.size);

    button.append(icon, main, size);
    button.addEventListener('click', () => showEntry(entry.index));
    fragment.append(button);
  }

  ui.entryList.append(fragment);
  state.renderedCount = end;
  ui.loadMoreButton.hidden = end >= state.filtered.length;
}

function showEntry(index) {
  const entry = state.entries[index];
  if (!entry) return;
  state.selectedIndex = index;
  ui.detailName.textContent = entryName(entry, state.names);
  ui.detailPath.textContent = entryPath(entry, state.entries, state.names);
  ui.detailGrid.replaceChildren();

  const rows = [
    ['Index', String(entry.index)],
    ['Hash', `0x${hex32(entry.nameHash)}`],
    ['Jenis', entry.isDirectory ? 'Direktori' : entry.isResource ? 'Resource' : 'File'],
  ];

  if (entry.isDirectory) {
    rows.push(['Child awal', String(entry.childStart)], ['Jumlah child', String(entry.childCount)]);
    ui.fileActions.hidden = true;
    ui.detailNote.textContent = 'Direktori tidak memiliki payload untuk diekstrak.';
  } else {
    rows.push(
      ['Ukuran raw', formatBytes(entry.size)],
      ['Offset', formatNumber(entry.archiveOffset)],
      ['Compressed regular', entry.isCompressed ? 'Ya' : 'Tidak'],
      ['Resource type', entry.resourceType === null ? '—' : String(entry.resourceType)],
      ['Extended flags', entry.usesExtendedFlags ? 'Ya' : 'Tidak'],
      ['Bounds', entry.outOfBounds ? 'Tidak valid' : 'Valid'],
    );
    ui.fileActions.hidden = entry.outOfBounds;
    ui.detailNote.textContent = entry.outOfBounds
      ? 'Entry berada di luar batas arsip dan sengaja tidak dapat diekstrak atau dipatch.'
      : `Pengganti harus sudah memakai format internal yang benar dan tidak lebih besar dari ${formatBytes(entry.size)}. Hasil selalu disimpan sebagai salinan baru.`;
  }

  appendDefinitionRows(ui.detailGrid, rows);
  ui.entryDialog.showModal();
}

function extractSelected() {
  const entry = state.entries[state.selectedIndex];
  if (!state.file || !entry || entry.isDirectory || entry.outOfBounds) return;
  const blob = state.file.slice(entry.archiveOffset, entry.archiveOffset + entry.size);
  downloadBlob(blob, `${safeFilename(entryName(entry, state.names))}-raw.bin`);
  showToast('Ekstraksi raw dimulai.');
}

async function patchSelected(event) {
  const [replacement] = event.target.files;
  event.target.value = '';
  const entry = state.entries[state.selectedIndex];
  if (!replacement || !state.file || !entry || entry.isDirectory || entry.outOfBounds) return;

  try {
    showToast('Menyusun salinan patched…', 0);
    const patched = await createPatchedArchive(state.file, entry, replacement);
    const base = state.file.name.replace(/\.rpf$/i, '') || 'archive';
    downloadBlob(patched, `${safeFilename(base)}-patched.rpf`);
    showToast('Salinan patched siap disimpan. Arsip asli tidak berubah.', 6000);
  } catch (error) {
    showToast(error.message || 'Patch gagal.', 6500);
  }
}

function renderDiagnostics() {
  const { archive, header, sampling } = state.diagnostic;
  ui.diagMagic.textContent = header.magicText;
  ui.diagFlag.textContent = String(header.encryptionFlag);
  ui.diagTocSize.textContent = formatBytes(header.tocSize);
  ui.diagSampleSize.textContent = formatBytes(sampling.tocSampleBytes);
  ui.hexPreview.textContent = sampling.previewHex;

  const rows = [
    ['Nama', archive.name],
    ['Ukuran', formatBytes(archive.size)],
    ['Entry count', formatNumber(header.entryCount)],
    ['Debug offset', formatNumber(header.debugDataOffset)],
    ['Encryption flag', String(header.encryptionFlag)],
    ['TOC expected', formatBytes(header.tocSize)],
    ['Entropy sample', `${formatDecimal(sampling.tocEntropyBitsPerByte, 5)} bit/byte`],
    ['Encrypted likely', sampling.encryptedLikely ? 'Ya' : 'Tidak'],
    ['Sample fingerprint', archive.sampleFingerprintSha256],
  ];
  ui.diagnosticGrid.replaceChildren();
  appendDefinitionRows(ui.diagnosticGrid, rows);
}

function exportDiagnostic() {
  if (!state.diagnostic) return;
  const base = state.file.name.replace(/\.rpf$/i, '') || 'archive';
  downloadJSON(state.diagnostic, `${safeFilename(base)}-diagnostic.json`);
  showToast('Laporan diagnostik diekspor.');
}

function populateProfiles() {
  for (const profile of ENHANCEMENT_PROFILES) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    ui.profileSelect.append(option);
  }
}

function renderProfileSummary() {
  const profile = getProfile(ui.profileSelect.value);
  ui.profileBadge.textContent = profile.badge;
  ui.profileSummary.replaceChildren();

  const description = document.createElement('p');
  description.className = 'muted profile-description';
  description.textContent = profile.description;
  const metrics = document.createElement('div');
  metrics.className = 'profile-metrics';
  const values = [
    ['Target', `${profile.target.fps} FPS`],
    ['Texture max', `${profile.texture.maxUpscale}×`],
    ['Sharpen', String(profile.texture.sharpen)],
    ['Normal', `${profile.texture.normalStrength}×`],
    ['Archive growth', `≤ ${profile.limits.keepArchiveGrowthPercent}%`],
    ['Thermal', profile.target.thermalBudget],
  ];
  for (const [label, value] of values) {
    const item = document.createElement('span');
    const small = document.createElement('small');
    small.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    item.append(small, strong);
    metrics.append(item);
  }
  ui.profileSummary.append(description, metrics);
}

function selectedGoals() {
  const goals = {};
  for (const input of document.querySelectorAll('input[name="goal"]')) {
    goals[input.value] = input.checked;
  }
  return goals;
}

function exportProject() {
  const project = createEnhancementProject({
    diagnostic: state.diagnostic,
    profileId: ui.profileSelect.value,
    goals: selectedGoals(),
    notes: ui.projectNotes.value,
  });
  const base = state.file?.name?.replace(/\.rpf$/i, '') || 'rdr-mobile';
  downloadJSON(project, `${safeFilename(base)}-enhancement-project.json`);
  showToast('Blueprint enhancement diekspor.');
}

async function importProject(event) {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  try {
    const project = normalizeProject(JSON.parse(await file.text()));
    state.importedProject = project;
    ui.profileSelect.value = project.target.profileId;
    ui.projectNotes.value = project.notes;
    for (const input of document.querySelectorAll('input[name="goal"]')) {
      input.checked = Boolean(project.goals[input.value]);
    }
    renderProfileSummary();
    setActiveTab('enhance');
    showToast('Project enhancement dimuat.');
  } catch (error) {
    showToast(error.message || 'Project JSON tidak valid.', 6500);
  }
}

function renderPipeline() {
  ui.pipelineList.replaceChildren();
  for (const module of PIPELINE_MODULES) {
    const row = document.createElement('article');
    row.className = 'pipeline-item';
    const marker = document.createElement('span');
    marker.className = `pipeline-status pipeline-${module.status}`;
    marker.textContent = pipelineStatusLabel(module.status);
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = module.name;
    const description = document.createElement('p');
    description.textContent = module.description;
    text.append(title, description);
    row.append(marker, text);
    ui.pipelineList.append(row);
  }
}

function pipelineStatusLabel(status) {
  const labels = {
    ready: 'READY',
    'ready-unencrypted': 'READY*',
    planned: 'PLANNED',
    'needs-sample': 'SAMPLE',
    research: 'RESEARCH',
  };
  return labels[status] || status.toUpperCase();
}

function setActiveTab(tab) {
  if (!document.querySelector(`[data-panel="${tab}"]`)) return;
  state.activeTab = tab;
  for (const button of document.querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== tab;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetWorkspace() {
  state.file = null;
  state.diagnostic = null;
  state.header = null;
  state.entries = [];
  state.names.clear();
  state.filtered = [];
  state.renderedCount = 0;
  state.selectedIndex = null;
  state.importedProject = null;
  ui.entryList.replaceChildren();
  ui.searchInput.value = '';
  ui.typeFilter.value = 'all';
  ui.workspace.hidden = true;
  ui.welcomeCard.hidden = false;
  if (ui.entryDialog.open) ui.entryDialog.close();
}

function appendDefinitionRows(container, rows) {
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    container.append(dt, dd);
  }
}

function setupInstallPrompt() {
  ui.installButton.addEventListener('click', async () => {
    if (state.installPrompt) {
      state.installPrompt.prompt();
      await state.installPrompt.userChoice;
      state.installPrompt = null;
      ui.installButton.hidden = true;
    } else {
      showToast('Di Safari: tekan Bagikan, lalu pilih “Tambahkan ke Layar Utama”.', 7000);
    }
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    ui.installButton.hidden = false;
  });

  const isIOSBrowser = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOSBrowser && !window.navigator.standalone) ui.installButton.hidden = false;
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
