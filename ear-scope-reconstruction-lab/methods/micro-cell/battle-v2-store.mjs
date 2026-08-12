import {
  applyBattleV2Command,
  canonicalBattleV2Serialize,
  createBattleV2State,
  hashBattleV2Transcript
} from "./battle-system-v2.mjs";

const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};

export const BATTLE_V2_STORAGE_KEY = "micro-cell:battle-v2:v1";

export function createBattleV2Store({
  initialState = createBattleV2State(),
  onChange = () => {},
  onEvent = () => {},
  runEffect = () => {}
} = {}) {
  let state = initialState;
  let transcript = [];

  function dispatch(input) {
    const result = applyBattleV2Command(state, input);
    if (result.state === state) return freeze({ state, events: [], effects: [] });
    transcript = [...transcript, freeze(structuredClone(input))];
    state = result.state;
    for (const event of result.events) onEvent(event, state);
    for (const effect of result.effects) runEffect(effect, state, transcript);
    onChange(state);
    return result;
  }

  function serialize() {
    return canonicalBattleV2Serialize({
      schema: state.schema,
      transcript,
      transcriptHash: hashBattleV2Transcript(transcript),
      state
    });
  }

  return freeze({
    dispatch,
    getState: () => state,
    getTranscript: () => freeze(structuredClone(transcript)),
    getTranscriptHash: () => hashBattleV2Transcript(transcript),
    serialize
  });
}
