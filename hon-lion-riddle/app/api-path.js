export const MOUNT_PATH = '/turtle-soup/manor';

function pathnameOnly(value) {
  return String(value || '').split(/[?#]/, 1)[0] || '/';
}

export function isMountedPath(pathname) {
  const path = pathnameOnly(pathname);
  return path === MOUNT_PATH || path.startsWith(`${MOUNT_PATH}/`);
}

export function getApiEndpoints(pathname) {
  const apiPath = isMountedPath(pathname) ? `${MOUNT_PATH}/api` : '/api/hon-lion';
  return { chat: `${apiPath}/chat`, status: `${apiPath}/status` };
}
