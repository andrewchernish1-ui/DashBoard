import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				// Используем основной wrangler.toml, чтобы не требовать отдельный wrangler.jsonc
				wrangler: { configPath: './wrangler.toml' },
			},
		},
	},
});
