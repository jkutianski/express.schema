import Ajv from 'ajv';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createSchemaMiddleware } from '../src/index.js';

const app = express();
const ajv = new Ajv();
app.use(express.json());

const userParamsSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', pattern: '^[1-9]\\d*$' },
	},
	required: ['id'],
	additionalProperties: false,
};
const createUserSchema = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1 },
		email: { type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
	},
	required: ['name', 'email'],
	additionalProperties: false,
};
const userResponseSchema = {
	type: 'object',
	properties: {
		id: { type: 'integer', minimum: 1 },
		name: { type: 'string' },
		email: { type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
	},
	required: ['id', 'name', 'email'],
	additionalProperties: false,
};

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
		const validate = ajv.compile(schema);
		if (!validate(data)) {
			throw new TypeError(ajv.errorsText(validate.errors));
		}
		if (phase === 'response' && 'id' in params) {
			console.log(`Validated response for user ${params.id}`);
		}
		return data;
	},
}));

app.post('/users', (request, response) => {
	response.status(201).json({ id: 1, ...request.body });
});

app.get('/users/:id', (request, response) => {
	response.json({
		id: Number(response.locals.schemaParams.id),
		name: 'Ada Lovelace',
		email: 'ada@example.com',
	});
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
