const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Date.now().toString(36) + Array.from(bytes, (b) => ALPHABET[b % 36]).join('');
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newJoinCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
export const normalizeCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '');
