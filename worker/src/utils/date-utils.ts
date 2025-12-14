export const todayISO = (): string => new Date().toISOString().split('T')[0]!;

export const normalizeDateOnly = (value?: string | null): string | null => {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value.trim() || null;
	}
	return parsed.toISOString().split('T')[0] ?? null;
};
