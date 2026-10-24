export function toast(message: string) {
  window.dispatchEvent(new CustomEvent('eqsplit:toast', { detail: message }));
}
