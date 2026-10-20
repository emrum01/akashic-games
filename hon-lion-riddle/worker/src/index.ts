import { chat, isLocalDemoRequest, type Env } from './chat';
import { error, json } from './http';
import { rateLimitReady } from './rate-limit';
import { canonicalMountRedirect, classifyRoute, mountedAssetRequest, type Route } from './routing';

export type { Env } from './chat';
export { chat } from './chat';
export { isJsonContentType, readBoundedBody, sameOrigin } from './http';

function status(env: Env, request: Request): Response {
  if (request.method !== 'GET') return error('method_not_allowed', 405);

  const localDemo = isLocalDemoRequest(request, env);
  const liveConfigured = Boolean(env.TYPESAFE_API_KEY?.trim()) && rateLimitReady(env);
  return json({
    configured: liveConfigured || localDemo,
    model: localDemo ? 'local-demo' : env.JEV_MODEL || 'jev-latest',
  });
}

function passesThroughToOrigin(request: Request, env: Env): boolean {
  return env.HON_LION_MOUNT_ONLY === '1' && classifyRoute(new URL(request.url).pathname) === 'asset';
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const route: Route = classifyRoute(url.pathname);
    if (route === 'mount-redirect') return canonicalMountRedirect(url);
    if (route === 'chat') return chat(request, env, request);
    if (route === 'status') return status(env, request);
    if (route === 'api-not-found') return error('not_found', 404);
    if (passesThroughToOrigin(request, env)) return fetch(request);
    return env.ASSETS.fetch(route === 'mounted-asset' ? mountedAssetRequest(request, url) : request);
  },
};
