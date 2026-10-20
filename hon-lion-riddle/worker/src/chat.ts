import { appendKnownInsight, isChatRequest, LION_REPLIES, normalizeInsight, sanitizeKnownInsights, type ChatRequest, type Outcome, type SafeTurn } from './contract';
import { askJev, JevError } from './jev';
import { demoOutcome } from './demo';
import { error, isJsonContentType, json, MAX_BODY_BYTES, readBoundedBody, sameOrigin } from './http';

export interface Env {
  ASSETS: Fetcher;
  TYPESAFE_API_KEY?: string;
  JEV_MODEL?: string;
  PROVISIONAL_SOLVED_CONFIDENCE?: string;
  HON_LION_MOUNT_ONLY?: string;
  HON_LION_DEMO?: string;
}

export function isLocalRequest(request: Request): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname);
}

export function isLocalDemoRequest(request: Request, env: Env): boolean {
  return env.HON_LION_DEMO === '1' && isLocalRequest(request) && new URL(request.url).searchParams.get('demo') === '1' && !env.TYPESAFE_API_KEY?.trim();
}

function canonicalizeOutcome(mode: ChatRequest['mode'], question: string, outcome: Outcome, knownInsights: SafeTurn[], solved: boolean): Outcome {
  const progress = outcome.reasoning_progress === 'SYNTHESIS' && !solved ? 'NONE' : outcome.reasoning_progress;
  const exactRepeat = mode === 'question' && knownInsights.some(insight => normalizeInsight(insight.player_message) === normalizeInsight(question));
  return { ...outcome, reasoning_progress: exactRepeat ? 'NONE' : progress };
}

export async function chat(request: Request, env: Env, originalRequest = request): Promise<Response> {
  if (request.method !== 'POST') return error('method_not_allowed', 405);
  if (!sameOrigin(originalRequest)) return error('origin_not_allowed', 403);
  if (!isJsonContentType(request)) return error('json_required', 415);
  let body: unknown;
  try {
    body = JSON.parse(await readBoundedBody(request, MAX_BODY_BYTES));
  } catch (caught) {
    const tooLarge = caught instanceof Error && caught.message === 'request_too_large';
    return error(tooLarge ? 'request_too_large' : 'invalid_json', tooLarge ? 413 : 400);
  }
  if (!isChatRequest(body)) return error('invalid_request', 400);
  const requestBody = body as ChatRequest;
  const knownInsights = sanitizeKnownInsights(requestBody.knownInsights);
  if (isLocalDemoRequest(originalRequest, env)) {
    const outcome = demoOutcome(requestBody.mode, requestBody.question, requestBody.recentTurns, knownInsights);
    const solved = requestBody.mode === 'final_theory' && outcome.choice === 'SOLVED';
    const canonicalOutcome = canonicalizeOutcome(requestBody.mode, requestBody.question, outcome, knownInsights, solved);
    const updatedInsights = appendKnownInsight(knownInsights, requestBody.question, canonicalOutcome);
    return json({ outcome: canonicalOutcome, reply: LION_REPLIES[canonicalOutcome.choice], reasoningProgress: canonicalOutcome.reasoning_progress, keyIssued: solved, knownInsights: updatedInsights, model: 'local-demo' });
  }
  if (!env.TYPESAFE_API_KEY?.trim()) return error('live_unavailable', 503);
  try {
    const { outcome, model } = await askJev(
      env.TYPESAFE_API_KEY.trim(), env.JEV_MODEL || 'jev-latest', requestBody.mode,
      requestBody.question, requestBody.recentTurns, undefined, knownInsights,
    );
    const configuredThreshold = Number(env.PROVISIONAL_SOLVED_CONFIDENCE || '.9');
    const threshold = Number.isFinite(configuredThreshold) && configuredThreshold >= .8 && configuredThreshold <= 1 ? configuredThreshold : .9;
    const solved = requestBody.mode === 'final_theory' && outcome.choice === 'SOLVED' && outcome.confidence >= threshold;
    const canonicalOutcomeWithRepeatGuard = canonicalizeOutcome(requestBody.mode, requestBody.question, outcome, knownInsights, solved);
    const updatedInsights = appendKnownInsight(knownInsights, requestBody.question, canonicalOutcomeWithRepeatGuard);
    return json({ outcome: canonicalOutcomeWithRepeatGuard, reply: LION_REPLIES[canonicalOutcomeWithRepeatGuard.choice], reasoningProgress: canonicalOutcomeWithRepeatGuard.reasoning_progress, keyIssued: solved, knownInsights: updatedInsights, model });
  } catch (caught) {
    const code = caught instanceof Error && caught.name === 'AbortError'
      ? 'upstream_timeout' : caught instanceof JevError ? caught.code : 'provider_unavailable';
    return error(code, 502);
  }
}
