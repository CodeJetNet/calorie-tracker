import { addDays, toDay } from './dates';
test('toDay uses local date parts', () => expect(toDay(new Date(2026, 8, 15, 23, 30))).toBe('2026-09-15'));
test('addDays crosses months', () => expect(addDays('2026-09-30', 1)).toBe('2026-10-01'));
