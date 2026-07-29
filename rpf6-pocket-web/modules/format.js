export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(value);
}

export function formatDecimal(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function roundUp(value, multiple) {
  const remainder = value % multiple;
  return remainder === 0 ? value : value + multiple - remainder;
}

export function hex32(value) {
  return (value >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function bytesToHex(bytes, columns = 16) {
  const rows = [];
  for (let offset = 0; offset < bytes.length; offset += columns) {
    const chunk = bytes.slice(offset, offset + columns);
    const hex = Array.from(chunk, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    rows.push(`${offset.toString(16).toUpperCase().padStart(4, '0')}  ${hex}`);
  }
  return rows.join('\n');
}

export function safeFilename(value) {
  return String(value || 'file').replace(/[\\/:?%*|"<>]/g, '_') || 'file';
}

export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function downloadBlob(blob, filename) {
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

export function downloadJSON(value, filename) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  downloadBlob(blob, filename);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
