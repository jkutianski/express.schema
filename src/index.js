import { matchRoute, parseRouteEntries } from './utils.schema/src/index.js';

/**
 * Creates route-based validation middleware for Express.
 *
 * @param {{
 *   routes: Record<string, {
 *     urlParams?: unknown,
 *     request?: unknown,
 *     response?: unknown,
 *   }>,
 *   parse: (schema: unknown, data: unknown, context: {
 *     phase: 'urlParams' | 'request' | 'response',
 *     request: import('express').Request,
 *     response: import('express').Response,
 *     params: Record<string, unknown>,
 *   }) => unknown | Promise<unknown>
 * }} options - Middleware configuration.
 * @returns {import('express').RequestHandler} Express middleware.
 * @throws {TypeError} If routes, route keys, or the parser are invalid.
 */
export function createSchemaMiddleware(options) {
	const { routes, parse } = options ?? {};

	if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
		throw new TypeError('routes must be an object keyed by "METHOD /path"');
	}

	if (typeof parse !== 'function') {
		throw new TypeError('parse must be a function');
	}

	const routeEntries = parseRouteEntries(routes);

	return function schemaMiddleware(request, response, next) {
		let match;
		try {
			const requestUrl = request.originalUrl ?? request.url ?? '/';
			const searchParams = new URL(requestUrl, 'http://localhost').searchParams;
			const pathname = typeof request.path === 'string' ? request.path : '';
			match = matchRoute(request.method, pathname, searchParams, routeEntries);
		} catch (error) {
			return next(error);
		}

		if (match === undefined) {
			return next();
		}

		const { schema } = match;
		const processRequest = async () => {
			let params = match.params;
			if (schema.urlParams !== undefined) {
				const parsedParams = await parse(schema.urlParams, params, {
					phase: 'urlParams',
					request,
					response,
					params,
				});
				if (parsedParams === null || typeof parsedParams !== 'object' || Array.isArray(parsedParams)) {
					throw new TypeError('urlParams parser must return an object');
				}
				params = parsedParams;
			}

			response.locals.schemaParams = params;

			if (schema.request !== undefined) {
				request.body = await parse(schema.request, request.body, {
					phase: 'request',
					request,
					response,
					params,
				});
			}

			if (schema.response !== undefined) {
				const sendJSON = response.json;
				response.json = function sendValidatedJSON(data) {
					Promise.resolve()
						.then(() => parse(schema.response, data, {
							phase: 'response',
							request,
							response,
							params,
						}))
						.then((parsedData) => sendJSON.call(this, parsedData))
						.catch(next);
					return this;
				};
			}
		};

		processRequest().then(() => next(), (error) => next(error));
	};
}
