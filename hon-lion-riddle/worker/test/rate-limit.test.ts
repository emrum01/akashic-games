import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';

const host = 'https://hon-lion.example';
const body = { mode: 'question', question: 'ここは幻覚ですか？' };
function request(path = '/turtle-soup/manor/api/chat', headers: Record<string, string> = {}, value: unknown = body) {
  return new Request(host + path, {
    method: 'POST',
    headers: { origin: host, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1', ...headers },
    body: JSON.stringify(value),
  });
}
function env(limit = vi.fn(async (_options: { key: string }) => ({ success: true }))): Env {
  return { ASSETS: { fetch: vi.fn() } as unknown as Fetcher, TYPESAFE_API_KEY: 'test-key',
    HON_LION_REQUIRE_RATE_LIMIT: '1', CHAT_RATE_LIMITER: { limit } };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('public chat usage boundary', () => {
  it('rejects excess requests before JEV and supplies a retry delay', async () => {
    const provider = vi.fn(); vi.stubGlobal('fetch', provider);
    const bindings = env(vi.fn(async () => ({ success: false })));
    const response = await worker.fetch(request(), bindings);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'rate_limited' });
    expect(provider).not.toHaveBeenCalled();
  });

  it('fails closed for absent binding, absent client address and limiter errors', async () => {
    const provider = vi.fn(); vi.stubGlobal('fetch', provider);
    const missing = env(); delete missing.CHAT_RATE_LIMITER;
    const failing = env(vi.fn(async () => { throw new Error('private diagnostic'); }));
    for (const [req, bindings] of [[request(), missing], [request(undefined, { 'cf-connecting-ip': '' }), env()], [request(), failing]] as const) {
      const response = await worker.fetch(req, bindings);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'rate_limit_unavailable' });
    }
    expect(provider).not.toHaveBeenCalled();
    const status = await worker.fetch(new Request(host + '/turtle-soup/manor/api/status'), missing);
    expect(await status.json()).toMatchObject({ configured: false });
  });

  it('uses one trusted-IP key across both aliases and invokes JEV when allowed', async () => {
    const provider = vi.fn(async () => new Response(JSON.stringify({
      model: 'jev-test', answers: {
        turn_outcome: { type: 'choice', choice: 'YES', confidence: .98 },
        reasoning_progress: { type: 'choice', choice: 'PARTIAL_INSIGHT', confidence: .98 },
      },
    }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', provider);
    const limit = vi.fn(async (_options: { key: string }) => ({ success: true }));
    for (const path of ['/api/hon-lion/chat', '/turtle-soup/manor/api/chat']) {
      const response = await worker.fetch(request(path, { 'x-forwarded-for': '203.0.113.99' }), env(limit));
      expect(response.status).toBe(200);
    }
    expect(limit.mock.calls).toEqual([[{ key: 'hon-lion-chat:192.0.2.1' }], [{ key: 'hon-lion-chat:192.0.2.1' }]]);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('does not use forwarding headers when the Cloudflare address is absent', async () => {
    const provider = vi.fn(); vi.stubGlobal('fetch', provider);
    const limit = vi.fn(async (_options: { key: string }) => ({ success: true }));
    const req = request(undefined, { 'x-forwarded-for': '203.0.113.99', 'x-real-ip': '203.0.113.99' });
    req.headers.delete('cf-connecting-ip');
    const response = await worker.fetch(req, env(limit));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'rate_limit_unavailable' });
    expect(limit).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('keeps local development available without the public rate-limit binding', async () => {
    const provider = vi.fn(async () => new Response(JSON.stringify({
      model: 'jev-test', answers: {
        turn_outcome: { type: 'choice', choice: 'YES', confidence: .98 },
        reasoning_progress: { type: 'choice', choice: 'PARTIAL_INSIGHT', confidence: .98 },
      },
    })));
    vi.stubGlobal('fetch', provider);
    const bindings = env();
    delete bindings.HON_LION_REQUIRE_RATE_LIMIT;
    delete bindings.CHAT_RATE_LIMITER;
    const req = new Request('http://localhost/api/hon-lion/chat', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const status = await worker.fetch(new Request('http://localhost/api/hon-lion/status'), bindings);
    expect(await status.json()).toEqual({ configured: true, model: 'jev-latest' });
    expect((await worker.fetch(req, bindings)).status).toBe(200);
    expect(provider).toHaveBeenCalledOnce();
  });

  it('does not consume quota for invalid input, cross-origin requests or missing API keys', async () => {
    const provider = vi.fn(); vi.stubGlobal('fetch', provider);
    const limit = vi.fn(async (_options: { key: string }) => ({ success: true }));
    const bindings = env(limit);
    expect((await worker.fetch(request(undefined, {}, {}), bindings)).status).toBe(400);
    expect((await worker.fetch(request(undefined, { origin: 'https://other.example' }), bindings)).status).toBe(403);
    expect((await worker.fetch(request(undefined, { 'content-type': 'text/plain' }), bindings)).status).toBe(415);
    expect((await worker.fetch(request(), { ...bindings, TYPESAFE_API_KEY: undefined })).status).toBe(503);
    expect(limit).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });
});
