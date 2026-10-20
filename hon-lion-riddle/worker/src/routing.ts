export const MOUNT_PATH = '/turtle-soup/manor';

export type Route = 'mount-redirect' | 'chat' | 'status' | 'api-not-found' | 'mounted-asset' | 'asset';

export function isMountedPath(pathname: string): boolean {
  return pathname === MOUNT_PATH || pathname.startsWith(`${MOUNT_PATH}/`);
}

export function classifyRoute(pathname: string): Route {
  if (pathname === MOUNT_PATH || pathname === `${MOUNT_PATH}/index.html`) return 'mount-redirect';
  if (pathname === `${MOUNT_PATH}/api/chat` || pathname === '/api/hon-lion/chat') return 'chat';
  if (pathname === `${MOUNT_PATH}/api/status` || pathname === '/api/hon-lion/status') return 'status';
  if (pathname === '/api' || pathname.startsWith('/api/') || pathname === `${MOUNT_PATH}/api` || pathname.startsWith(`${MOUNT_PATH}/api/`)) return 'api-not-found';
  return isMountedPath(pathname) ? 'mounted-asset' : 'asset';
}

export function canonicalMountRedirect(url: URL): Response {
  const location = new URL(url);
  location.pathname = `${MOUNT_PATH}/`;
  return new Response(null, { status: 308, headers: { location: location.toString(), 'cache-control': 'no-store' } });
}

export function mountedAssetRequest(request: Request, url: URL): Request {
  const assetUrl = new URL(url);
  assetUrl.pathname = assetUrl.pathname.slice(MOUNT_PATH.length) || '/';
  return new Request(assetUrl.toString(), request);
}
