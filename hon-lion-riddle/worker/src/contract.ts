export const CHOICES = ['YES','NO','IRRELEVANT','PARTIAL','SOLVED','NEEDS_CLARIFICATION'] as const;
export type Choice = typeof CHOICES[number];
export const LION_REPLIES: Record<Choice, string> = {
  YES: 'はい',
  NO: 'いいえ',
  IRRELEVANT: '関係ない',
  PARTIAL: 'はい',
  SOLVED: 'はい',
  NEEDS_CLARIFICATION: '関係ない',
};
export type ChatMode = 'question' | 'final_theory';
export const REASONING_PROGRESS = ['NONE','PARTIAL_INSIGHT','CAUSAL_LINK','SYNTHESIS'] as const;
export type ReasoningProgress = typeof REASONING_PROGRESS[number];
export const CHECKPOINT_IDS = ['cp1','cp2','cp3','cp4','cp5'] as const;
export type CheckpointId = typeof CHECKPOINT_IDS[number];
export const ORDINARY_CHECKPOINT_JUDGMENTS = ['CONFIRMED_BY_YES','CONFIRMED_BY_NO','UNCONFIRMED'] as const;
export type OrdinaryCheckpointJudgment = typeof ORDINARY_CHECKPOINT_JUDGMENTS[number];
export const FINAL_CHECKPOINT_JUDGMENTS = ['CONFIRMED','UNCONFIRMED'] as const;
export type FinalCheckpointJudgment = typeof FINAL_CHECKPOINT_JUDGMENTS[number];
export type CheckpointJudgments = Partial<Record<CheckpointId, OrdinaryCheckpointJudgment | FinalCheckpointJudgment>>;
export type SafeTurn = { player_message: string; turn_outcome?: { choice: Choice; confidence: number; reasoning_progress?: ReasoningProgress } };
export type ChatRequest = { mode: ChatMode; question: string; recentTurns?: SafeTurn[]; knownInsights?: SafeTurn[]; reachedCheckpointIds?: CheckpointId[] };
export type Outcome = { choice: Choice; confidence: number; reasoning_progress: ReasoningProgress; fact?: string; checkpointJudgments?: CheckpointJudgments };
export const MAX_MESSAGE_CHARS = 180;
export const MAX_TURNS = 6;
export const MAX_INSIGHTS = 4;
export const CHECKPOINT_CONFIDENCE_THRESHOLD = .9;
const POSITIVE_CHOICES = new Set<Choice>(['YES', 'PARTIAL', 'SOLVED']);

export function normalizeInsight(value: string): string {
  return value.normalize('NFKC').replace(/[？?。！!、，,\s]/g, '');
}

export function sanitizeReachedCheckpointIds(value: unknown): CheckpointId[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id, index): id is CheckpointId => typeof id === 'string' && CHECKPOINT_IDS.includes(id as CheckpointId) && value.indexOf(id) === index);
}

export function isCheckpointIdList(value: unknown): value is CheckpointId[] {
  return Array.isArray(value) && value.length <= CHECKPOINT_IDS.length && value.every((id) => typeof id === 'string' && CHECKPOINT_IDS.includes(id as CheckpointId));
}

function isSafeTurn(value: unknown, requirePositiveProgress = false): value is SafeTurn {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (typeof row.player_message !== 'string' || !row.player_message.trim() || row.player_message.length > MAX_MESSAGE_CHARS) return false;
  if (row.turn_outcome === undefined) return !requirePositiveProgress;
  if (!row.turn_outcome || typeof row.turn_outcome !== 'object') return false;
  const result = row.turn_outcome as Record<string, unknown>;
  if (typeof result.choice !== 'string' || !CHOICES.includes(result.choice as Choice) || typeof result.confidence !== 'number' || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) return false;
  if (result.reasoning_progress !== undefined && (typeof result.reasoning_progress !== 'string' || !REASONING_PROGRESS.includes(result.reasoning_progress as ReasoningProgress))) return false;
  return !requirePositiveProgress || (POSITIVE_CHOICES.has(result.choice as Choice) && result.reasoning_progress !== undefined && result.reasoning_progress !== 'NONE');
}

export function isChatRequest(value: unknown): value is ChatRequest {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  if ((body.mode !== 'question' && body.mode !== 'final_theory') || typeof body.question !== 'string') return false;
  if (!body.question.trim() || body.question.length > MAX_MESSAGE_CHARS) return false;
  if (body.recentTurns !== undefined && (!Array.isArray(body.recentTurns) || body.recentTurns.length > MAX_TURNS || !body.recentTurns.every((turn) => isSafeTurn(turn)))) return false;
  if (body.knownInsights !== undefined && (!Array.isArray(body.knownInsights) || body.knownInsights.length > MAX_INSIGHTS || !body.knownInsights.every((turn) => isSafeTurn(turn, true)))) return false;
  if (body.reachedCheckpointIds !== undefined && !isCheckpointIdList(body.reachedCheckpointIds)) return false;
  return true;
}

export function sanitizeTurns(turns: unknown): SafeTurn[] {
  if (!Array.isArray(turns)) return [];
  return turns.slice(-MAX_TURNS).flatMap((turn) => {
    if (!turn || typeof turn !== 'object') return [];
    const row = turn as Record<string, unknown>;
    if (typeof row.player_message !== 'string') return [];
    const player_message = row.player_message.slice(0, MAX_MESSAGE_CHARS);
    const raw = row.turn_outcome;
    if (!raw || typeof raw !== 'object') return [{ player_message }];
    const result = raw as Record<string, unknown>;
    const choice = typeof result.choice === 'string' && CHOICES.includes(result.choice as Choice) ? result.choice as Choice : undefined;
    const confidence = typeof result.confidence === 'number' && Number.isFinite(result.confidence) ? Math.max(0, Math.min(1, result.confidence)) : undefined;
    const reasoning_progress = typeof result.reasoning_progress === 'string' && REASONING_PROGRESS.includes(result.reasoning_progress as ReasoningProgress) ? result.reasoning_progress as ReasoningProgress : undefined;
    return choice && confidence !== undefined ? [{ player_message, turn_outcome: { choice, confidence, ...(reasoning_progress ? { reasoning_progress } : {}) } }] : [{ player_message }];
  });
}

export function sanitizeKnownInsights(insights: unknown): SafeTurn[] {
  if (!Array.isArray(insights)) return [];
  return insights.slice(0, MAX_INSIGHTS).flatMap((insight) => {
    if (!isSafeTurn(insight, true)) return [];
    const row = insight as SafeTurn;
    const result = row.turn_outcome!;
    return [{ player_message: row.player_message.slice(0, MAX_MESSAGE_CHARS), turn_outcome: { choice: result.choice, confidence: result.confidence, reasoning_progress: result.reasoning_progress } }];
  });
}

export function appendKnownInsight(insights: SafeTurn[], playerMessage: string, outcome: Outcome): SafeTurn[] {
  if (!POSITIVE_CHOICES.has(outcome.choice) || outcome.reasoning_progress === 'NONE' || insights.length >= MAX_INSIGHTS) return insights.slice(0, MAX_INSIGHTS);
  const normalized = normalizeInsight(playerMessage);
  if (!normalized || insights.some((insight) => normalizeInsight(insight.player_message) === normalized)) return insights.slice(0, MAX_INSIGHTS);
  return [...insights, { player_message: playerMessage.slice(0, MAX_MESSAGE_CHARS), turn_outcome: { choice: outcome.choice, confidence: outcome.confidence, reasoning_progress: outcome.reasoning_progress } }];
}

function normalizeProgress(value: unknown, mode: ChatMode, choice: Choice): ReasoningProgress {
  if (choice === 'NO' || choice === 'IRRELEVANT' || choice === 'NEEDS_CLARIFICATION') return 'NONE';
  if (typeof value !== 'string' || !REASONING_PROGRESS.includes(value as ReasoningProgress)) return 'NONE';
  const progress = value as ReasoningProgress;
  if (progress === 'SYNTHESIS') return mode === 'final_theory' && choice === 'SOLVED' ? progress : 'NONE';
  if (progress === 'CAUSAL_LINK') return choice === 'YES' || choice === 'PARTIAL' ? progress : 'NONE';
  if (progress === 'PARTIAL_INSIGHT') return choice === 'YES' || choice === 'PARTIAL' ? progress : 'NONE';
  return 'NONE';
}

export function parseOutcome(payload: unknown, mode: ChatMode = 'question'): Outcome | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const answers = root.answers && typeof root.answers === 'object' ? root.answers as Record<string, unknown> : root;
  const raw = answers.turn_outcome;
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const choice = typeof row.choice === 'string' && CHOICES.includes(row.choice as Choice) ? row.choice as Choice : null;
  const confidence = typeof row.confidence === 'number' && Number.isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 1 ? row.confidence : null;
  if (!choice || confidence === null) return null;
  const progressRow = answers.reasoning_progress;
  const progressChoice = progressRow && typeof progressRow === 'object' ? (progressRow as Record<string, unknown>).choice : undefined;
  const checkpointJudgments: CheckpointJudgments = {};
  if ((choice === 'YES' || choice === 'NO') && confidence >= CHECKPOINT_CONFIDENCE_THRESHOLD) {
    for (const id of CHECKPOINT_IDS) {
      const rawJudgment = answers[id];
      if (!rawJudgment || typeof rawJudgment !== 'object') continue;
      const judgmentRow = rawJudgment as Record<string, unknown>;
      if (judgmentRow.type !== 'choice' || typeof judgmentRow.confidence !== 'number' || !Number.isFinite(judgmentRow.confidence) || judgmentRow.confidence < CHECKPOINT_CONFIDENCE_THRESHOLD || judgmentRow.confidence > 1) continue;
      const judgment = judgmentRow.choice;
      if (typeof judgment !== 'string' || !ORDINARY_CHECKPOINT_JUDGMENTS.includes(judgment as OrdinaryCheckpointJudgment)) continue;
      if (judgment === 'CONFIRMED_BY_YES' && choice !== 'YES') continue;
      if (judgment === 'CONFIRMED_BY_NO' && choice !== 'NO') continue;
      checkpointJudgments[id] = judgment as OrdinaryCheckpointJudgment;
    }
  }
  return { choice, confidence, reasoning_progress: normalizeProgress(progressChoice, mode, choice), ...(Object.keys(checkpointJudgments).length ? { checkpointJudgments } : {}) };
}
