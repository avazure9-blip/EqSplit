import type { Repeat } from '../data/types';
import { addRepeat, parseISO } from './dates';

export function dueOccurrences(start: string, repeat: Repeat, today: string, max = 60): string[] {
  if (repeat === 'never') return [];
  const anchorDay = parseISO(start).getDate();
  const out: string[] = [];
  let next = addRepeat(start, repeat, anchorDay);
  while (next <= today && out.length < max) {
    out.push(next);
    next = addRepeat(next, repeat, anchorDay);
  }
  return out;
}
