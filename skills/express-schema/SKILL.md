---
name: express-schema
description: "Use express.schema to validate Express URL params, request bodies, and JSON responses with route-based matching and a custom parser, Zod, or Ajv; also use when maintaining this package."
---

# express.schema

## What this package does

`express.schema` creates an Express request handler that matches requests against a route map and runs a user-supplied parser for captured URL params, request bodies, and JSON responses.

```js
createSchemaMiddleware({ routes, parse })
```

It is validator-agnostic. Express is a peer dependency; use Zod, Ajv/JSON Schema, or a custom parser as desired.

## Install and setup

```sh
npm install express.schema express
npm install zod
```

Register body parsing first, then schema middleware, then the routes:

```js
app.use(express.json());
app.use(createSchemaMiddleware({ routes, parse }));
app.post('/users', handler);
```

## Route definitions

```js
const routes = {
  'GET /users/:id': {
    urlParams: userParamsSchema,
    response: userResponseSchema,
  },
  'POST /users': {
    request: createUserSchema,
    response: userResponseSchema,
  },
  'GET /users?active=true&id=:id': {
    urlParams: userParamsSchema,
  },
};
```

- Keys use `METHOD /path`, optionally with a query string.
- Method matching is case-insensitive.
- `:name` in a path segment captures one non-empty segment; static segments match exactly.
- Query placeholders capture strings. Literal query values must match exactly; unlisted query params are ignored.
- URL captures begin as strings. Use coercion, e.g. `z.coerce.number()`, when a normalized number is needed.

## Parser behavior

The parser signature is `(schema, data, context)` and supports promises. `context.phase` is `'urlParams'`, `'request'`, or `'response'`. It also contains `request`, `response`, and `params`.

1. `urlParams` parses the captured params object first. It must return a non-null, non-array object. That result is stored in `res.locals.schemaParams`.
2. `request` parses `req.body`; its returned value replaces the body.
3. `response` parses data passed to `res.json()`; its returned value is sent instead.

The `urlParams` phase receives original string-valued captures. Request and response phases receive the parsed params object when URL-param parsing is configured. `res.send()` is not intercepted.

Thrown and rejected parser errors are forwarded to Express with `next(error)`. Provide an Express error handler to set status codes and format validation errors. Unmatched routes continue unchanged.

## Troubleshooting

- Ensure `express.json()` or another body parser is registered before this middleware.
- Ensure the middleware is registered before the route handlers it should cover.
- Check method, path segment count, and required query params in the route key.
- Remember URL captures are strings until transformed by the `urlParams` parser.
- Use `res.json()` for response parsing; `res.send()` bypasses the response schema.
- Use Express error middleware to translate parser errors into client responses.

## Maintaining this repository

Relevant files:

- `src/index.js`: matcher and Express request handler
- `src/index.d.ts`: parser and route-map types
- `test/index.test.js`: Jest tests, including an HTTP integration test
- `examples/`: Zod, Ajv, and TypeScript examples
- `docs/agent-guide.md`: detailed execution flow and development notes

Validation:

```sh
npm test
npm run test:coverage
npm run test:types
npm run example:zod
npm run example:json-schema
```

Keep the package ESM, preserve the asynchronous parser contract, and add regression tests for behavior changes. The configured Jest coverage threshold is 100% for statements, branches, functions, and lines.
