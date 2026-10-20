// Test-only local Worker responses. These fixtures never ship in the public app.
const normalize = value => String(value || '').replace(/[？?。！!\s]/g, '');
const QUESTIONS = new Map([
  ['虫ですか', ['YES','NONE']],
  ['ここは幻覚ですか', ['YES','PARTIAL_INSIGHT','world']],
  ['この洋館は幻覚ですか', ['YES','PARTIAL_INSIGHT','world']],
  ['病院で自分の耳の中を映すカメラ映像ですか', ['YES','PARTIAL_INSIGHT','viewpoint']],
  ['音の主は人間ですか', ['NO','NONE']],
  ['心地よい音は虫と無関係ですか', ['NO','NONE']],
  ['耳に入った虫が自分の脳を食べていますか', ['YES','PARTIAL_INSIGHT','threat']],
  ['この洋館は幻覚で、自分の耳のカメラ映像ですか', ['YES','CAUSAL_LINK','world:viewpoint']],
  ['心地よい音は虫が自分の脳を食べる音ですか', ['YES','CAUSAL_LINK','threat:sound']],
]);
const COMPLETE = new Set([
  normalize('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。'),
  normalize('洋館は幻覚で、耳に入った虫が自分の脳を食べており、心地よい音はその捕食音だ。'),
  normalize('館は幻覚。これは俺の耳の中のカメラ映像で、虫が脳を食ってる音がしている'),
  normalize('洋館は幻覚で、映像は自分の耳の中を映すカメラのもの。耳に入った虫が自分の脳を食べており、心地よい音はその捕食音だ。'),
]);
// Exact examples only: these fixtures test transport/state, not language quality.
const CHECKPOINT_EXAMPLES = new Map([
  ['ここは幻覚ですか', ['cp1']],
  ['この洋館は幻覚ですか', ['cp1']],
  ['音も幻覚ですか', ['cp2']],
  ['音は幻覚ですか', ['cp2']],
  ['音は自分の耳の中から聞こえますか', ['cp3']],
  ['音を出しているのは自分ですか', ['cp4']],
  ['音を生む出来事が認知機能を低下させていますか', ['cp5']],
  ['見ている洋館は幻覚で、聞こえる音は現実の音ですか', ['cp1','cp2']],
]);
for (const [question, choice] of [
  ['音も幻覚ですか','NO'], ['音は幻覚ですか','NO'],
  ['音は自分の耳の中から聞こえますか','YES'],
  ['音を出しているのは自分ですか','NO'],
  ['音を生む出来事が認知機能を低下させていますか','YES'],
  ['見ている洋館は幻覚で、聞こえる音は現実の音ですか','YES'],
]) QUESTIONS.set(question, [choice, 'NONE']);
export function mockJudge(mode, text, recentTurns = []) {
  const value = normalize(text);
  if (mode === 'final_theory') {
    if (COMPLETE.has(value)) return { choice:'SOLVED', confidence:1, reasoning_progress:'SYNTHESIS', keyIssued:true };
    if (value === '耳に虫がいる') return { choice:'PARTIAL', confidence:1, reasoning_progress:'PARTIAL_INSIGHT', keyIssued:false };
    if (value === '虫が脳を食べているわけではない') return { choice:'NO', confidence:1, reasoning_progress:'NONE', keyIssued:false };
  } else if (QUESTIONS.has(value)) {
    const [choice, progress, facts = ''] = QUESTIONS.get(value);
    const known = new Set(recentTurns.filter(turn => turn.turn_outcome?.choice === 'YES').flatMap(turn => QUESTIONS.get(normalize(turn.player_message))?.[2]?.split(':') || []));
    const fresh = facts.split(':').filter(fact => fact && !known.has(fact));
    const reasoning_progress = progress === 'NONE' || !fresh.length ? 'NONE' : fresh.length > 1 ? 'CAUSAL_LINK' : 'PARTIAL_INSIGHT';
    return { choice, confidence:1, reasoning_progress, keyIssued:false };
  }
  return { choice:'IRRELEVANT', confidence:1, reasoning_progress:'NONE', keyIssued:false };
}

export function mockWorkerResponse(_url, options) {
  const body = JSON.parse(options?.body || '{}');
  const outcome = mockJudge(body.mode, body.question, body.recentTurns);
  const knownInsights = Array.isArray(body.knownInsights) ? body.knownInsights.slice(0,4) : [];
  if (outcome.reasoning_progress !== 'NONE' && ['YES','PARTIAL','SOLVED'].includes(outcome.choice) && knownInsights.length < 4 && !knownInsights.some(insight => normalize(insight.player_message) === normalize(body.question))) {
    knownInsights.push({ player_message: body.question, turn_outcome: { choice: outcome.choice, confidence: outcome.confidence, reasoning_progress: outcome.reasoning_progress } });
  }
  const prior = new Set(body.reachedCheckpointIds || []);
  const confirmed = body.mode === 'question' ? CHECKPOINT_EXAMPLES.get(normalize(body.question)) || [] : [];
  const newlyReachedCheckpointIds = confirmed.filter(id => !prior.has(id));
  const reachedCheckpointIds = [...new Set([...prior, ...confirmed])];
  return Promise.resolve({ ok: true, json: async () => ({ outcome, knownInsights, reachedCheckpointIds, newlyReachedCheckpointIds, keyIssued: outcome.keyIssued, reply: outcome.choice === 'NO' ? 'いいえ' : outcome.choice === 'IRRELEVANT' ? '関係ない' : 'はい', model: 'test-worker' }) });
}
