import type { Request, RequestHandler, Response } from 'express';

export type SchemaDefinition = unknown;
export type URLParams<T = Record<string, SchemaDefinition>> =
	T extends Record<string, SchemaDefinition> ? T : Record<string, SchemaDefinition>;

export interface SchemaRoute<
	URLParamsSchema = SchemaDefinition,
	RequestSchema = SchemaDefinition,
	ResponseSchema = SchemaDefinition
> {
	urlParams?: URLParamsSchema;
	request?: RequestSchema;
	response?: ResponseSchema;
}

type SchemaOutput<Schema> = Schema extends { _output: infer Output }
	? Output extends URLParams ? Output : Record<string, string>
	: Record<string, string>;

type RouteURLParams<Route extends SchemaRoute> =
	Exclude<Route['urlParams'], undefined> extends infer Schema
		? [Schema] extends [never]
			? Record<string, string>
			: SchemaOutput<Schema>
		: Record<string, string>;

type RoutesURLParams<Routes extends Record<string, SchemaRoute>> = {
	[RouteKey in keyof Routes]: RouteURLParams<Routes[RouteKey]>;
}[keyof Routes];

export interface URLParamsParseContext {
	phase: 'urlParams';
	request: Request;
	response: Response;
	params: Record<string, string>;
}

export interface RequestParseContext<Params extends URLParams = Record<string, string>> {
	phase: 'request';
	request: Request;
	response: Response;
	params: Params;
}

export interface ResponseParseContext<Params extends URLParams = Record<string, string>> {
	phase: 'response';
	request: Request;
	response: Response;
	params: Params;
}

export type SchemaParseContext<Params extends URLParams = Record<string, string>> =
	| URLParamsParseContext
	| RequestParseContext<Params>
	| ResponseParseContext<Params>;

type RouteSchemaKeys = 'urlParams' | 'request' | 'response';

export type RouteSchemas<Routes extends Record<string, SchemaRoute>> = {
	[RouteKey in keyof Routes]: {
		[SchemaKey in keyof Routes[RouteKey] & RouteSchemaKeys]:
			Exclude<Routes[RouteKey][SchemaKey], undefined>;
	}[keyof Routes[RouteKey] & RouteSchemaKeys];
}[keyof Routes];

export interface SchemaMiddlewareOptions<
	Routes extends Record<string, SchemaRoute> = Record<string, SchemaRoute>,
	Data = unknown,
	Params extends URLParams = RoutesURLParams<Routes>,
> {
	routes: Routes;
	parse: (
		schema: RouteSchemas<Routes>,
		data: Data,
		context: SchemaParseContext<Params>,
	) => Data | Promise<Data>;
}

export function createSchemaMiddleware<
	Data = unknown,
	Routes extends Record<string, SchemaRoute> = Record<string, SchemaRoute>,
>(
	options: SchemaMiddlewareOptions<Routes, Data, RoutesURLParams<Routes>>,
): RequestHandler;
