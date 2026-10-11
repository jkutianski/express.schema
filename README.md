# [![express.schema](logo.svg)](https://github.com/jkutianski/express.schema) [![License](https://badgen.net/github/license/jkutianski/express.schema)](https://github.com/jkutianski/express.schema/blob/main/LICENSE) [![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/jkutianski/express.schema/ci.yml)](https://github.com/jkutianski/express.schema/actions) ![NPM Version](https://badgen.net/npm/v/express.schema)(https://www.npmjs.com/package/express.schema)

Route-based runtime validation middleware for Express. Define schemas by HTTP method and path, then validate captured URL parameters, request bodies, and JSON response payloads with Zod, JSON Schema/Ajv, or a custom parser.

The package does not depend on a particular schema library. Express is a peer dependency.

## Install

```sh
npm install express.schema express
```

Install the validator you want to use separately, for example `npm install zod`.

## Usage

```js
import express from 'express';
import { z } from 'zod';
import { createSchemaMiddleware } from 'express.schema';

const app = express();
app.use(express.json());

const middleware = createSchemaMiddleware({
  routes: {
    'POST /users': {
      request: z.object({ name: z.string().min(1) }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
    'GET /users/:id': {
      urlParams: z.object({ id: z.coerce.number() }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
  },
  parse: (schema, data) => schema.parse(data),
});

app.use(middleware);

app.post('/users', (req, res) => {
  res.json({ id: 1, ...req.body });
});

app.get('/users/:id', (req, res) => {
  const { id } = res.locals.schemaParams;
  res.json({ id, name: 'Ada' });
});

app.use((error, req, res, next) => {
  res.status(400).json({ error: error.message });
});
```

Place body-parsing middleware before `createSchemaMiddleware`. Install schema middleware before routes whose requests and responses it should validate.

Runnable examples are available for [Zod](examples/zod.js), [JSON Schema/Ajv](examples/json-schema.js), and [TypeScript with Zod](examples/typescript_zod.ts). From a checkout, run the JavaScript examples with `npm run example:zod` or `npm run example:json-schema`; they start a local server and need no external API.

## Route matching and parsing

Route keys use `METHOD /path` syntax. Methods are case-insensitive, static path segments match exactly, and `:name` path segments capture one non-empty segment. Optional query parameters may also be matched, for example `GET /users?active=true&id=:id`. Extra query parameters are ignored.

Matching runs the optional `urlParams` parser first, then the optional `request` parser. Parsed request data replaces `req.body`; parsed URL params are exposed as `res.locals.schemaParams` and passed to later parser phases. The `response` parser runs when the matched handler calls `res.json()`, and its returned value is sent instead. Response validation requires `response.json()`; `response.send()` is not intercepted.

The parser receives `(schema, data, context)`. It may be asynchronous. `context.phase` is `'urlParams'`, `'request'`, or `'response'`; each context includes Express `request` and `response` objects and the captured or parsed `params`. If parsing fails, the error is forwarded to Express with `next(error)`.

If no route matches, the middleware calls `next()` without changing the request or response.

## API

```js
createSchemaMiddleware({ routes, parse })
```

* `routes`: map of route keys to optional `urlParams`, `request`, and `response` schemas.
* `parse(schema, data, context)`: synchronous or asynchronous parser. Its returned value replaces the parsed params, request body, or JSON response.
* Returns a standard Express `RequestHandler`.

TypeScript declarations are included. Run `npm test` and `npm run test:types` from a checkout to validate the package and TypeScript example.

For implementation details and repository guidance, see the [agent guide](docs/agent-guide.md) and the [express.schema skill](skills/express-schema/SKILL.md).