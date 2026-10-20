import { error, json } from './http';

export interface RateLimitEnv {
  CHAT_RATE_LIMITER?: RateLimit;
  HON_LION_REQUIRE_RATE_LIMIT?: string;
}

export function rateLimitReady(env: RateLimitEnv): boolean {
  return env.HON_LION_REQUIRE_RATE_LIMIT !== '1' || Boolean(env.CHAT_RATE_LIMITER);
}

// Both chat aliases share a counter. Only Cloudflare's client address is trusted;
// user-supplied forwarding headers and request fields never choose the key.
export async function enforceChatRateLimit(request: Request, env: RateLimitEnv): Promise<Response | null> {
  if (env.HON_LION_REQUIRE_RATE_LIMIT !== '1') return null;

  const limiter = env.CHAT_RATE_LIMITER;
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (!limiter || !ip) return error('rate_limit_unavailable', 503);

  try {
    const { success } = await limiter.limit({ key: `hon-lion-chat:${ip}` });
    return success ? null : json({ error: 'rate_limited' }, 429, { 'retry-after': '60' });
  } catch {
    return error('rate_limit_unavailable', 503);
  }
}
