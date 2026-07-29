const MAGIC = 0x52504636;
const TOC_ENTRY_SIZE = 20;
const PAGE_SIZE = 120;
const MAX_ENTRY_COUNT = 5_000_000;

const state = {
  file: null,
  header: null,
  entries: [],
  names: new Map(),
  filtered: [],
  renderedCount: 0,
  selectedIndex: null,
  installPrompt: null,
};

const $ = (id) => document.getElementById(id);
const ui = {
  archiveInput: $('archiveInput'), namesInput: $('namesInput'), replacementInput: $('replacementInput'),
  welcomeCard: $('welcomeCard'), workspace: $('workspace'), archiveName: $('archiveName'), archiveMeta: $('archiveMeta'),
  entryCount: $('entryCount'), fileCount: $('fileCount'), directoryCount: $('directoryCount'), visibleCount: $('visibleCount'),
  entryList: $('entryList'), emptyList: $('emptyList'), loadMoreButton: $('loadMoreButton'), searchInput: $('searchInput'),
  typeFilter: $('typeFilter'), closeArchiveButton: $('closeArchiveButton'), entryDialog: $('entryDialog'),
  detailName: $('detailName'), detailPath: $('detailPath'), detailGrid: $('detailGrid'), detailNote: $('detailNote'),
  fileActions: $('fileActions'), extractButton: $('extractButton'), toast: $('toast'), installButton: $('installButton'),
};

class RPFError extends Error {}

ui.archiveInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  try {
    showToast('Membaca header dan TOC…', 0);
    await openArchive(file);
    showToast(`Berhasil membaca ${formatNumber(state.entries.length)} entry.`);
  } catch (error) {
    resetArchive();
    showToast(error.message || 'Gagal membaca arsip.', 6500);
  }
});

ui.namesInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
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
});

ui.searchInput.addEventListener('input', debounce(applyFilters, 130));
ui.typeFilter.addEventListener('change', applyFilters);
ui.loadMoreButton.addEventListener('click', renderNextPage);
ui.closeArchiveButton.addEventListener('click', resetArchive);
ui.extractButton.addEventListener('click', extractSelected);
ui.replacementInput.addEventListener('change', patchSelected);

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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

async function openArchive(file) {
  if (file.size < 16) throw new RPFError('File terlalu kecil untuk menjadi RPF6.');

  const headerBuffer = await file.slice(0, 16).arrayBuffer();
  const headerView = new DataView(headerBuffer);
  const magic = headerView.getUint32(0, false);
  if (magic !== MAGIC) throw new RPFError(`Magic RPF6 tidak valid: 0x${hex(magic)}.`);

  const entryCount = headerView.getUint32(4, false);
  const debugDataOffset = headerView.getInt32(8, false);
  const encryptionFlag = headerView.getInt32(12, false);
  if (entryCount > MAX_ENTRY_COUNT) throw new RPFError(`Jumlah entry tidak masuk akal: ${formatNumber(entryCount)}.`);
  if (encryptionFlag !== 0) throw new RPFError(`TOC terenkripsi (flag ${encryptionFlag}). Versi aman ini tidak melakukan dekripsi.`);

  const tocSize = roundUp(entryCount * TOC_ENTRY_SIZE, 16);
  if (16 + tocSize > file.size) throw new RPFError('TOC berada di luar ukuran file.');

  const tocBuffer = await file.slice(16, 16 + tocSize).arrayBuffer();
  const tocView = new DataView(tocBuffer);
  const rawEntries = new Array(entryCount);
  const parents = new Array(entryCount).fill(null);

  for (let index = 0; index < entryCount; index += 1) {
    const offset = index * TOC_ENTRY_SIZE;
    const nameHash = tocView.getUint32(offset, false);
    const second = tocView.getUint32(offset + 4, false);
    const third = tocView.getUint32(offset + 8, false);
    const fourth = tocView.getUint32(offset + 12, false);
    const fifth = tocView.getUint32(offset + 16, false);
    const isDirectory = (third & 0x80000000) !== 0;

    rawEntries[index] = isDirectory
      ? {
          index, nameHash, isDirectory: true,
          flags: second,
          childStart: third & 0x7fffffff,
          childCount: fourth & 0x0fffffff,
          unknown: fifth,
        }
      : createFileEntry(index, nameHash, second, third, fourth, fifth);
  }

  for (const entry of rawEntries) {
    if (!entry.isDirectory) continue;
    const end = entry.childStart + entry.childCount;
    if (entry.childStart > entryCount || end > entryCount) {
      throw new RPFError(`Rentang child direktori #${entry.index} tidak valid.`);
    }
    for (let child = entry.childStart; child < end; child += 1) {
      if (child !== entry.index) parents[child] = entry.index;
    }
  }

  rawEntries.forEach((entry, index) => { entry.parentIndex = parents[index]; });
  state.file = file;
  state.header = { entryCount, debugDataOffset, encryptionFlag, tocSize };
  state.entries = rawEntries;
  state.names.clear();

  updateArchiveUI();
  applyFilters();
}

function createFileEntry(index, nameHash, rawSize, encodedOffset, flag1, flag2) {
  const isResource = (flag1 & 0x80000000) !== 0;
  const extended = (flag2 & 0x80000000) !== 0;
  const archiveOffset = isResource
    ? (encodedOffset & 0x7fffff00) * 8
    : (encodedOffset & 0x7fffffff) * 8;

  return {
    index, nameHash, isDirectory: false,
    size: rawSize & 0x0fffffff,
    encodedOffset, archiveOffset, flag1, flag2,
    isResource,
    resourceType: isResource ? encodedOffset & 0xff : null,
    isCompressed: !isResource && !extended && (flag1 & 0x40000000) !== 0,
  };
}

function updateArchiveUI() {
  const fileEntries = state.entries.filter((entry) => !entry.isDirectory);
  const directoryEntries = state.entries.length - fileEntries.length;
  ui.archiveName.textContent = state.file.name;
  ui.archiveMeta.textContent = `${formatBytes(state.file.size)} • TOC ${formatBytes(state.header.tocSize)} • lokal di perangkat`;
  ui.entryCount.textContent = formatNumber(state.entries.length);
  ui.fileCount.textContent = formatNumber(fileEntries.length);
  ui.directoryCount.textContent = formatNumber(directoryEntries);
  ui.welcomeCard.hidden = true;
  ui.workspace.hidden = false;
}

function resetArchive() {
  state.file = null;
  state.header = null;
  state.entries = [];
  state.names.clear();
  state.filtered = [];
  state.renderedCount = 0;
  state.selectedIndex = null;
  ui.entryList.replaceChildren();
  ui.searchInput.value = '';
  ui.typeFilter.value = 'all';
  ui.workspace.hidden = true;
  ui.welcomeCard.hidden = false;
  if (ui.entryDialog.open) ui.entryDialog.close();
}

function applyFilters() {
  if (!state.file) return;
  const query = ui.searchInput.value.trim().toLowerCase();
  const filter = ui.typeFilter.value;

  state.filtered = state.entries.filter((entry) => {
    if (filter === 'file' && entry.isDirectory) return false;
    if (filter === 'directory' && !entry.isDirectory) return false;
    if (filter === 'resource' && (!entry.isResource || entry.isDirectory)) return false;
    if (filter === 'compressed' && (!entry.isCompressed || entry.isDirectory)) return false;
    if (!query) return true;
    const name = entryName(entry).toLowerCase();
    const path = entryPath(entry).toLowerCase();
    return name.includes(query) || path.includes(query) || `0x${hex(entry.nameHash)}`.toLowerCase().includes(query);
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

  for (let i = state.renderedCount; i < end; i += 1) {
    const entry = state.filtered[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entry-row';
    button.dataset.index = String(entry.index);
    button.setAttribute('role', 'listitem');

    const icon = document.createElement('span');
    icon.className = 'entry-icon';
    icon.textContent = entry.isDirectory ? '▰' : entry.isResource ? '◆' : '▤';

    const main = document.createElement('span');
    main.className = 'entry-main';
    const name = document.createElement('div');
    name.className = 'entry-name';
    name.textContent = entryName(entry);
    const path = document.createElement('div');
    path.className = 'entry-path';
    path.textContent = entryPath(entry);
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
  ui.detailName.textContent = entryName(entry);
  ui.detailPath.textContent = entryPath(entry);
  ui.detailGrid.replaceChildren();

  const rows = [
    ['Index', String(entry.index)],
    ['Hash', `0x${hex(entry.nameHash)}`],
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
    );
    ui.fileActions.hidden = false;
    ui.detailNote.textContent = `Pengganti harus sudah memakai format internal yang benar dan tidak lebih besar dari ${formatBytes(entry.size)}. Hasil disimpan sebagai salinan baru.`;
  }

  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    ui.detailGrid.append(dt, dd);
  }

  ui.entryDialog.showModal();
}

function extractSelected() {
  const entry = state.entries[state.selectedIndex];
  if (!state.file || !entry || entry.isDirectory) return;
  const end = entry.archiveOffset + entry.size;
  if (end > state.file.size) return showToast('Offset/ukuran entry berada di luar arsip.', 6000);
  const blob = state.file.slice(entry.archiveOffset, end);
  downloadBlob(blob, `${safeFilename(entryName(entry))}-raw.bin`);
  showToast('Ekstraksi raw dimulai.');
}

async function patchSelected(event) {
  const [replacement] = event.target.files;
  event.target.value = '';
  const entry = state.entries[state.selectedIndex];
  if (!replacement || !state.file || !entry || entry.isDirectory) return;
  if (replacement.size > 0x0fffffff) return showToast('File pengganti melebihi field ukuran 28-bit.', 6500);
  if (replacement.size > entry.size) return showToast(`Pengganti ${formatBytes(replacement.size)} lebih besar dari slot ${formatBytes(entry.size)}.`, 7000);

  try {
    showToast('Menyusun salinan patched…', 0);
    const sizeFieldOffset = 16 + entry.index * TOC_ENTRY_SIZE + 4;
    const payloadStart = entry.archiveOffset;
    const payloadEnd = payloadStart + entry.size;
    if (payloadEnd > state.file.size || sizeFieldOffset + 4 > payloadStart) {
      throw new RPFError('Layout entry tidak aman untuk patch in-place.');
    }

    const sizeBytes = new ArrayBuffer(4);
    new DataView(sizeBytes).setUint32(0, replacement.size, false);
    const padding = new Uint8Array(entry.size - replacement.size);
    const patched = new Blob([
      state.file.slice(0, sizeFieldOffset),
      sizeBytes,
      state.file.slice(sizeFieldOffset + 4, payloadStart),
      replacement,
      padding,
      state.file.slice(payloadEnd),
    ], { type: 'application/octet-stream' });

    const base = state.file.name.replace(/\.rpf$/i, '') || 'archive';
    downloadBlob(patched, `${safeFilename(base)}-patched.rpf`);
    showToast('Salinan patched siap disimpan. Arsip asli tidak berubah.', 6000);
  } catch (error) {
    showToast(error.message || 'Patch gagal.', 6500);
  }
}

function entryName(entry) {
  if (entry.isDirectory && entry.nameHash === 0) return 'root';
  return state.names.get(entry.nameHash) || `0x${hex(entry.nameHash)}`;
}

function entryPath(entry) {
  const components = [entryName(entry)];
  const visited = new Set();
  let parentIndex = entry.parentIndex;
  while (parentIndex !== null && state.entries[parentIndex] && !visited.has(parentIndex)) {
    visited.add(parentIndex);
    const parent = state.entries[parentIndex];
    components.push(entryName(parent));
    parentIndex = parent.parentIndex;
  }
  return components.reverse().join('/');
}

function joaat(value) {
  let hash = 0 >>> 0;
  for (const char of value.toLowerCase()) {
    hash = (hash + char.codePointAt(0)) >>> 0;
    hash = (hash + ((hash << 10) >>> 0)) >>> 0;
    hash = (hash ^ (hash >>> 6)) >>> 0;
  }
  hash = (hash + ((hash << 3) >>> 0)) >>> 0;
  hash = (hash ^ (hash >>> 11)) >>> 0;
  hash = (hash + ((hash << 15) >>> 0)) >>> 0;
  return hash >>> 0;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

let toastTimer;
function showToast(message, duration = 3500) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  if (duration > 0) toastTimer = setTimeout(() => { ui.toast.hidden = true; }, duration);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
function formatNumber(value) { return new Intl.NumberFormat('id-ID').format(value); }
function roundUp(value, multiple) { const remainder = value % multiple; return remainder === 0 ? value : value + multiple - remainder; }
function hex(value) { return (value >>> 0).toString(16).toUpperCase().padStart(8, '0'); }
function safeFilename(value) { return value.replace(/[\\/:?%*|"<>]/g, '_') || 'entry'; }
function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }
