import { z } from 'zod';
import { createSchemaMiddleware } from '../src/index.js';

const userParams = z.object({
	id: z.coerce.number(),
});

const userBody = z.object({
	name: z.string(),
});

createSchemaMiddleware({
	routes: {
		'POST /users/:id': {
			urlParams: userParams,
			request: userBody,
			response: userBody,
		},
	},
	parse: (schema, data, context) => {
		if (context.phase === 'urlParams') {
			const id: string = context.params.id;
			void id;
		}

		if (context.phase === 'request' || context.phase === 'response') {
			const id: number = context.params.id;
			void id;
		}

		if (context.phase === 'response') {
			context.response.status(200);
		}

		return schema.parse(data);
	},
});
