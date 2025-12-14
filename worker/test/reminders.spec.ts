import { describe, expect, it, beforeEach, vi } from 'vitest';
import { __test } from '../src/services/reminders';

const { parseDateKey, buildDaysLeft, isDeduped } = __test;

describe('reminders helpers', () => {
	const fixedNow = new Date('2025-12-11T12:00:00Z');

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(fixedNow);
	});

	it('parses ISO-like date or returns null', () => {
		expect(parseDateKey('2025-12-31')).toBe('2025-12-31');
		expect(parseDateKey(null)).toBeNull();
		expect(parseDateKey('not-a-date')).toBeNull();
	});

	it('computes days left based on date keys', () => {
		expect(buildDaysLeft('2025-12-14', '2025-12-11')).toBe(3);
	});

	it('dedups when last send is within window', () => {
		const nowMs = fixedNow.getTime();
		const fiveMinutesAgo = new Date(nowMs - 5 * 60_000).toISOString();
		expect(isDeduped(fiveMinutesAgo, 15, nowMs)).toBe(true);
	});

	it('does not dedup when outside window or invalid date', () => {
		const last = new Date('2025-12-11T11:30:00Z').toISOString();
		expect(isDeduped(last, 15, fixedNow.getTime())).toBe(false);
		expect(isDeduped('bad-date', 15, fixedNow.getTime())).toBe(false);
		expect(isDeduped(null, 15, fixedNow.getTime())).toBe(false);
	});
});
