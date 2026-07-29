import { PROJECT_SCHEMA_VERSION } from './constants.js';
import { getProfile } from './profiles.js';

export const DEFAULT_GOALS = Object.freeze({
  textures: true,
  lighting: true,
  shaders: false,
  environment: true,
  performance: true,
});

export function createEnhancementProject({ diagnostic, profileId, goals = DEFAULT_GOALS, notes = '' }) {
  const profile = getProfile(profileId);
  const now = new Date().toISOString();
  return {
    schema: 'rdr-mobile-enhancement-project',
    schemaVersion: PROJECT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    sourceArchive: diagnostic ? {
      name: diagnostic.archive.name,
      size: diagnostic.archive.size,
      sampleFingerprintSha256: diagnostic.archive.sampleFingerprintSha256,
      encryptionFlag: diagnostic.header.encryptionFlag,
      encrypted: diagnostic.header.encrypted,
      entryCount: diagnostic.header.entryCount,
    } : null,
    target: {
      game: 'Red Dead Redemption Mobile',
      device: profile.target.device,
      profileId: profile.id,
    },
    goals: normalizeGoals(goals),
    profile,
    notes: String(notes || '').trim(),
    state: {
      phase: 'research-and-planning',
      generatedAssets: [],
      appliedChanges: [],
    },
    safety: {
      requiresUserOwnedFiles: true,
      decryptsArchives: false,
      modifiesInstalledAppContainer: false,
      preservesOriginalArchive: true,
    },
  };
}

export function normalizeProject(project) {
  if (!project || project.schema !== 'rdr-mobile-enhancement-project') {
    throw new Error('File proyek bukan format RDR Mobile Enhancement Project.');
  }
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Versi proyek ${project.schemaVersion} belum didukung.`);
  }
  const profile = getProfile(project.target?.profileId);
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    target: {
      game: 'Red Dead Redemption Mobile',
      device: profile.target.device,
      profileId: profile.id,
    },
    profile,
    goals: normalizeGoals(project.goals),
    notes: String(project.notes || ''),
  };
}

function normalizeGoals(goals) {
  return {
    textures: Boolean(goals?.textures),
    lighting: Boolean(goals?.lighting),
    shaders: Boolean(goals?.shaders),
    environment: Boolean(goals?.environment),
    performance: Boolean(goals?.performance),
  };
}
