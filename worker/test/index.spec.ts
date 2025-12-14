import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

describe('Hello World user worker', () => {
	describe('request for /message', () => {
		it('/ отвечает 404, так как маршрута нет (unit style)', async () => {
			const request = new Request<unknown, IncomingRequestCfProperties>('http://example.com/message');
			// Create an empty context to pass to `worker.fetch()`.
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(404);
			expect(await response.text()).toMatchInlineSnapshot(`"404 Not Found"`);
		});

		it('responds 404 (integration style)', async () => {
			const request = new Request('http://example.com/message');
			const response = await SELF.fetch(request);
			expect(response.status).toBe(404);
			expect(await response.text()).toMatchInlineSnapshot(`"404 Not Found"`);
		});
	});

	describe('request for /random', () => {
		it('/ отвечает 404, так как маршрута нет (unit style)', async () => {
			const request = new Request<unknown, IncomingRequestCfProperties>('http://example.com/random');
			// Create an empty context to pass to `worker.fetch()`.
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(404);
			expect(await response.text()).toMatchInlineSnapshot(`"404 Not Found"`);
		});

		it('responds 404 (integration style)', async () => {
			const request = new Request('http://example.com/random');
			const response = await SELF.fetch(request);
			expect(response.status).toBe(404);
			expect(await response.text()).toMatchInlineSnapshot(`"404 Not Found"`);
		});
	});
});
