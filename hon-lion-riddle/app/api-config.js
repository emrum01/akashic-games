import { getApiEndpoints } from './api-path.js';

const endpoints = getApiEndpoints(window.location.pathname);
const localDemo = new URLSearchParams(window.location.search).get('demo') === '1';
const endpoint = (path) => localDemo ? `${path}?demo=1` : path;

export const API_ENDPOINT = window.HON_LION_API_ENDPOINT || endpoint(endpoints.chat);
export const STATUS_ENDPOINT = window.HON_LION_STATUS_ENDPOINT || endpoint(endpoints.status);
export const LIVE_TIMEOUT_MS = 9000;
