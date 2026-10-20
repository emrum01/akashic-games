import type { ChatMode, Choice, Outcome, ReasoningProgress, SafeTurn } from './contract';

// Local-only Worker fixture. HON_LION_DEMO is never set by staging or production.
const normalize = (value: unknown) => String(value || '').replace(/[？?。！!\s]/g, '');
type DemoQuestion = readonly [Choice, ReasoningProgress, string?];
const QUESTIONS = new Map<string, DemoQuestion>([
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

export function demoOutcome(mode: ChatMode, text: string, recentTurns: SafeTurn[] = [], knownInsights: SafeTurn[] = []): Outcome {
  const value = normalize(text);
  if (mode === 'final_theory') {
    if (COMPLETE.has(value)) return { choice:'SOLVED', confidence:1, reasoning_progress:'SYNTHESIS' };
    if (value === '耳に虫がいる') return { choice:'PARTIAL', confidence:1, reasoning_progress:'PARTIAL_INSIGHT' };
    if (value === '虫が脳を食べているわけではない') return { choice:'NO', confidence:1, reasoning_progress:'NONE' };
  } else if (QUESTIONS.has(value)) {
    const [choice, progress, facts = ''] = QUESTIONS.get(value) as DemoQuestion;
    const known = new Set([...recentTurns, ...knownInsights].filter(turn => turn.turn_outcome?.choice === 'YES').flatMap(turn => QUESTIONS.get(normalize(turn.player_message))?.[2]?.split(':') || []));
    const fresh = facts.split(':').filter(fact => fact && !known.has(fact));
    return { choice, confidence:1, reasoning_progress: progress === 'NONE' || !fresh.length ? 'NONE' : fresh.length > 1 ? 'CAUSAL_LINK' : 'PARTIAL_INSIGHT' };
  }
  return { choice:'IRRELEVANT', confidence:1, reasoning_progress:'NONE' };
}
