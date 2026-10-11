# Agent Guide

This project is a small ESM JavaScript library that installs route-based validation middleware for Express. It delegates schema validation and transformation to the consumer-supplied `parse` function.

## Project purpose

`express.schema` matches requests against a `routes` map and can parse:

- Captured path and query parameters (`urlParams`)
- Request bodies (`request`)
- JSON response payloads passed to `res.json()` (`response`)

The package does not bundle or require a schema library. It works with Zod, Ajv/JSON Schema, or a custom synchronous or asynchronous parser.

## Public API

```js
const middleware = createSchemaMiddleware({ routes, parse });
app.use(express.json());
app.use(middleware);
```

`createSchemaMiddleware` returns a standard Express `RequestHandler`. Register body parsing before this middleware, and register the middleware before the routes it should cover.

Each route key has the form `METHOD /path`, optionally followed by query patterns:

```js
{
  'GET /users/:id': { urlParams: paramsSchema, response: userSchema },
  'POST /users': { request: createUserSchema, response: userSchema },
  'GET /users?active=true&id=:id': { urlParams: paramsSchema }
}
```

## Matching behavior

- HTTP methods are case-insensitive.
- Static path segments must match exactly.
- A path segment beginning with `:` captures one non-empty segment.
- Query parameters in the route key must be present. `:name` values are captured; literal values must match exactly.
- Query parameters absent from the route key are ignored.
- Captured path and query values are strings.
- Malformed route keys are rejected when middleware is created. Malformed percent-encoding in a request path is forwarded through `next(error)`.
- Requests without a matching route continue through Express with `next()`.

## Parser contract and request flow

The parser receives `(schema, data, context)` and may return a value or a promise:

```js
parse(schema, data, context)
```

`context` contains:

- `phase`: `'urlParams'`, `'request'`, or `'response'`
- `request` and `response`: the Express request and response
- `params`: captured values during `urlParams`, or parsed params in subsequent phases

For matching requests, processing order is:

1. If configured, parse the captured URL params. The parser must return a non-null object (not an array).
2. Store the parsed params at `res.locals.schemaParams`.
3. If configured, parse the request body. Its return value replaces `req.body`.
4. If configured, wrap `res.json()` so its payload is parsed before the original JSON method sends it. The parsed result replaces the response payload.

`res.send()` is not intercepted. Use a coercing schema such as `z.coerce.number()` to transform a captured string ID into a number. The initial `urlParams` parser context still contains the original string captures; later phases receive the parsed params object.

Thrown errors and rejected promises from request or URL-param parsing are sent to Express with `next(error)`. Errors from response parsing are also forwarded to `next(error)`. Configure the application's error-handling middleware to map validation failures to the desired HTTP status.

## TypeScript

Public declarations are in `src/index.d.ts`. The route map determines the parser's schema union, and its context is discriminated by `phase`. Zod-style `_output` types are used to infer parsed URL params when available; otherwise params are typed as string-valued records.

## Repository map

- `src/index.js` — route matching and Express middleware implementation
- `src/index.d.ts` — public TypeScript declarations
- `test/index.test.js` — Jest unit tests and real Express HTTP integration test
- `examples/zod.js` — runnable Zod example
- `examples/json-schema.js` — runnable Ajv example
- `examples/typescript_zod.ts` — TypeScript usage and type checks
- `README.md` — user-facing package documentation
- `llms.txt` — concise package and source guide

## Development and validation

The package uses ESM and Jest. Keep tests in Jest format and add coverage for both matching and non-matching route behavior when changing route logic.

```sh
npm test
npm run test:coverage
npm run test:types
npm run example:zod
npm run example:json-schema
```

Coverage thresholds are configured in `package.json`. The npm package includes `src`, `examples`, `docs`, and `skills`.
