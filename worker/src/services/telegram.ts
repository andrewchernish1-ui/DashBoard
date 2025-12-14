import { load } from 'cheerio';

export type TelegramPost = {
	post_id: string;
	channel_name: string;
	title: string;
	content: string;
	link: string;
	published_at: string | null;
	views: number;
};

export type TelegramSnapshot = {
	subscribers: number;
	total_views_metric: number;
	recent_posts: TelegramPost[];
};

const CHANNEL_URL = 'https://t.me/s/chernish_training';
const FALLBACK_CHANNEL_URL = `https://r.jina.ai/https://t.me/s/chernish_training`;

async function fetchChannelHtml(): Promise<string> {
	const primary = await fetch(CHANNEL_URL, {
		headers: {
			accept: 'text/html,application/xhtml+xml',
			'user-agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36',
		},
	});

	if (primary.ok) {
		return primary.text();
	}

	const fallback = await fetch(FALLBACK_CHANNEL_URL, {
		headers: {
			accept: 'text/html,application/xhtml+xml',
			'user-agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36',
		},
	});

	if (!fallback.ok) {
		throw new Error(`Telegram responded with status ${primary.status} and fallback ${fallback.status}`);
	}
	return fallback.text();
}

const parseMetric = (rawValue: string | undefined): number => {
	if (!rawValue) return 0;
	const normalized = rawValue.replace(/\s+/g, '').replace(/[^0-9kKmM.,]/g, '');
	if (!normalized) return 0;
	if (/k/i.test(normalized)) {
		return Math.round(parseFloat(normalized) * 1_000);
	}
	if (/m/i.test(normalized)) {
		return Math.round(parseFloat(normalized) * 1_000_000);
	}
	const parsed = parseInt(normalized, 10);
	return Number.isNaN(parsed) ? 0 : parsed;
};

const buildPostTitle = (content: string): string => {
	if (!content) return 'Пост';
	const firstLine = content.split('\n').map((line) => line.trim()).find((line) => line.length > 0);
	if (!firstLine) return content.slice(0, 80);
	return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
};

export async function fetchTelegramStats(): Promise<TelegramSnapshot> {
	const html = await fetchChannelHtml();
	const $ = load(html);
	const channelName =
		$('.tgme_channel_info_header_title a')
			.first()
			.text()
			.trim() || 'Андрей Черныш';

	const subscribers = parseMetric($('.tgme_header_counter').first().text());

	const postsRaw = $('.tgme_widget_message').toArray();
	const lastThree = postsRaw.slice(-3);
	const posts: TelegramPost[] = lastThree
		.map((element) => {
			const el = $(element);
			const text = el.find('.tgme_widget_message_text').text().trim();
			const postId = el.attr('data-post') ?? crypto.randomUUID();
			const views = parseMetric(el.find('.tgme_widget_message_views').first().text());
			const datetime = el.find('time').attr('datetime') ?? el.find('.time').attr('datetime') ?? null;
			const linkSegment = el.attr('data-post') ?? '';
			const link = linkSegment ? `https://t.me/${linkSegment}` : CHANNEL_URL;

			return {
				post_id: postId,
				channel_name: channelName,
				title: buildPostTitle(text),
				content: text,
				link,
				published_at: datetime,
				views,
			};
		})
		.reverse(); // newest first

	let totalViewsSample = 0;
	$('.tgme_widget_message_views').each((_, element) => {
		totalViewsSample += parseMetric($(element).text());
	});

	return {
		subscribers: subscribers || 0,
		total_views_metric: totalViewsSample,
		recent_posts: posts,
	};
}
