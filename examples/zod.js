import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { z } from 'zod';
import { createSchemaMiddleware } from '../src/index.js';

const app = express();
app.use(express.json());

const userParamsSchema = z.object({
	id: z.coerce.number().int().positive(),
});
const createUserSchema = z.object({
	name: z.string().min(1),
	email: z.email(),
});
const userResponseSchema = z.object({
	id: z.number().int().positive(),
	name: z.string(),
	email: z.email(),
});

app.use(createSchemaMiddleware({
	routes: {
		'POST /users': {
			request: createUserSchema,
			response: userResponseSchema,
		},
		'GET /users/:id': {
			urlParams: userParamsSchema,
			response: userResponseSchema,
		},
	},
	parse: (schema, data, { phase, params }) => {
		if (phase === 'response' && 'id' in params) {
			console.log(`Validated response for user ${params.id}`);
		}
		return schema.parse(data);
	},
}));

app.post('/users', (request, response) => {
	response.status(201).json({ id: 1, ...request.body });
});

app.get('/users/:id', (request, response) => {
	const { id } = response.locals.schemaParams;
	response.json({ id, name: 'Ada Lovelace', email: 'ada@example.com' });
});

app.use((error, request, response, next) => {
	if (response.headersSent) {
		return next(error);
	}
	response.status(400).json({ error: error.message });
});

const server = createServer(app);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (address === null || typeof address === 'string') {
	throw new Error('Could not determine the example server address');
}
const baseURL = `http://127.0.0.1:${address.port}`;

try {
	const createdUser = await fetch(`${baseURL}/users`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.com' }),
	});
	console.log('Created user:', await createdUser.json());

	const fetchedUser = await fetch(`${baseURL}/users/1`);
	console.log('Fetched user:', await fetchedUser.json());

	const invalidUser = await fetch(`${baseURL}/users`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: '', email: 'not-an-email' }),
	});
	console.log('Invalid request:', invalidUser.status, await invalidUser.json());
} finally {
	server.close();
	await once(server, 'close');
}
