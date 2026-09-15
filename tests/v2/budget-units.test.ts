import { expect, it } from 'vitest';
import { BudgetLedger } from '../../src/v2/budget.js';

it.each(['constructor', 'toString', '__proto__'])('accounts for the declared unit %s without inheriting object members', unit => {
  const ledger = new BudgetLedger({ [unit]: 3 });
  expect(ledger.reserve('first', { [unit]: 2 })).toBe(true);
  expect(ledger.reserve('over', { [unit]: 2 })).toBe(false);
  ledger.settle('first', { [unit]: 2 });
  expect(ledger.snapshot().spent[unit]).toBe(2);
  expect(ledger.reserve('last', { [unit]: 1 })).toBe(true);
  ledger.failReservation('last', { [unit]: 4 });
  expect(ledger.snapshot().spent[unit]).toBe(6);
  expect(ledger.snapshot().exceeded).toBe(true);
});
