import express from 'express';
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
	parse: (schema, data, context) => {
		if (context.phase === 'urlParams') {
			const capturedId: string = context.params.id;
			void capturedId;
		}
		if (context.phase === 'request' || context.phase === 'response') {
			const parsedId: string | number = context.params.id;
			void parsedId;
		}
		return schema.parse(data);
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
