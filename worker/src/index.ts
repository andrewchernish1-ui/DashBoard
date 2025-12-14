import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fetchTelegramStats } from './services/telegram';
import {
	fetchExerciseSheetData,
	fetchPaymentSheetData,
	initializeSheets,
	appendPaymentRow,
	updatePaymentRow,
	clearPaymentRow,
	appendExerciseRow,
	debugFetchExerciseRaw,
	rewriteExerciseSheet,
} from './services/composio';
import type { Bindings, ExerciseRow, PaymentRow, TelegramStatRow } from './types';
import type { SheetPayment } from './services/composio';
import type { TelegramPost } from './services/telegram';
import { normalizeDateInput, normalizePaymentStatus } from './services/payment-utils';
import { todayISO } from './utils/date-utils';
import { fetchCalendarEvents, fetchCalendarEventsRaw, fetchCalendarList } from './services/composio';
import { ensureRemindersLogTable, logReminder, sendReminders, verifyConfirmationSignature } from './services/reminders';

const app = new Hono<{ Bindings: Bindings }>();
app.use('/*', cors());

const FOCUS_EXERCISES = ['Clean', 'Snatch', 'Deadlift', 'Squat', 'Bench Press'];
const dayMs = 86_400_000;

type FocusExerciseMetric = {
	name: string;
	current: number | null;
	previous: number | null;
	changePercent: number;
};

type ExerciseTimelinePoint = {
	date: string;
} & Record<string, number | null | string>;

type PaymentSummary = {
	total: number;
	urgent: number;
	warning: number;
	ok: number;
	expectedTotal: number;
	overdueAmount: number;
	nextSevenDays: number;
};

type PaymentItem = {
	id: number;
	name: string;
	plan: string | null;
	amount: number | null;
	status: string;
	nextPayment: string | null;
	notes: string | null;
};

type PaymentInput = {
	name: string;
	plan?: string | null;
	amount: number;
	status?: string | null;
	nextPayment?: string | null;
	notes?: string | null;
};

type PaymentMatch = {
	name: string;
	plan?: string | null;
	amount?: number | null;
	status?: string | null;
	nextPayment?: string | null;
};

type DashboardResponse = {
	telegram: {
		history: TelegramStatRow[];
		current: TelegramStatRow | null;
		aggregates: {
			subscribers: {
				current: number;
				changeToday: number;
				changeWeek: number;
				changeMonth: number;
			};
			views: {
				today: number;
				week: number;
				month: number;
			};
		};
		posts: TelegramPost[];
	};
	exercises: {
		latestDate: string | null;
		focus: FocusExerciseMetric[];
		timeline: ExerciseTimelinePoint[];
	};
	payments: {
		summary: PaymentSummary;
		items: PaymentItem[];
	};
	events: {
		items: {
			id: string;
			summary: string;
			start: string | null;
			end: string | null;
			location: string | null;
			description: string | null;
		}[];
	};
};

type ReminderLogEntry = {
	id: number;
	client_name: string | null;
	chat_id: string | null;
	due_at: string | null;
	sent_at: string | null;
	offset: number | null;
	status: string | null;
	error: string | null;
};

const parseDateMs = (value: string): number => Date.parse(`${value}T00:00:00Z`);

const computeRange = (history: TelegramStatRow[], days: number): TelegramStatRow[] => {
	if (history.length === 0) return [];
	const lastDateMs = parseDateMs(history[history.length - 1]!.date);
	const cutoff = lastDateMs - (days - 1) * dayMs;
	return history.filter((entry) => parseDateMs(entry.date) >= cutoff);
};

const computeSubscriberDelta = (history: TelegramStatRow[], days: number): number => {
	const range = computeRange(history, days);
	if (range.length < 2) return 0;
	const first = range[0]!;
	const last = range[range.length - 1]!;
	return last.subscribers - first.subscribers;
};

const computeViewsSum = (history: TelegramStatRow[], days: number): number => {
	const range = computeRange(history, days);
	return range.reduce((sum, entry) => sum + (entry.total_views_24h ?? 0), 0);
};

const buildExerciseFocusMetrics = (rows: ExerciseRow[]): FocusExerciseMetric[] => {
	return FOCUS_EXERCISES.map((name) => {
		const entries = rows.filter((row) => row.exercise_name === name).sort((a, b) => a.date.localeCompare(b.date));
		const latest = entries.at(-1);
		const previous = entries.length > 1 ? entries.at(-2) : undefined;
		const changePercent =
			latest && previous && previous.weight > 0
				? ((latest.weight - previous.weight) / previous.weight) * 100
				: 0;
		return {
			name,
			current: latest?.weight ?? null,
			previous: previous?.weight ?? null,
			changePercent,
		};
	});
};

const buildExerciseTimeline = (rows: ExerciseRow[]): ExerciseTimelinePoint[] => {
	const grouped = new Map<string, Record<string, number | null | string>>();
	rows.forEach((row) => {
		if (!grouped.has(row.date)) {
			grouped.set(row.date, { date: row.date });
		}
		const current = grouped.get(row.date)!;
		current[row.exercise_name] = row.weight;
	});

	return Array.from(grouped.values())
		.sort((a, b) => (String(a.date).localeCompare(String(b.date))))
		.slice(-6)
		.map((point) => {
			const record: ExerciseTimelinePoint = { date: String(point.date) };
			FOCUS_EXERCISES.forEach((name) => {
				const value = point[name];
				record[name] = typeof value === 'number' ? value : null;
			});
			return record;
		});
};

const normalizeDateMs = (value: string | null): number | null => {
	if (!value) return null;
	const parsed = Date.parse(`${value}T00:00:00Z`);
	return Number.isNaN(parsed) ? null : parsed;
};

const buildPaymentSummary = (rows: PaymentItem[]): PaymentSummary => {
	const today = new Date().toISOString().split('T')[0] ?? '';
	const todayMs = Date.parse(`${today}T00:00:00Z`);
	let urgent = 0;
	let warning = 0;
	let ok = 0;
	let expectedTotal = 0;
	let overdueAmount = 0;
	let nextSevenDays = 0;

	rows.forEach((row) => {
		const status = (row.status ?? 'ok').toLowerCase();
		if (status === 'urgent') urgent += 1;
		else if (status === 'warning') warning += 1;
		else ok += 1;

		const amount = row.amount ?? 0;
		expectedTotal += amount;

		const nextPaymentMs = normalizeDateMs(row.nextPayment);
		if (nextPaymentMs !== null && !Number.isNaN(todayMs)) {
			const diffDays = Math.floor((nextPaymentMs - todayMs) / dayMs);
			if (diffDays < 0) {
				overdueAmount += amount;
			}
			if (diffDays >= 0 && diffDays <= 7) {
				nextSevenDays += amount;
			}
		}
	});

	return {
		total: rows.length,
		urgent,
		warning,
		ok,
		expectedTotal,
		overdueAmount,
		nextSevenDays,
	};
};

const parsePaymentPayload = (body: unknown): PaymentInput => {
	if (typeof body !== 'object' || body === null) {
		throw new Error('Тело запроса должно быть объектом');
	}

	const data = body as Record<string, unknown>;
	const rawName = data.name;
	const rawAmount = data.amount;

	if (typeof rawName !== 'string' || rawName.trim().length === 0) {
		throw new Error('Поле "name" обязательно');
	}

	const amount =
		typeof rawAmount === 'number'
			? rawAmount
			: rawAmount !== undefined
				? Number(String(rawAmount).replace(/\s/g, '').replace(',', '.'))
				: NaN;

	if (Number.isNaN(amount)) {
		throw new Error('Поле "amount" должно быть числом');
	}

	return {
		name: rawName.trim(),
		plan: typeof data.plan === 'string' ? data.plan.trim() : null,
		amount,
		status: normalizePaymentStatus(typeof data.status === 'string' ? data.status : null),
		nextPayment: normalizeDateInput(typeof data.nextPayment === 'string' ? data.nextPayment : null),
		notes: typeof data.notes === 'string' ? data.notes.trim() : null,
	};
};

const parsePaymentMatch = (body: unknown): PaymentMatch => {
	if (typeof body !== 'object' || body === null) {
		throw new Error('Поле "match" должно быть объектом');
	}
	const data = body as Record<string, unknown>;
	const rawName = data.name;
	if (typeof rawName !== 'string' || rawName.trim().length === 0) {
		throw new Error('Поле "match.name" обязательно');
	}
	return {
		name: rawName.trim(),
		plan: typeof data.plan === 'string' ? data.plan.trim() : null,
		amount:
			typeof data.amount === 'number'
				? data.amount
				: data.amount !== undefined
					? Number(String(data.amount).replace(/\s/g, '').replace(',', '.'))
					: null,
		status: normalizePaymentStatus(typeof data.status === 'string' ? data.status : null),
		nextPayment: normalizeDateInput(typeof data.nextPayment === 'string' ? data.nextPayment : null),
	};
};

async function fetchRemindersSummary(db: D1Database) {
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const result = await db
		.prepare(
			`SELECT status, COUNT(*) as count
       FROM reminders_log
       WHERE sent_at >= ?1
       GROUP BY status`
		)
		.bind(since)
		.all<{ status: string; count: number }>();

	const summary = { sent24h: 0, errors24h: 0 };
	(result.results ?? []).forEach((row) => {
		if ((row.status ?? '').toLowerCase() === 'sent') summary.sent24h += Number(row.count ?? 0);
		if ((row.status ?? '').toLowerCase() === 'error') summary.errors24h += Number(row.count ?? 0);
	});
	return summary;
}

async function fetchRemindersLogs(db: D1Database, limit: number): Promise<ReminderLogEntry[]> {
	const result = await db
		.prepare(
			`SELECT id, client_name, chat_id, due_at, sent_at, offset, status, error
       FROM reminders_log
       ORDER BY sent_at DESC
       LIMIT ?1`
		)
		.bind(limit)
		.all<ReminderLogEntry>();
	return (result.results ?? []) as ReminderLogEntry[];
}

const requireAuth = (request: Request, env: Bindings) => {
	if (!env.API_SECRET) return;
	const token = request.headers.get('x-api-key');
	if (token !== env.API_SECRET) {
		throw new Error('Неавторизовано');
	}
};

const dedupeExercises = (rows: ExerciseRow[]): ExerciseRow[] => {
	const bestByKey = new Map<string, ExerciseRow>();
	rows.forEach((row) => {
		const key = `${row.date}|${row.exercise_name}`;
		const existing = bestByKey.get(key);
		if (!existing || row.weight > existing.weight) {
			bestByKey.set(key, row);
		}
	});
	return Array.from(bestByKey.values());
};

async function updateAllData(env: Bindings) {
	const today = todayISO();
	const [tgData, sheetData, paymentSheet] = await Promise.all([
		fetchTelegramStats(),
		fetchExerciseSheetData(env),
		fetchPaymentSheetData(env),
	]);

	const statements: D1PreparedStatement[] = [
		env.DB.prepare(`DELETE FROM telegram_stats`),
		env.DB.prepare(
			`INSERT INTO telegram_stats (date, subscribers, total_views_24h, created_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(date) DO UPDATE SET
       subscribers=excluded.subscribers,
       total_views_24h=excluded.total_views_24h,
       created_at=excluded.created_at`
		).bind(today, tgData.subscribers, tgData.total_views_metric, Date.now()),
	];

	const exerciseRows: ExerciseRow[] = sheetData.map((exercise) => ({
		date: exercise.date ?? today,
		exercise_name: exercise.name,
		weight: exercise.weight,
	}));
	const dedupedExercises = dedupeExercises(exerciseRows);
	statements.push(env.DB.prepare(`DELETE FROM exercise_stats`));
	if (dedupedExercises.length > 0) {
		const statement = env.DB.prepare(`INSERT INTO exercise_stats (date, exercise_name, weight) VALUES (?1, ?2, ?3)
      ON CONFLICT(date, exercise_name) DO UPDATE SET weight=excluded.weight`);
		dedupedExercises.forEach((exercise) => {
			statements.push(statement.bind(exercise.date, exercise.exercise_name, exercise.weight));
		});
	}

	if (tgData.recent_posts.length > 0) {
		statements.push(env.DB.prepare(`DELETE FROM telegram_posts`));
		const postStatement = env.DB.prepare(
			`INSERT INTO telegram_posts (post_id, channel_name, title, content, link, published_at, views)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
		);
		tgData.recent_posts.forEach((post) => {
			statements.push(
				postStatement.bind(
					post.post_id,
					post.channel_name,
					post.title,
					post.content,
					post.link,
					post.published_at,
					post.views
				)
			);
		});
	}

	if (paymentSheet.length > 0) {
		statements.push(env.DB.prepare(`DELETE FROM client_payments`));
		const paymentStatement = env.DB.prepare(
			`INSERT INTO client_payments (client_name, plan, amount, status, next_payment, notes)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
		);
		paymentSheet.forEach((payment) => {
			statements.push(
				paymentStatement.bind(
					payment.name,
					payment.plan,
					payment.amount,
					payment.status,
					payment.nextPayment,
					payment.notes
				)
			);
		});
	}

	if (statements.length > 0) {
		await env.DB.batch(statements);
	}

	return { success: true, timestamp: new Date().toISOString() };
}

async function buildDashboardResponse(db: D1Database): Promise<DashboardResponse> {
	await ensureRemindersLogTable(db);
	const historyResult = await db
		.prepare(
			`SELECT date, subscribers, total_views_24h, created_at
       FROM telegram_stats
       ORDER BY date ASC`
		)
		.all<TelegramStatRow>();

	const history = (historyResult.results ?? []) as TelegramStatRow[];
	const current = history.at(-1) ?? null;
	const postsResult = await db
		.prepare(
			`SELECT post_id, channel_name, title, content, link, published_at, views
       FROM telegram_posts
       ORDER BY published_at DESC
       LIMIT 3`
		)
		.all<TelegramPost>();
	const posts = (postsResult.results ?? []) as TelegramPost[];

	const exercisesResult = await db
		.prepare(`SELECT date, exercise_name, weight FROM exercise_stats ORDER BY date DESC LIMIT 200`)
		.all<ExerciseRow>();
	const exerciseRows = (exercisesResult.results ?? []) as ExerciseRow[];

	const latestDate = exerciseRows.length > 0 ? exerciseRows[0]!.date : null;

	const paymentsResult = await db
		.prepare(
			`SELECT id, client_name, plan, amount, status, next_payment, notes
       FROM client_payments
       ORDER BY
         CASE WHEN next_payment IS NULL THEN 1 ELSE 0 END,
         next_payment ASC`
		)
		.all<PaymentRow>();
	const paymentRows = (paymentsResult.results ?? []) as PaymentRow[];
	const paymentItems: PaymentItem[] = paymentRows.map((row) => ({
		id: row.id,
		name: row.client_name,
		plan: row.plan,
		amount: row.amount,
		status: row.status ?? 'ok',
		nextPayment: row.next_payment,
		notes: row.notes,
	}));

	const remindersSummary = await fetchRemindersSummary(db);

	return {
		telegram: {
			history,
			current,
			aggregates: {
				subscribers: {
					current: current?.subscribers ?? 0,
					changeToday:
						history.length > 1 ? current!.subscribers - history[history.length - 2]!.subscribers : 0,
					changeWeek: computeSubscriberDelta(history, 7),
					changeMonth: computeSubscriberDelta(history, 30),
				},
				views: {
					today: current?.total_views_24h ?? 0,
					week: computeViewsSum(history, 7),
					month: computeViewsSum(history, 30),
				},
			},
			posts,
		},
		exercises: {
			latestDate,
			focus: buildExerciseFocusMetrics(exerciseRows),
			timeline: buildExerciseTimeline(exerciseRows),
		},
		payments: {
			summary: buildPaymentSummary(paymentItems),
			items: paymentItems,
		},
		events: {
			items: [],
		},
		reminders: remindersSummary,
	};
}

const findPaymentRowNumber = async (env: Bindings, match: PaymentMatch): Promise<{ rowNumber: number; row: SheetPayment }> => {
	const rows = await fetchPaymentSheetData(env);
	const found = rows.find(
		(row) =>
			row.name === match.name &&
			(match.plan === undefined || (row.plan ?? null) === (match.plan ?? null)) &&
			(match.amount === undefined || row.amount === match.amount) &&
			(match.status === undefined || row.status === match.status) &&
			(match.nextPayment === undefined || (row.nextPayment ?? null) === (match.nextPayment ?? null))
	);
	if (!found || !found.rowNumber) {
		throw new Error('Строка в листе не найдена по переданному совпадению');
	}
	return { rowNumber: found.rowNumber, row: found };
};

app.post('/api/sheets/init', async (c) => {
	try {
		requireAuth(c.req, c.env);
		await initializeSheets(c.env);
		return c.json({ success: true });
	} catch (error) {
		console.error('Sheet init failed', error);
		const message = (error as Error).message;
		const status = message === 'Неавторизовано' ? 401 : 500;
		return c.json({ error: message }, status);
	}
});

app.post('/api/payments/add', async (c) => {
	try {
		requireAuth(c.req, c.env);
		const payload = parsePaymentPayload(await c.req.json());

		await appendPaymentRow(c.env, {
			name: payload.name,
			plan: payload.plan ?? null,
			amount: payload.amount,
			status: payload.status ?? 'ok',
			nextPayment: payload.nextPayment ?? null,
			notes: payload.notes ?? null,
		});

		await c.env.DB.prepare(
			`INSERT INTO client_payments (client_name, plan, amount, status, next_payment, notes)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
		)
			.bind(
				payload.name,
				payload.plan,
				payload.amount,
				payload.status,
				payload.nextPayment,
				payload.notes
			)
			.run();

		return c.json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Ошибка при добавлении оплаты';
		const status =
			message === 'Неавторизовано' ? 401 : error instanceof Error && message.includes('Поле') ? 400 : 500;
		if (status >= 500) {
			console.error('Add payment failed', error);
		}
		return c.json({ error: message }, status);
	}
});

app.post('/api/refresh', async (c) => {
	try {
		requireAuth(c.req, c.env);
		const result = await updateAllData(c.env);
		return c.json(result);
	} catch (error) {
		console.error('Refresh failed', error);
		const message = (error as Error).message;
		const status = message === 'Неавторизовано' ? 401 : 500;
		return c.json({ error: message }, status);
	}
});

app.post('/api/reminders/run', async (c) => {
	try {
		requireAuth(c.req, c.env);
		const result = await sendReminders(c.env);
		return c.json({ success: true, ...result });
	} catch (error) {
		const message = (error as Error).message;
		console.error('Reminders run failed', error);
		return c.json({ error: message }, 500);
	}
});

app.get('/api/telegram/me', async (c) => {
	try {
		requireAuth(c.req, c.env);
		if (!c.env.TELEGRAM_BOT_TOKEN) {
			return c.json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, 400);
		}
		const response = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/getMe`);
		const payload = await response.json();
		return c.json(payload, response.ok ? 200 : 502);
	} catch (error) {
		console.error('Telegram getMe failed', error);
		return c.json({ error: (error as Error).message }, 500);
	}
});

app.get('/api/telegram/updates', async (c) => {
	try {
		requireAuth(c.req, c.env);
		if (!c.env.TELEGRAM_BOT_TOKEN) {
			return c.json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, 400);
		}
		const limitParam = Number(c.req.query('limit') ?? '20');
		const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;
		const offsetParam = c.req.query('offset');
		const offset = offsetParam ? Number(offsetParam) : undefined;

		const url = new URL(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/getUpdates`);
		url.searchParams.set('limit', String(limit));
		url.searchParams.set('timeout', '0');
		if (offset !== undefined && Number.isFinite(offset)) {
			url.searchParams.set('offset', String(offset));
		}

		const response = await fetch(url.toString());
		const payload = (await response.json()) as {
			ok: boolean;
			result?: Array<{
				update_id: number;
				message?: {
					date: number;
					text?: string;
					chat: { id: number; type: string; title?: string; username?: string; first_name?: string; last_name?: string };
					from?: { id: number; username?: string; first_name?: string; last_name?: string };
				};
			}>;
			description?: string;
		};

		if (!response.ok || payload.ok !== true) {
			return c.json(payload, 502);
		}

		const items = (payload.result ?? []).map((update) => {
			const msg = update.message;
			return {
				updateId: update.update_id,
				date: msg?.date ? new Date(msg.date * 1000).toISOString() : null,
				text: msg?.text ?? null,
				chat: msg
					? {
							id: msg.chat.id,
							type: msg.chat.type,
							title: msg.chat.title ?? null,
							username: msg.chat.username ?? null,
							firstName: msg.chat.first_name ?? null,
							lastName: msg.chat.last_name ?? null,
						}
					: null,
				from: msg?.from
					? {
							id: msg.from.id,
							username: msg.from.username ?? null,
							firstName: msg.from.first_name ?? null,
							lastName: msg.from.last_name ?? null,
						}
					: null,
			};
		});

		const maxUpdateId = items.reduce((max, item) => Math.max(max, item.updateId), 0);
		return c.json({ ok: true, count: items.length, maxUpdateId, items });
	} catch (error) {
		console.error('Telegram getUpdates failed', error);
		return c.json({ error: (error as Error).message }, 500);
	}
});

app.put('/api/payments/update', async (c) => {
	try {
		requireAuth(c.req, c.env);
		const body = await c.req.json();
		const match = parsePaymentMatch((body as { match?: unknown }).match);
		const payload = parsePaymentPayload((body as { data?: unknown }).data);

		const { rowNumber } = await findPaymentRowNumber(c.env, match);

		await updatePaymentRow(c.env, rowNumber, {
			name: payload.name,
			plan: payload.plan ?? null,
			amount: payload.amount,
			status: payload.status ?? 'ok',
			nextPayment: payload.nextPayment ?? null,
			notes: payload.notes ?? null,
		});

		await c.env.DB.prepare(
			`UPDATE client_payments SET
        client_name=?1, plan=?2, amount=?3, status=?4, next_payment=?5, notes=?6
       WHERE client_name=?7
         AND IFNULL(plan, '') = IFNULL(?8, '')
         AND (?9 IS NULL OR amount=?9)
         AND IFNULL(status, '') = IFNULL(?10, '')
         AND IFNULL(next_payment, '') = IFNULL(?11, '')
       `
		)
			.bind(
				payload.name,
				payload.plan,
				payload.amount,
				payload.status,
				payload.nextPayment,
				payload.notes,
				match.name,
				match.plan,
				match.amount,
				match.status,
				match.nextPayment
			)
			.run();

		return c.json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Ошибка при обновлении оплаты';
		const status = message === 'Неавторизовано' ? 401 : error instanceof Error && message.includes('Поле') ? 400 : 500;
		if (status >= 500) {
			console.error('Update payment failed', error);
		}
		return c.json({ error: message }, status);
	}
});

app.delete('/api/payments/delete', async (c) => {
	try {
		requireAuth(c.req, c.env);
		const match = parsePaymentMatch(await c.req.json());
		const { rowNumber } = await findPaymentRowNumber(c.env, match);

		await clearPaymentRow(c.env, rowNumber);
		await c.env.DB.prepare(
			`DELETE FROM client_payments
       WHERE client_name=?1
         AND IFNULL(plan, '') = IFNULL(?2, '')
         AND (?3 IS NULL OR amount=?3)
         AND IFNULL(status, '') = IFNULL(?4, '')
         AND IFNULL(next_payment, '') = IFNULL(?5, '')`
		)
			.bind(match.name, match.plan, match.amount, match.status, match.nextPayment)
			.run();

		return c.json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Ошибка при удалении оплаты';
		const status = message === 'Неавторизовано' ? 401 : 500;
		if (status >= 500) {
			console.error('Delete payment failed', error);
		}
		return c.json({ error: message }, status);
	}
});

app.post('/api/exercises/add', async (c) => {
	try {
		requireAuth(c.req, c.env);
		const body = await c.req.json();
		if (typeof body !== 'object' || body === null) {
			throw new Error('Тело запроса должно быть объектом');
		}
		const { name, weight } = body as Record<string, unknown>;
		if (typeof name !== 'string' || name.trim().length === 0) {
			throw new Error('Поле "name" обязательно');
		}
		const parsedWeight =
			typeof weight === 'number'
				? weight
				: weight !== undefined
					? Number(String(weight).replace(/\s/g, '').replace(',', '.'))
					: NaN;
		if (Number.isNaN(parsedWeight)) {
			throw new Error('Поле "weight" должно быть числом');
		}

		await appendExerciseRow(c.env, { name: name.trim(), weight: parsedWeight });
		const today = todayISO();
		await c.env.DB.prepare(
			`INSERT INTO exercise_stats (date, exercise_name, weight)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(date, exercise_name) DO UPDATE SET weight=excluded.weight`
		)
			.bind(today, name.trim(), parsedWeight)
			.run();

		return c.json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Ошибка при добавлении RM';
		const status = message === 'Неавторизовано' ? 401 : 500;
		if (status >= 500) {
			console.error('Add exercise failed', error);
		}
		return c.json({ error: message }, status);
	}
});

app.get('/api/dashboard', async (c) => {
	try {
		const data = await buildDashboardResponse(c.env.DB);
		const fromDate = new Date();
		fromDate.setHours(0, 0, 0, 0);
		const toDate = new Date(fromDate.getTime() + 3 * dayMs); // сегодня + 2 дня, конец второго дня
		const from = fromDate.toISOString();
		const to = toDate.toISOString();
		let events: Awaited<ReturnType<typeof fetchCalendarEvents>> = [];
		try {
			events = await fetchCalendarEvents(c.env, from, to);
		} catch (err) {
			console.error('Calendar fetch failed', err);
			events = [];
		}
		return c.json({
			...data,
			events: {
				items: events,
			},
		});
	} catch (error) {
		console.error('Dashboard fetch failed', error);
		return c.json({ error: (error as Error).message }, 500);
	}
});

// Вспомогательный эндпоинт для отладки данных из Google Sheets (упражнения)
app.get('/api/debug/exercises', async (c) => {
	try {
		const rows = await fetchExerciseSheetData(c.env);
		const raw = await debugFetchExerciseRaw(c.env);
		return c.json({ rows, count: rows.length, raw });
	} catch (error) {
		console.error('Debug exercises failed', error);
		return c.json({ error: (error as Error).message }, 500);
	}
});

app.post('/api/debug/rename-press', async (c) => {
	try {
		requireAuth(c.req, c.env);
		const rows = await fetchExerciseSheetData(c.env);
		await rewriteExerciseSheet(c.env, rows);
		return c.json({ success: true, count: rows.length });
	} catch (error) {
		console.error('Rename press failed', error);
		const message = (error as Error).message;
		const status = message === 'Неавторизовано' ? 401 : 500;
		return c.json({ error: message }, status);
	}
});

app.get('/api/debug/events', async (c) => {
	try {
		requireAuth(c.req, c.env);
		const daysParam = Number(c.req.query('days') ?? '2');
		const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(14, daysParam)) : 2;
		const fromDate = new Date();
		fromDate.setHours(0, 0, 0, 0);
		const toDate = new Date(fromDate.getTime() + (days + 1) * dayMs);
		const from = fromDate.toISOString();
		const to = toDate.toISOString();
		const [events, raw] = await Promise.all([
			fetchCalendarEvents(c.env, from, to),
			fetchCalendarEventsRaw(c.env, from, to),
		]);
		return c.json({ items: events, count: events.length, range: { from, to, days }, raw });
	} catch (error) {
		console.error('Debug events failed', error);
		const message = (error as Error).message;
		return c.json({ error: message }, 500);
	}
});

app.get('/api/debug/calendars', async (c) => {
	try {
		requireAuth(c.req, c.env);
		const list = await fetchCalendarList(c.env);
		return c.json(list);
	} catch (error) {
		console.error('Debug calendars failed', error);
		const message = (error as Error).message;
		return c.json({ error: message }, 500);
	}
});

app.get('/api/reminders/confirm', async (c) => {
	try {
		const secret = c.env.REMINDER_CONFIRM_SECRET;
		if (!secret) {
			return new Response('Подтверждение не настроено', { status: 500 });
		}
		const url = new URL(c.req.url);
		const rowParam = url.searchParams.get('row');
		const due = url.searchParams.get('due');
		const chat = url.searchParams.get('chat');
		const sig = url.searchParams.get('sig');
		const rowNumber = rowParam ? Number(rowParam) : NaN;
		if (!Number.isFinite(rowNumber) || !due || !chat || !sig) {
			return new Response('Некорректная ссылка', { status: 400 });
		}

		const isValid = await verifyConfirmationSignature(secret, rowNumber, due, chat, sig);
		if (!isValid) {
			return new Response('Ссылка устарела или недействительна', { status: 400 });
		}

		const payments = await fetchPaymentSheetData(c.env);
		const payment = payments.find((p) => p.rowNumber === rowNumber);
		if (!payment) {
			return new Response('Клиент не найден', { status: 404 });
		}
		if ((payment.telegramChatId ?? '').toString() !== chat) {
			return new Response('Ссылка устарела', { status: 400 });
		}

		const nowIso = new Date().toISOString();
		await ensureRemindersLogTable(c.env.DB);
		await logReminder(c.env.DB, {
			client: payment.name,
			chatId: chat,
			dueAt: due,
			sentAt: nowIso,
			offset: null,
			status: 'confirmed',
		});

		const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Спасибо!</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:2rem;}
.card{background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(15,23,42,0.08);padding:32px;max-width:420px;text-align:center;}
.card h1{font-size:1.4rem;margin-bottom:0.5rem;}
.card p{margin:0.3rem 0;color:#475569;}
.card a{color:#059669;text-decoration:none;font-weight:600;}
</style>
</head>
<body>
<div class="card">
  <h1>Спасибо!</h1>
  <p>Мы получили отметку об оплате.</p>
  <p>Дата в таблице обновляется вручную, всё под контролем.</p>
  <p><a href="tg://user?id=${encodeURIComponent(chat)}">Вернуться в Telegram</a></p>
</div>
</body>
</html>`;
		return new Response(html, {
			headers: {
				'content-type': 'text/html; charset=utf-8',
			},
		});
	} catch (error) {
		console.error('Reminders confirm failed', error);
		return new Response('Произошла ошибка, попробуйте позже', { status: 500 });
	}
});

app.get('/api/reminders/logs', async (c) => {
	try {
		requireAuth(c.req, c.env);
		const limitParam = Number(c.req.query('limit') ?? '20');
		const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 20;
		await ensureRemindersLogTable(c.env.DB);
		const logs = await fetchRemindersLogs(c.env.DB, limit);
		return c.json({ items: logs, count: logs.length });
	} catch (error) {
		const message = (error as Error).message;
		const status = message === 'Неавторизовано' ? 401 : 500;
		if (status >= 500) console.error('Reminders logs failed', error);
		return c.json({ error: message }, status);
	}
});

export default {
	fetch: app.fetch,
	async scheduled(event, env, ctx) {
		ctx.waitUntil(
			(async () => {
				await updateAllData(env);
				await sendReminders(env);
			})()
		);
	},
};
