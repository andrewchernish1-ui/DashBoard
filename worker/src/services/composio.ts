import type { Bindings } from '../types';
import { normalizeDateInput, normalizePaymentStatus } from './payment-utils';
import { todayISO, normalizeDateOnly } from '../utils/date-utils';
import { extractSheetName } from '../utils/sheets';

export type SheetExercise = {
	name: string;
	weight: number;
	date?: string | null;
};

export type SheetPayment = {
	name: string;
	plan: string | null;
	amount: number;
	status: string;
	nextPayment: string | null;
	notes: string | null;
	telegramChatId?: string | null;
	telegramUsername?: string | null;
	notifyOptIn?: boolean;
	timezone?: string | null;
	lastNotifiedOffset?: number | null;
	lastNotifiedAt?: string | null;
	errorMessage?: string | null;
	/** Порядковый номер строки в листе (начиная с 1) */
	rowNumber?: number;
};

export type CalendarEvent = {
	id: string;
	summary: string;
	start: string | null;
	end: string | null;
	location?: string | null;
	description?: string | null;
};

type ComposioResponse<T = unknown> = {
	data?: T;
	error?: string | Record<string, unknown>;
	successful?: boolean;
	message?: string;
	log_id?: string;
};

type SheetDataResponse = {
	spreadsheet_data?: {
		valueRanges?: Array<{
			values?: string[][];
		}>;
	};
	valueRanges?: Array<{
		values?: string[][];
	}>;
};

type CalendarEventsResponse = {
	events?: Array<{
		id?: string;
		summary?: string;
		start?: { date?: string; dateTime?: string };
		end?: { date?: string; dateTime?: string };
		location?: string;
		description?: string;
	}>;
	items?: Array<{
		id?: string;
		summary?: string;
		start?: { date?: string; dateTime?: string };
		end?: { date?: string; dateTime?: string };
		location?: string;
		description?: string;
	}>;
};

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3/tools/execute';
const DEFAULT_EXERCISE_RANGE = 'Лист1!A2:C1000';
const DEFAULT_PAYMENTS_RANGE = 'Лист2!A2:M1000';

const getExerciseRange = (env: Bindings): string => env.GOOGLE_SHEET_RANGE ?? DEFAULT_EXERCISE_RANGE;
const getPaymentsRange = (env: Bindings): string => env.PAYMENTS_SHEET_RANGE ?? DEFAULT_PAYMENTS_RANGE;

async function executeComposioAction<T = unknown>(
	env: Bindings,
	action: string,
	args: Record<string, unknown>,
	overrides?: {
		connectedAccountId?: string;
		userId?: string;
		authConfigId?: string;
	}
): Promise<ComposioResponse<T>> {
	const connectedAccountId = overrides?.connectedAccountId ?? env.COMPOSIO_CONNECTION_ID;
	const userId = overrides?.userId ?? env.COMPOSIO_USER_ID;
	const response = await fetch(`${COMPOSIO_BASE}/${action}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': env.COMPOSIO_API_KEY,
		},
		body: JSON.stringify({
			connected_account_id: connectedAccountId,
			user_id: userId,
			entity_id: userId,
			...(overrides?.authConfigId ? { auth_config_id: overrides.authConfigId } : {}),
			arguments: args,
		}),
	});

	const payload = (await response.json()) as ComposioResponse<T>;
	if (!response.ok || payload.successful === false) {
		const reason =
			(typeof payload.error === 'string' && payload.error) ||
			(typeof payload.error === 'object' ? JSON.stringify(payload.error) : undefined) ||
			payload.message ||
			response.statusText;
		throw new Error(`Composio request failed: ${reason}`);
	}
	return payload;
}

async function fetchRange(env: Bindings, range: string): Promise<string[][]> {
	const payload = await executeComposioAction<SheetDataResponse>(env, 'GOOGLESHEETS_BATCH_GET', {
		spreadsheet_id: env.GOOGLE_SHEET_ID,
		ranges: [range],
	});

	const valueRanges =
		payload.data?.spreadsheet_data?.valueRanges ??
		payload.data?.valueRanges ??
		[];

	const rows =
		valueRanges?.[0]?.values ??
		valueRanges.flatMap((valueRange) => valueRange.values ?? []).filter(Boolean);
	return rows ?? [];
}

export async function fetchExerciseSheetData(env: Bindings): Promise<SheetExercise[]> {
	const rows = await fetchRange(env, getExerciseRange(env));

	const normalizeExerciseName = (value: string): string => {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'press' || normalized === 'bench press') return 'Bench Press';
		return value.trim();
	};

	return rows
		.map((row) => {
			const [name, weightStr, dateRaw] = row;
			const weight = parseFloat(weightStr ?? '');
			if (!name || Number.isNaN(weight)) {
				return null;
			}
			return {
				name: normalizeExerciseName(name),
				weight,
				date: normalizeDateOnly(dateRaw) ?? todayISO(),
			};
		})
		.filter((item): item is SheetExercise => Boolean(item));
}

export async function fetchPaymentSheetData(env: Bindings): Promise<SheetPayment[]> {
	const rows = await fetchRange(env, getPaymentsRange(env));
	return rows
		.map((row, index) => {
			const [
				name,
				plan,
				amountStr,
				nextPayment,
				status,
				notes,
				telegramChatId,
				telegramUsername,
				notifyOptIn,
				timezone,
				lastNotifiedOffset,
				lastNotifiedAt,
				errorMessage,
			] = row;
			const amount = parseFloat((amountStr ?? '').toString().replace(/\s/g, '').replace(',', '.'));
			const chatId = telegramChatId ? String(telegramChatId).trim() : null;
			const optInValue = String(notifyOptIn ?? '').trim().toLowerCase();
			const optIn =
				optInValue === ''
					? true
					: ['no', 'n', '0', 'false', 'off'].includes(optInValue) === false;
			const parsedOffset = Number.parseInt(String(lastNotifiedOffset ?? '').trim(), 10);
			if (!name) return null;
			return {
				name: name.trim(),
				plan: plan?.trim() ?? null,
				amount: Number.isNaN(amount) ? 0 : amount,
				status: normalizePaymentStatus(status),
				nextPayment: normalizeDateInput(nextPayment),
				notes: notes?.trim() || null,
				telegramChatId: chatId && chatId.length > 0 ? chatId : null,
				telegramUsername: telegramUsername ? String(telegramUsername).trim() : null,
				notifyOptIn: optIn,
				timezone: timezone ? String(timezone).trim() : null,
				lastNotifiedOffset: Number.isNaN(parsedOffset) ? null : parsedOffset,
				lastNotifiedAt: lastNotifiedAt ? String(lastNotifiedAt).trim() : null,
				errorMessage: errorMessage ? String(errorMessage) : null,
				rowNumber: index + 2, // A2 соответствует индексу 0
			};
		})
		.filter((item): item is SheetPayment => Boolean(item?.name));
}

// Отладочный вызов для просмотра сырых данных из листа упражнений
export async function debugFetchExerciseRaw(env: Bindings) {
	return executeComposioAction<SheetDataResponse>(env, 'GOOGLESHEETS_BATCH_GET', {
		spreadsheet_id: env.GOOGLE_SHEET_ID,
		ranges: [getExerciseRange(env)],
	});
}

export async function initializeSheets(env: Bindings) {
	const exerciseSheet = extractSheetName(getExerciseRange(env));
	const paymentSheet = extractSheetName(getPaymentsRange(env));

	await executeComposioAction(env, 'GOOGLESHEETS_CLEAR_VALUES', {
		spreadsheet_id: env.GOOGLE_SHEET_ID,
		range: `${exerciseSheet}!A2:B1000`,
	});

	await executeComposioAction(env, 'GOOGLESHEETS_BATCH_UPDATE', {
		spreadsheet_id: env.GOOGLE_SHEET_ID,
		sheet_name: exerciseSheet,
		values: [['Упражнение', 'Вес (кг)']],
		first_cell_location: 'A1',
		valueInputOption: 'USER_ENTERED',
	});

	await executeComposioAction(env, 'GOOGLESHEETS_CLEAR_VALUES', {
		spreadsheet_id: env.GOOGLE_SHEET_ID,
		range: `${paymentSheet}!A2:M1000`,
	});

	await executeComposioAction(env, 'GOOGLESHEETS_BATCH_UPDATE', {
		spreadsheet_id: env.GOOGLE_SHEET_ID,
		sheet_name: paymentSheet,
		values: [
			[
				'Клиент',
				'План',
				'Сумма',
				'Следующая оплата',
				'Статус',
				'Примечание',
				'Telegram chat id',
				'Telegram username',
				'Notify opt-in',
				'Timezone',
				'Last notified offset',
				'Last notified at',
				'Error message',
			],
		],
		first_cell_location: 'A1',
		valueInputOption: 'USER_ENTERED',
	});
}

export async function appendPaymentRow(env: Bindings, row: SheetPayment) {
	const sheetName = extractSheetName(getPaymentsRange(env));
	await executeComposioAction(env, 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND', {
		spreadsheetId: env.GOOGLE_SHEET_ID,
		range: `${sheetName}!A:M`,
		valueInputOption: 'USER_ENTERED',
		majorDimension: 'ROWS',
		values: [
			[
				row.name,
				row.plan ?? '',
				row.amount ?? '',
				row.nextPayment ?? '',
				row.status ?? '',
				row.notes ?? '',
				row.telegramChatId ?? '',
				row.telegramUsername ?? '',
				row.notifyOptIn ?? '',
				row.timezone ?? '',
				row.lastNotifiedOffset ?? '',
				row.lastNotifiedAt ?? '',
				row.errorMessage ?? '',
			],
		],
	});
}

export async function updatePaymentRow(env: Bindings, rowNumber: number, row: SheetPayment) {
	const sheetName = extractSheetName(getPaymentsRange(env));
	await executeComposioAction(env, 'GOOGLESHEETS_BATCH_UPDATE', {
		spreadsheet_id: env.GOOGLE_SHEET_ID,
		sheet_name: sheetName,
		values: [
			[
				row.name,
				row.plan ?? '',
				row.amount ?? '',
				row.nextPayment ?? '',
				row.status ?? '',
				row.notes ?? '',
				row.telegramChatId ?? '',
				row.telegramUsername ?? '',
				row.notifyOptIn ?? '',
				row.timezone ?? '',
				row.lastNotifiedOffset ?? '',
				row.lastNotifiedAt ?? '',
				row.errorMessage ?? '',
			],
		],
		first_cell_location: `A${rowNumber}`,
		valueInputOption: 'USER_ENTERED',
	});
}

export async function clearPaymentRow(env: Bindings, rowNumber: number) {
	const sheetName = extractSheetName(getPaymentsRange(env));
	await executeComposioAction(env, 'GOOGLESHEETS_CLEAR_VALUES', {
		spreadsheet_id: env.GOOGLE_SHEET_ID,
		range: `${sheetName}!A${rowNumber}:F${rowNumber}`,
	});
}

export async function appendExerciseRow(env: Bindings, row: SheetExercise) {
	const sheetName = extractSheetName(getExerciseRange(env));
	await executeComposioAction(env, 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND', {
		spreadsheetId: env.GOOGLE_SHEET_ID,
		range: `${sheetName}!A:B`,
		valueInputOption: 'USER_ENTERED',
		majorDimension: 'ROWS',
		values: [[row.name, row.weight]],
	});
}

export async function rewriteExerciseSheet(env: Bindings, rows: SheetExercise[]) {
	const sheetName = extractSheetName(getExerciseRange(env));
	await executeComposioAction(env, 'GOOGLESHEETS_CLEAR_VALUES', {
		spreadsheet_id: env.GOOGLE_SHEET_ID,
		range: `${sheetName}!A2:C1000`,
	});

	if (rows.length === 0) return;

	await executeComposioAction(env, 'GOOGLESHEETS_BATCH_UPDATE', {
		spreadsheet_id: env.GOOGLE_SHEET_ID,
		sheet_name: sheetName,
		values: rows.map((row) => [row.name, row.weight ?? '', row.date ?? '']),
		first_cell_location: 'A2',
		valueInputOption: 'USER_ENTERED',
	});
}

export async function fetchCalendarEvents(env: Bindings, from: string, to: string): Promise<CalendarEvent[]> {
	const calendarId = env.GOOGLE_CALENDAR_ID;
	if (!calendarId) return [];

	const payload = await executeComposioAction<CalendarEventsResponse>(
		env,
		'GOOGLECALENDAR_EVENTS_LIST',
		{
			calendarId,
			timeMin: from,
			timeMax: to,
			maxResults: 20,
			singleEvents: true,
			orderBy: 'startTime',
		},
		{
			connectedAccountId: env.COMPOSIO_CALENDAR_CONNECTION_ID,
			userId: env.COMPOSIO_CALENDAR_USER_ID,
			authConfigId: env.COMPOSIO_CALENDAR_AUTH_CONFIG_ID,
		}
	);

	const events =
		(payload.data?.events ?? payload.data?.items ?? [])?.map((event) => ({
			id: event.id ?? crypto.randomUUID(),
			summary: event.summary ?? 'Событие',
			start: event.start?.dateTime ?? event.start?.date ?? null,
			end: event.end?.dateTime ?? event.end?.date ?? null,
			location: event.location ?? null,
			description: event.description ?? null,
		})) ?? [];

	return events;
}

// Вспомогательная функция для отладки (возвращает «сырые» данные Composio)
export async function fetchCalendarEventsRaw(env: Bindings, from: string, to: string) {
	const calendarId = env.GOOGLE_CALENDAR_ID;
	if (!calendarId) return null;

	return executeComposioAction<CalendarEventsResponse>(
		env,
		'GOOGLECALENDAR_EVENTS_LIST',
		{
			calendarId,
			timeMin: from,
			timeMax: to,
			maxResults: 20,
			singleEvents: true,
			orderBy: 'startTime',
		},
		{
			connectedAccountId: env.COMPOSIO_CALENDAR_CONNECTION_ID,
			userId: env.COMPOSIO_CALENDAR_USER_ID,
			authConfigId: env.COMPOSIO_CALENDAR_AUTH_CONFIG_ID,
		}
	);
}

export async function fetchCalendarList(env: Bindings) {
	return executeComposioAction(
		env,
		'GOOGLECALENDAR_LIST_CALENDARS',
		{},
		{
			connectedAccountId: env.COMPOSIO_CALENDAR_CONNECTION_ID,
			userId: env.COMPOSIO_CALENDAR_USER_ID,
			authConfigId: env.COMPOSIO_CALENDAR_AUTH_CONFIG_ID,
		}
	);
}
