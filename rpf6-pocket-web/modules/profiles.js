export const ENHANCEMENT_PROFILES = Object.freeze([
  {
    id: 'iphone11-balanced',
    name: 'iPhone 11 Balanced',
    badge: 'Direkomendasikan',
    description: 'Peningkatan selektif dengan fokus kestabilan, suhu, dan penggunaan memori.',
    target: { device: 'iPhone 11', fps: 30, thermalBudget: 'sedang' },
    texture: { maxUpscale: 1.25, sharpen: 0.18, normalStrength: 1.08, mipmaps: 'wajib' },
    lighting: { exposureBias: 0.0, contrast: 1.04, shadowLift: 0.02, highlightRollOff: 0.92 },
    shader: { complexity: 'asli', expensiveEffects: false, precision: 'asli' },
    limits: { replaceOnlyVisibleAssets: true, keepArchiveGrowthPercent: 8 },
  },
  {
    id: 'iphone11-detail',
    name: 'iPhone 11 Detail+',
    badge: 'Eksperimental',
    description: 'Detail texture lebih agresif pada karakter, senjata, jalan, dan objek dekat kamera.',
    target: { device: 'iPhone 11', fps: 30, thermalBudget: 'tinggi' },
    texture: { maxUpscale: 1.5, sharpen: 0.24, normalStrength: 1.12, mipmaps: 'wajib' },
    lighting: { exposureBias: 0.0, contrast: 1.05, shadowLift: 0.015, highlightRollOff: 0.9 },
    shader: { complexity: 'asli', expensiveEffects: false, precision: 'asli' },
    limits: { replaceOnlyVisibleAssets: true, keepArchiveGrowthPercent: 15 },
  },
  {
    id: 'iphone11-cinematic',
    name: 'iPhone 11 Cinematic',
    badge: 'Color-first',
    description: 'Menjaga resolusi asset dan memprioritaskan tone, highlight, shadow, serta atmosfer.',
    target: { device: 'iPhone 11', fps: 30, thermalBudget: 'rendah-sedang' },
    texture: { maxUpscale: 1.0, sharpen: 0.12, normalStrength: 1.05, mipmaps: 'wajib' },
    lighting: { exposureBias: -0.05, contrast: 1.06, shadowLift: 0.025, highlightRollOff: 0.86 },
    shader: { complexity: 'asli', expensiveEffects: false, precision: 'asli' },
    limits: { replaceOnlyVisibleAssets: true, keepArchiveGrowthPercent: 5 },
  },
]);

export const PIPELINE_MODULES = Object.freeze([
  {
    id: 'archive-diagnostics',
    name: 'Archive Diagnostics',
    status: 'ready',
    description: 'Header, flag enkripsi, entropy sample, fingerprint, dan laporan JSON.',
  },
  {
    id: 'archive-browser',
    name: 'RPF6 Archive Browser',
    status: 'ready-unencrypted',
    description: 'Daftar entry, path, hash, offset, resource flag, dan ekstraksi raw.',
  },
  {
    id: 'slot-patcher',
    name: 'Safe Slot Patcher',
    status: 'ready-unencrypted',
    description: 'Mengganti payload berukuran sama atau lebih kecil tanpa menimpa arsip asli.',
  },
  {
    id: 'archive-rebuilder',
    name: 'Full Archive Rebuilder',
    status: 'planned',
    description: 'Relayout entry, alignment, offset, dan validasi untuk payload yang lebih besar.',
  },
  {
    id: 'texture-adapter',
    name: 'Texture Adapter',
    status: 'needs-sample',
    description: 'Deteksi texture, preview mipmap, ekspor/impor, dan encode ulang.',
  },
  {
    id: 'lighting-adapter',
    name: 'Lighting Adapter',
    status: 'needs-sample',
    description: 'Konfigurasi exposure, ambient, shadow, fog, timecycle, atau LUT jika format ditemukan.',
  },
  {
    id: 'shader-adapter',
    name: 'Shader Metadata Adapter',
    status: 'research',
    description: 'Inventaris shader/material dan parameter aman; bukan injeksi kode ke aplikasi.',
  },
]);

export function getProfile(profileId) {
  return ENHANCEMENT_PROFILES.find((profile) => profile.id === profileId) || ENHANCEMENT_PROFILES[0];
}
