import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnhancementProject, normalizeProject } from '../modules/project.js';

test('creates a safe iPhone 11 enhancement blueprint', () => {
  const project = createEnhancementProject({
    diagnostic: null,
    profileId: 'iphone11-balanced',
    goals: { textures: true, lighting: true, shaders: false, environment: true, performance: true },
    notes: 'Prioritaskan lighting senja.',
  });
  assert.equal(project.target.device, 'iPhone 11');
  assert.equal(project.profile.texture.maxUpscale, 1.25);
  assert.equal(project.safety.decryptsArchives, false);
  assert.equal(project.notes, 'Prioritaskan lighting senja.');
});

test('rejects unknown project schema', () => {
  assert.throws(() => normalizeProject({ schema: 'other', schemaVersion: 1 }), /bukan format/);
});
