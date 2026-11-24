import type { TokenSource } from '../domain/types.js';

/**
 * Generates a display token number like A017 / P003 / F008. This is purely
 * a display label — the database id remains the real identity, and no
 * priority/allocation logic is ever derived from the token number string.
 */
export function tokenNumberPrefix(source: TokenSource): string {
  switch (source) {
    case 'PAID_PRIORITY':
      return 'P';
    case 'FOLLOW_UP':
      return 'F';
    case 'EMERGENCY':
      return 'E';
    default:
      return 'A';
  }
}

export function formatTokenNumber(source: TokenSource, sequence: number): string {
  return `${tokenNumberPrefix(source)}${String(sequence).padStart(3, '0')}`;
}

/**
 * ONLINE and WALK_IN intentionally share the 'A' prefix (per the display
 * numbering scheme), so their sequence must be drawn from one shared
 * counter — counting a single source in isolation could hand out the same
 * display number (e.g. A001) to an ONLINE and a WALK_IN token that both
 * land in the same slot, colliding on the slot's (slotId, tokenNumber)
 * uniqueness constraint. This groups sources by prefix for that purpose.
 */
export function sourcesSharingPrefix(source: TokenSource): TokenSource[] {
  const prefix = tokenNumberPrefix(source);
  const all: TokenSource[] = ['ONLINE', 'WALK_IN', 'PAID_PRIORITY', 'FOLLOW_UP', 'EMERGENCY'];
  return all.filter((s) => tokenNumberPrefix(s) === prefix);
}
