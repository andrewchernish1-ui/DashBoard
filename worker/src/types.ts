export type Bindings = {
	DB: D1Database;
	COMPOSIO_API_KEY: string;
	COMPOSIO_CONNECTION_ID: string;
	GOOGLE_SHEET_ID: string;
	COMPOSIO_USER_ID: string;
	COMPOSIO_CALENDAR_CONNECTION_ID?: string;
	COMPOSIO_CALENDAR_USER_ID?: string;
	COMPOSIO_CALENDAR_AUTH_CONFIG_ID?: string;
	GOOGLE_SHEET_RANGE?: string;
	PAYMENTS_SHEET_RANGE?: string;
	API_SECRET?: string;
	GOOGLE_CALENDAR_ID?: string;
	TELEGRAM_BOT_TOKEN?: string;
	TIMEZONE_DEFAULT?: string;
	REMINDER_DEDUP_MINUTES?: string;
	REMINDER_STATUSES_SKIP?: string;
	REMINDER_TEMPLATE?: string;
};

export type ExerciseRow = {
	date: string;
	exercise_name: string;
	weight: number;
};

export type PaymentRow = {
	id: number;
	client_name: string;
	plan: string | null;
	amount: number | null;
	status: string | null;
	next_payment: string | null;
	notes: string | null;
};

export type TelegramStatRow = {
	date: string;
	subscribers: number;
	total_views_24h: number;
	created_at: number;
};
