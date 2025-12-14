export const DEFAULT_STATUS = 'ok';

export const normalizePaymentStatus = (value?: string | null): string => {
	if (!value) return DEFAULT_STATUS;
	const normalized = value.trim().toLowerCase();
	if (['urgent', 'warning', 'ok', 'paid', 'cancelled', 'canceled'].includes(normalized)) {
		if (normalized === 'canceled') return 'cancelled';
		return normalized;
	}
	if (normalized.includes('сроч')) return 'urgent';
	if (normalized.includes('недел') || normalized.includes('скоро')) return 'warning';
	return DEFAULT_STATUS;
};

export const normalizeDateInput = (value?: string | null): string | null => {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value.trim() || null;
	}
	return parsed.toISOString().split('T')[0] ?? null;
};
