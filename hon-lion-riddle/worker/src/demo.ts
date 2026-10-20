import type { ChatMode, CheckpointJudgments, Choice, Outcome, ReasoningProgress, SafeTurn } from './contract';

// Local-only Worker fixture. HON_LION_DEMO is never set by staging or production.
const normalize = (value: unknown) => String(value || '').replace(/[？?。！!\s]/g, '');
type DemoQuestion = readonly [Choice, ReasoningProgress, string?, CheckpointJudgments?];
const QUESTIONS = new Map<string, DemoQuestion>([
  ['虫ですか', ['YES','NONE']],
  ['ここは幻覚ですか', ['YES','PARTIAL_INSIGHT','world',{ cp1:'CONFIRMED_BY_YES' }]],
  ['この洋館は幻覚ですか', ['YES','PARTIAL_INSIGHT','world',{ cp1:'CONFIRMED_BY_YES' }]],
  ['病院で自分の耳の中を映すカメラ映像ですか', ['YES','PARTIAL_INSIGHT','viewpoint']],
  ['音の主は人間ですか', ['NO','NONE']],
  ['音も幻覚ですか', ['NO','NONE',undefined,{ cp2:'CONFIRMED_BY_NO' }]],
  ['音は幻覚ですか', ['NO','NONE',undefined,{ cp2:'CONFIRMED_BY_NO' }]],
  ['心地よい音は虫と無関係ですか', ['NO','NONE']],
  ['音は自分の耳の中から聞こえますか', ['YES','PARTIAL_INSIGHT',undefined,{ cp3:'CONFIRMED_BY_YES' }]],
  ['音を出しているのは自分ですか', ['NO','NONE',undefined,{ cp4:'CONFIRMED_BY_NO' }]],
  ['耳に入った虫が自分の脳を食べていますか', ['YES','PARTIAL_INSIGHT','threat']],
  ['音を出す虫が脳を弱らせていますか', ['YES','PARTIAL_INSIGHT',undefined,{ cp5:'CONFIRMED_BY_YES' }]],
  ['音を生む出来事が認知機能を低下させていますか', ['YES','PARTIAL_INSIGHT',undefined,{ cp5:'CONFIRMED_BY_YES' }]],
  ['音を聞くから脳が弱るのですか', ['NO','NONE']],
  ['見ている洋館は幻覚で、聞こえる音は現実の音ですか', ['YES','NONE',undefined,{ cp1:'CONFIRMED_BY_YES', cp2:'CONFIRMED_BY_YES' }]],
  ['この洋館は幻覚で、自分の耳のカメラ映像ですか', ['YES','CAUSAL_LINK','world:viewpoint',{ cp1:'CONFIRMED_BY_YES' }]],
  ['心地よい音は虫が自分の脳を食べる音ですか', ['YES','CAUSAL_LINK','threat:sound',{ cp2:'CONFIRMED_BY_YES', cp3:'CONFIRMED_BY_YES', cp4:'CONFIRMED_BY_YES' }]],
]);
const COMPLETE = new Set([
  normalize('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。'),
  normalize('洋館は幻覚で、耳に入った虫が自分の脳を食べており、心地よい音はその捕食音だ。'),
  normalize('館は幻覚。これは俺の耳の中のカメラ映像で、虫が脳を食ってる音がしている'),
  normalize('洋館は幻覚で、映像は自分の耳の中を映すカメラのもの。耳に入った虫が自分の脳を食べており、心地よい音はその捕食音だ。'),
]);
const ALL_CHECKPOINTS_WITHOUT_SOLUTION = normalize('洋館は幻覚で、音は幻覚ではなく耳の中から聞こえ、自分は音を出しておらず、音を出す虫が認知機能を低下させている。');
const ALL_CHECKPOINTS_WITHOUT_SOLUTION_GENERIC = normalize('洋館は幻覚で、音は幻覚ではなく耳の中から聞こえ、自分は音を出しておらず、音を生む出来事が認知機能を低下させている。');

export function demoOutcome(mode: ChatMode, text: string, recentTurns: SafeTurn[] = [], knownInsights: SafeTurn[] = []): Outcome {
  const value = normalize(text);
  if (mode === 'final_theory') {
    if (COMPLETE.has(value)) return { choice:'SOLVED', confidence:1, reasoning_progress:'SYNTHESIS' };
    if (value === ALL_CHECKPOINTS_WITHOUT_SOLUTION || value === ALL_CHECKPOINTS_WITHOUT_SOLUTION_GENERIC) {
      return {
        choice:'PARTIAL', confidence:1, reasoning_progress:'PARTIAL_INSIGHT',
        checkpointJudgments: { cp1:'CONFIRMED', cp2:'CONFIRMED', cp3:'CONFIRMED', cp4:'CONFIRMED', cp5:'CONFIRMED' },
      };
    }
    if (value === '耳に虫がいる') return { choice:'PARTIAL', confidence:1, reasoning_progress:'PARTIAL_INSIGHT' };
    if (value === '虫が脳を食べているわけではない') return { choice:'NO', confidence:1, reasoning_progress:'NONE' };
  } else if (QUESTIONS.has(value)) {
    const [choice, progress, facts = '', checkpointJudgments] = QUESTIONS.get(value) as DemoQuestion;
    // knownInsights is compatibility/context only. It must never grant or suppress
    // checkpoint progress; each turn is graded from its own bounded fixture.
    const known = new Set([...recentTurns, ...knownInsights].filter(turn => turn.turn_outcome?.choice === 'YES').flatMap(turn => QUESTIONS.get(normalize(turn.player_message))?.[2]?.split(':') || []));
    const fresh = facts.split(':').filter(fact => fact && !known.has(fact));
    return { choice, confidence:1, reasoning_progress: progress === 'NONE' || !fresh.length ? 'NONE' : fresh.length > 1 ? 'CAUSAL_LINK' : 'PARTIAL_INSIGHT', ...(checkpointJudgments ? { checkpointJudgments } : {}) };
  }
  return { choice:'IRRELEVANT', confidence:1, reasoning_progress:'NONE' };
}
