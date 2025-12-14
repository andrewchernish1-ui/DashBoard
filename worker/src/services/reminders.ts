import { fetchPaymentSheetData, updatePaymentRow, type SheetPayment } from './composio';
import type { Bindings } from '../types';
import { normalizeDateInput } from './payment-utils';

const dayMs = 86_400_000;

const defaultTemplate =
	'Привет, {name}! Через {days_left} дн. истекает план {plan}. Сумма к оплате: {amount}. Дата: {next_payment}.';

const parseDateKey = (value: string | null): string | null => {
	if (!value) return null;
	const normalized = normalizeDateInput(value) ?? value.trim();
	return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
};

const dateKeyInTimezone = (timezone: string): string => {
	const fallback = new Date().toISOString().split('T')[0] ?? '1970-01-01';
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).formatToParts(new Date());
		const year = parts.find((p) => p.type === 'year')?.value;
		const month = parts.find((p) => p.type === 'month')?.value;
		const day = parts.find((p) => p.type === 'day')?.value;
		if (!year || !month || !day) return fallback;
		return `${year}-${month}-${day}`;
	} catch {
		return fallback;
	}
};

const dayNumberFromKey = (key: string): number | null => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
	if (!match) return null;
	const year = Number.parseInt(match[1]!, 10);
	const month = Number.parseInt(match[2]!, 10);
	const day = Number.parseInt(match[3]!, 10);
	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
	return Math.floor(Date.UTC(year, month - 1, day) / dayMs);
};

const parseSkipStatuses = (raw?: string): Set<string> => {
	if (!raw) return new Set(['paid', 'cancelled']);
	return new Set(
		raw
			.split(',')
			.map((item) => item.trim().toLowerCase())
			.filter(Boolean)
	);
};

const formatMessage = (template: string, payment: SheetPayment, daysLeft: number): string => {
	return template
		.replaceAll('{name}', payment.name ?? '')
		.replaceAll('{plan}', payment.plan ?? '')
		.replaceAll('{amount}', String(payment.amount ?? ''))
		.replaceAll('{next_payment}', payment.nextPayment ?? '')
		.replaceAll('{days_left}', String(daysLeft));
};

const shouldSkipByStatus = (status: string | null | undefined, skip: Set<string>): boolean => {
	if (!status) return false;
	return skip.has(status.toLowerCase());
};

const isDeduped = (lastAt: string | null | undefined, dedupMinutes: number, nowMs: number = Date.now()): boolean => {
	if (!lastAt) return false;
	const parsed = Date.parse(lastAt);
	if (Number.isNaN(parsed)) return false;
	const diffMinutes = Math.abs(nowMs - parsed) / 60_000;
	return diffMinutes < dedupMinutes;
};

const buildDaysLeft = (dueKey: string, nowKey: string): number | null => {
	const dueNumber = dayNumberFromKey(dueKey);
	const nowNumber = dayNumberFromKey(nowKey);
	if (dueNumber === null || nowNumber === null) return null;
	return dueNumber - nowNumber;
};

const sendTelegramMessage = async (token: string, chatId: string, text: string) => {
	const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			chat_id: chatId,
			text,
			parse_mode: 'HTML',
			disable_web_page_preview: true,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Telegram send failed: ${response.status} ${response.statusText} ${errorText}`.trim());
	}
};

export async function ensureRemindersLogTable(db: D1Database) {
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS reminders_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_name TEXT,
        chat_id TEXT,
        due_at TEXT,
        sent_at TEXT,
        offset INTEGER,
        status TEXT,
        error TEXT
      )`
		)
		.run();
}

async function logReminder(
	db: D1Database,
	entry: { client: string; chatId: string; dueAt: string | null; sentAt: string; offset: number; status: string; error?: string | null }
) {
	await db
		.prepare(
			`INSERT INTO reminders_log (client_name, chat_id, due_at, sent_at, offset, status, error)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
		)
		.bind(entry.client, entry.chatId, entry.dueAt, entry.sentAt, entry.offset, entry.status, entry.error ?? null)
		.run();
}

export type ReminderRunResult = {
	total: number;
	skipped: number;
	sent: number;
	errors: number;
	details: Array<{ name: string; reason?: string; error?: string }>;
};

export async function sendReminders(env: Bindings): Promise<ReminderRunResult> {
	const token = env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		return { total: 0, skipped: 0, sent: 0, errors: 0, details: [{ name: 'all', reason: 'No TELEGRAM_BOT_TOKEN' }] };
	}

	const dedupMinutes = Number.parseInt(env.REMINDER_DEDUP_MINUTES ?? '15', 10);
	const skipStatuses = parseSkipStatuses(env.REMINDER_STATUSES_SKIP);
	const template = env.REMINDER_TEMPLATE?.trim() || defaultTemplate;
	const defaultTz = env.TIMEZONE_DEFAULT || 'UTC';

	const payments = await fetchPaymentSheetData(env);
	await ensureRemindersLogTable(env.DB);
	let sent = 0;
	let skipped = 0;
	let errors = 0;
	const details: ReminderRunResult['details'] = [];

	for (const payment of payments) {
		if (!payment.rowNumber) {
			skipped += 1;
			details.push({ name: payment.name, reason: 'No row number' });
			continue;
		}

		if (payment.notifyOptIn === false) {
			skipped += 1;
			details.push({ name: payment.name, reason: 'Opt-out' });
			continue;
		}

		if (!payment.telegramChatId) {
			skipped += 1;
			details.push({ name: payment.name, reason: 'No chat id' });
			continue;
		}

		if (shouldSkipByStatus(payment.status, skipStatuses)) {
			skipped += 1;
			details.push({ name: payment.name, reason: `Skip status ${payment.status}` });
			continue;
		}

		const dueKey = parseDateKey(payment.nextPayment);
		if (!dueKey) {
			skipped += 1;
			details.push({ name: payment.name, reason: 'Invalid next_payment' });
			continue;
		}

		const tz = payment.timezone || defaultTz;
		const todayKey = dateKeyInTimezone(tz);
		const daysLeft = buildDaysLeft(dueKey, todayKey);
		if (daysLeft === null || ![3, 2, 1].includes(daysLeft)) {
			skipped += 1;
			details.push({ name: payment.name, reason: `Outside window: ${daysLeft ?? 'NaN'}d` });
			continue;
		}

		if (payment.lastNotifiedOffset === daysLeft) {
			skipped += 1;
			details.push({ name: payment.name, reason: 'Already notified for this offset' });
			continue;
		}

		const nowMs = Date.now();
		if (isDeduped(payment.lastNotifiedAt, Number.isFinite(dedupMinutes) ? dedupMinutes : 15, nowMs)) {
			skipped += 1;
			details.push({ name: payment.name, reason: 'Dedup window' });
			continue;
		}

		const message = formatMessage(template, payment, daysLeft);
		const nowIso = new Date().toISOString();

		try {
			await sendTelegramMessage(token, payment.telegramChatId, message);
			const updated: SheetPayment = {
				...payment,
				lastNotifiedOffset: daysLeft,
				lastNotifiedAt: nowIso,
				errorMessage: null,
			};
			await updatePaymentRow(env, payment.rowNumber, updated);
			await logReminder(env.DB, {
				client: payment.name,
				chatId: payment.telegramChatId,
				dueAt: dueKey,
				sentAt: nowIso,
				offset: daysLeft,
				status: 'sent',
			});
			sent += 1;
			details.push({ name: payment.name, reason: `Sent D-${daysLeft}` });
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			const updated: SheetPayment = {
				...payment,
				errorMessage: errMsg,
				lastNotifiedAt: nowIso,
			};
			await updatePaymentRow(env, payment.rowNumber, updated);
			await logReminder(env.DB, {
				client: payment.name,
				chatId: payment.telegramChatId,
				dueAt: dueKey,
				sentAt: nowIso,
				offset: daysLeft,
				status: 'error',
				error: errMsg,
			});
			errors += 1;
			details.push({ name: payment.name, error: errMsg });
		}
	}

	return { total: payments.length, sent, skipped, errors, details };
}

// Expose helpers for unit testing
export const __test = {
	parseDateKey,
	dateKeyInTimezone,
	dayNumberFromKey,
	buildDaysLeft,
	isDeduped,
};
