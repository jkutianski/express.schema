import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createServer } from 'node:http';
import { createSchemaMiddleware } from '../src/index.js';
import { matchRoute, parseRouteEntries } from '../src/utils.schema/src/index.js';

function createResponse() {
	let resolveSent;
	const sent = new Promise((resolve) => {
		resolveSent = resolve;
	});
	const response = {
		locals: {},
		json(data) {
			resolveSent(data);
			return this;
		},
	};

	return { response, sent };
}

function createRequest(overrides = {}) {
	return {
		method: 'GET',
		path: '/users/42',
		originalUrl: '/users/42?active=true',
		body: undefined,
		...overrides,
	};
}

test('checks the shared route matcher', () => {
	const schema = { request: 'request-schema' };
	const routes = parseRouteEntries({
		'GET /users/:id?view=:view': schema,
	});

	expect(matchRoute('get', '/users/42', new URLSearchParams('view=compact'), routes))
		.toEqual({ params: { id: '42', view: 'compact' }, schema });
});

test('parses URL params and request bodies, then validates JSON responses', async () => {
	const phases = [];
	const middleware = createSchemaMiddleware({
		routes: {
			'POST /users/:id?active=:active': {
				urlParams: 'params',
				request: 'request',
				response: 'response',
			},
		},
		parse: (schema, data, context) => {
			phases.push({ schema, phase: context.phase, params: context.params });
			if (context.phase === 'urlParams') {
				return { ...data, id: Number(data.id), active: data.active === 'true' };
			}
			return { ...data, validated: true };
		},
	});
	const request = createRequest({
		method: 'POST',
		body: { name: 'Ada' },
	});
	const { response, sent } = createResponse();
	let nextCalls = 0;

	middleware(request, response, (error) => {
		assert.equal(error, undefined);
		nextCalls += 1;
	});

	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(nextCalls, 1);
	assert.deepEqual(request.body, { name: 'Ada', validated: true });
	assert.deepEqual(response.locals.schemaParams, { id: 42, active: true });
	response.json({ id: 42 });
	assert.deepEqual(await sent, { id: 42, validated: true });
	assert.deepEqual(phases.map(({ phase }) => phase), ['urlParams', 'request', 'response']);
	assert.deepEqual(phases[1].params, { id: 42, active: true });
	assert.deepEqual(phases[2].params, { id: 42, active: true });
});

test('leaves non-matching routes unchanged', () => {
	let parseCalls = 0;
	let nextCalls = 0;
	const middleware = createSchemaMiddleware({
		routes: {
			'POST /users/:id': { request: 'request' },
		},
		parse: () => {
			parseCalls += 1;
		},
	});

	middleware(createRequest(), createResponse().response, () => {
		nextCalls += 1;
	});

	assert.equal(parseCalls, 0);
	assert.equal(nextCalls, 1);
});

test('matches static paths, defaults to GET and falls back to the request URL', async () => {
	let parseCalls = 0;
	const middleware = createSchemaMiddleware({
		routes: {
			'GET /users': { request: 'request' },
		},
		parse: (schema, data) => {
			parseCalls += 1;
			return data;
		},
	});
	const invoke = (request) => new Promise((resolve) => {
		middleware(request, createResponse().response, resolve);
	});

	for (const request of [
		createRequest({ method: undefined, path: '/users', originalUrl: undefined, url: '/users' }),
		createRequest({ path: '/users', originalUrl: undefined, url: undefined }),
	]) {
		await expect(invoke(request)).resolves.toBeUndefined();
	}

	for (const request of [
		createRequest({ method: 'GET', path: '/other', url: '/other' }),
		createRequest({ method: 'GET', path: '/users/42', url: '/users/42' }),
		createRequest({ method: 'GET', path: undefined, url: '/users' }),
	]) {
		await expect(invoke(request)).resolves.toBeUndefined();
	}

	expect(parseCalls).toBe(2);
});

test('does not match missing or mismatched query parameters', async () => {
	let parseCalls = 0;
	const middleware = createSchemaMiddleware({
		routes: {
			'GET /users/:id?active=true&role=:role': { request: 'request' },
		},
		parse: (schema, data) => {
			parseCalls += 1;
			return data;
		},
	});
	const invoke = (url) => new Promise((resolve) => {
		middleware(
			createRequest({ path: url.split('?')[0], originalUrl: url, url }),
			createResponse().response,
			resolve,
		);
	});

	for (const url of [
		'/users/42?role=admin',
		'/users/42?active=false&role=admin',
		'/users?active=true&role=admin',
	]) {
		await expect(invoke(url)).resolves.toBeUndefined();
	}

	await expect(invoke('/users/42?active=true&role=admin')).resolves.toBeUndefined();
	expect(parseCalls).toBe(1);
});

test('forwards malformed encoded paths to Express error handling', async () => {
	const middleware = createSchemaMiddleware({
		routes: {
			'GET /users/:id': { request: 'request' },
		},
		parse: (schema, data) => data,
	});
	const request = createRequest({
		path: '/users/%E0%A4%A',
		originalUrl: '/users/%E0%A4%A',
	});
	const forwardedError = await new Promise((resolve) => {
		middleware(request, createResponse().response, resolve);
	});

	expect(forwardedError).toBeInstanceOf(URIError);
});

test('forwards parser errors to Express error handling', async () => {
	const failure = new Error('Invalid request');
	const middleware = createSchemaMiddleware({
		routes: {
			'POST /users/:id': { request: 'request' },
		},
		parse: () => {
			throw failure;
		},
	});
	let forwardedError;

	middleware(
		createRequest({ method: 'POST', body: {} }),
		createResponse().response,
		(error) => {
			forwardedError = error;
		},
	);

	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(forwardedError, failure);
});

test('forwards response parser errors to Express error handling', async () => {
	const failure = new Error('Invalid response');
	const middleware = createSchemaMiddleware({
		routes: {
			'GET /users/:id': { response: 'response' },
		},
		parse: () => {
			throw failure;
		},
	});
	const { response } = createResponse();
	let forwardedError;

	middleware(createRequest(), response, (error) => {
		forwardedError = error;
	});
	await new Promise((resolve) => setImmediate(resolve));
	response.json({});
	await new Promise((resolve) => setImmediate(resolve));

	assert.equal(forwardedError, failure);
});

test('rejects non-object URL params parser results', async () => {
	for (const result of [null, [], 'invalid']) {
		const middleware = createSchemaMiddleware({
			routes: {
				'GET /users/:id': { urlParams: 'params' },
			},
			parse: () => result,
		});
		const forwardedError = await new Promise((resolve) => {
			middleware(createRequest(), createResponse().response, resolve);
		});

		expect(forwardedError).toBeInstanceOf(TypeError);
		expect(forwardedError.message).toBe('urlParams parser must return an object');
	}
});

test('validates configuration before returning middleware', () => {
	assert.throws(
		() => createSchemaMiddleware(),
		{ name: 'TypeError', message: 'routes must be an object keyed by "METHOD /path"' },
	);
	assert.throws(
		() => createSchemaMiddleware({ routes: [], parse: () => undefined }),
		{ name: 'TypeError', message: 'routes must be an object keyed by "METHOD /path"' },
	);
	assert.throws(
		() => createSchemaMiddleware({ routes: null, parse: () => undefined }),
		{ name: 'TypeError', message: 'routes must be an object keyed by "METHOD /path"' },
	);
	assert.throws(
		() => createSchemaMiddleware({ routes: {}, parse: undefined }),
		{ name: 'TypeError', message: 'parse must be a function' },
	);
	assert.throws(
		() => createSchemaMiddleware({ routes: { invalid: {} }, parse: () => undefined }),
		{ name: 'TypeError', message: 'invalid route key: invalid' },
	);
	assert.throws(
		() => createSchemaMiddleware({ routes: { 'GET /users#fragment': {} }, parse: () => undefined }),
		{ name: 'TypeError', message: 'invalid route key: GET /users#fragment' },
	);
	assert.throws(
		() => createSchemaMiddleware({ routes: { 'GET /users?': {} }, parse: () => undefined }),
		{ name: 'TypeError', message: 'invalid route key: GET /users?' },
	);
});

test('works with an Express server and forwards validation failures', async () => {
	const app = express();
	app.use(express.json());
	app.use(createSchemaMiddleware({
		routes: {
			'POST /users/:id': {
				urlParams: 'params',
				request: 'request',
				response: 'response',
			},
		},
		parse: (schema, data, context) => {
			if (schema === 'params') {
				return { ...data, id: Number(data.id) };
			}
			if (schema === 'request' && typeof data?.name !== 'string') {
				throw new TypeError('name is required');
			}
			return data;
		},
	}));
	app.post('/users/:id', (request, response) => {
		response.json({ id: response.locals.schemaParams.id, ...request.body });
	});
	app.use((error, request, response, next) => {
		response.status(400).json({ error: error.message });
	});

	const server = createServer(app);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.notEqual(address, null);

	try {
		const baseURL = `http://127.0.0.1:${address.port}`;
		const validResponse = await fetch(`${baseURL}/users/42`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'Ada' }),
		});
		assert.equal(validResponse.status, 200);
		expect(await validResponse.json()).toEqual({ id: 42, name: 'Ada' });

		const invalidResponse = await fetch(`${baseURL}/users/42`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 42 }),
		});
		assert.equal(invalidResponse.status, 400);
		expect(await invalidResponse.json()).toEqual({ error: 'name is required' });
	} finally {
		server.close();
		await once(server, 'close');
	}
});
