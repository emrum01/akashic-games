export function track(event, data = {}) {
  window.dispatchEvent(new CustomEvent('hon-lion:analytics', { detail: { event, ...data } }));
}
