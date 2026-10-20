import { CHECKPOINT_STEP_IDS } from './checkpoint-progress.js';

// Cut order agreed on 2026-10-21. IDs describe ordinal procedures, never a
// particular understanding. The media names are the stable keys in
// assets/video/checkpoint-manifest.json.
export const CHECKPOINT_CUTS = Object.freeze([
  Object.freeze({ id: 'step1', from: 'hall', to: 'entrance', segments: [Object.freeze({ clip: 'hall-entrance', poster: 'entrance', action: 'continue' })] }),
  Object.freeze({ id: 'step2', from: 'entrance', to: 'rear-door', segments: [Object.freeze({ clip: 'entrance-rear-door', poster: 'rear-door-locked', action: 'continue' })] }),
  Object.freeze({ id: 'step3', from: 'rear-door', to: 'cross', segments: [
    Object.freeze({ clip: 'rear-door-cross', poster: 'cross' }),
    Object.freeze({ clip: 'cross-key', poster: 'cabinet-key', action: 'cabinet-key' }),
  ] }),
  Object.freeze({ id: 'step4', from: 'cross', to: 'armed', segments: [
    Object.freeze({ clip: 'key-cabinet', poster: 'cabinet', action: 'unlock-cabinet' }),
    Object.freeze({ clip: 'cabinet-open', poster: 'cabinet-open', action: 'take-gun' }),
    Object.freeze({ clip: 'cabinet-take', poster: 'gun-held', action: 'stow-gun' }),
    Object.freeze({ clip: 'cabinet-stow', poster: 'gun-stowed', action: 'take-door-key' }),
    Object.freeze({ clip: 'cabinet-door-key', poster: 'armed' }),
  ] }),
  Object.freeze({ id: 'step5', from: 'armed', to: 'rear-door-ready', segments: [Object.freeze({ clip: 'cabinet-rear-door', poster: 'rear-door-ready', action: 'continue' })] }),
]);

// A binding is now a media procedure. It remains explicit so an absent
// checkpoint manifest cannot silently turn a cut into a successful no-op.
export const CHECKPOINT_PROCEDURES = Object.freeze(
  Object.fromEntries(CHECKPOINT_CUTS.map(cut => [cut.id, cut])),
);

export function createCheckpointStepRunner({ procedures = CHECKPOINT_PROCEDURES, arrive }) {
  return async (stepId, context = {}) => {
    const { signal } = context;
    if (signal?.aborted) return { completed: false, cancelled: true };
    const procedure = Object.hasOwn(procedures, stepId) ? procedures[stepId] : null;
    if (!procedure) return { completed: false, reason: 'unassigned' };
    const result = await arrive(procedure, context);
    if (signal?.aborted || result?.cancelled) return { completed: false, cancelled: true };
    // The arrival adapter, including any finite media fallback, owns this ACK.
    return result?.completed === true
      ? { ...result, completed: true }
      : { completed: false, reason: result?.reason || 'arrival_unconfirmed' };
  };
}
