import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isTerminal } from '../../src/domain/tokens/stateMachine.js';
import { InvalidTransitionError } from '../../src/domain/errors.js';
import { STATUSES } from './fixtures.js';

describe('token state machine', () => {
  it('allows the full happy path', () => {
    expect(canTransition('WAITING', 'ALLOCATED')).toBe(true);
    expect(canTransition('ALLOCATED', 'CALLED')).toBe(true);
    expect(canTransition('CALLED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('allows cancellation from WAITING and ALLOCATED', () => {
    expect(canTransition('WAITING', 'CANCELLED')).toBe(true);
    expect(canTransition('ALLOCATED', 'CANCELLED')).toBe(true);
  });

  it('rejects cancellation of an already completed token', () => {
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
    expect(() => assertTransition('COMPLETED', 'CANCELLED', 't1')).toThrow(InvalidTransitionError);
  });

  it('rejects a duplicate cancellation (CANCELLED -> CANCELLED)', () => {
    expect(canTransition('CANCELLED', 'CANCELLED')).toBe(false);
  });

  it('allows no-show from ALLOCATED and CALLED, not from WAITING', () => {
    expect(canTransition('ALLOCATED', 'NO_SHOW')).toBe(true);
    expect(canTransition('CALLED', 'NO_SHOW')).toBe(true);
    expect(canTransition('WAITING', 'NO_SHOW')).toBe(false);
  });

  it('rejects a duplicate no-show', () => {
    expect(canTransition('NO_SHOW', 'NO_SHOW')).toBe(false);
  });

  it('never allows a completed token to become WAITING again', () => {
    expect(canTransition('COMPLETED', 'WAITING')).toBe(false);
  });

  it('never allows a cancelled token to become ALLOCATED without an explicit reactivation workflow (none exists)', () => {
    expect(canTransition('CANCELLED', 'ALLOCATED')).toBe(false);
  });

  it('never allows a no-show token to be treated as active again', () => {
    expect(canTransition('NO_SHOW', 'ALLOCATED')).toBe(false);
    expect(canTransition('NO_SHOW', 'IN_PROGRESS')).toBe(false);
  });

  it('rejects only from WAITING (intake), not from later states', () => {
    expect(canTransition('WAITING', 'REJECTED')).toBe(true);
    expect(canTransition('ALLOCATED', 'REJECTED')).toBe(false);
  });

  it('flags exactly the four terminal statuses as terminal', () => {
    const terminal = STATUSES.filter(isTerminal);
    expect(terminal.sort()).toEqual(['CANCELLED', 'COMPLETED', 'NO_SHOW', 'REJECTED'].sort());
  });

  it('assertTransition throws a descriptive error naming the token and legal alternatives', () => {
    try {
      assertTransition('WAITING', 'IN_PROGRESS', 'token-42');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect((e as Error).message).toContain('token-42');
      expect((e as Error).message).toContain('ALLOCATED');
    }
  });
});
