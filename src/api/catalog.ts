import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Ajv, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { AppStoreConnectClient } from "./client.js";

type Schema = Record<string, any>;
export interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  schema: Schema;
}
export interface Operation {
  operationId: string;
  method: string;
  path: string;
  tags: string[];
  deprecated?: boolean;
  parameters: Parameter[];
  requestBody?: Schema;
  responses: Schema;
}
export interface ApiInput {
  operationId: string;
  path?: Record<string, string>;
  query?: Record<string, string | number | boolean | string[]>;
  body?: unknown;
}

// Normalize OAS 3 nullable to JSON Schema, including nullable $refs.
function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  const { nullable, ...rest } = value;
  const result = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, normalize(v)]),
  );
  return nullable ? { anyOf: [result, { type: "null" }] } : result;
}

export class AppleCatalog {
  readonly version: string;
  readonly operations: Operation[];
  private schemas: Schema;
  private ajv = new Ajv({
    strict: false,
    allErrors: true,
    validateFormats: true,
  });
  private validators = new Map<string, ValidateFunction>();

  constructor(
    spec = JSON.parse(
      gunzipSync(
        readFileSync(
          new URL("../../data/apple-openapi.json.gz", import.meta.url),
        ),
      ).toString(),
    ),
  ) {
    this.version = spec.info.version;
    this.schemas = spec.components.schemas;
    addFormats.default(this.ajv);
    this.ajv.addFormat("int64", {
      type: "number",
      validate: Number.isSafeInteger,
    });
    this.ajv.addFormat("int32", {
      type: "number",
      validate: (n: number) =>
        Number.isInteger(n) && n >= -2147483648 && n <= 2147483647,
    });
    this.ajv.addSchema({
      $id: "apple",
      components: { schemas: normalize(this.schemas) },
    });
    this.operations = Object.entries(spec.paths)
      .flatMap(([path, item]: [string, any]) =>
        ["get", "post", "patch", "delete", "put"]
          .filter((m) => item[m])
          .map((method) => ({
            ...item[method],
            method: method.toUpperCase(),
            path,
            parameters: [
              ...(item.parameters || []),
              ...(item[method].parameters || []),
            ],
          })),
      )
      .sort((a, b) => a.operationId.localeCompare(b.operationId));
  }

  search(query = "", method?: string, offset = 0, limit = 20) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const found = this.operations.filter(
      (o) =>
        (!method || o.method === method.toUpperCase()) &&
        terms.every((t) =>
          `${o.operationId} ${o.path} ${o.tags.join(" ")}`
            .toLowerCase()
            .includes(t),
        ),
    );
    return {
      apiVersion: this.version,
      total: found.length,
      offset,
      operations: found
        .slice(offset, offset + limit)
        .map(({ operationId, method, path, tags, deprecated }) => ({
          operationId,
          method,
          path,
          tags,
          ...(deprecated ? { deprecated } : {}),
        })),
      nextOffset: offset + limit < found.length ? offset + limit : null,
    };
  }

  get(operationId: string): Operation {
    const operation = this.operations.find(
      (o) => o.operationId === operationId,
    );
    if (!operation)
      throw new Error(
        `Unknown Apple operation: ${operationId}. Search the catalog first.`,
      );
    return operation;
  }

  describe(operationId: string) {
    const operation = this.get(operationId);
    const definitions: Schema = {};
    const visit = (value: any) => {
      if (!value || typeof value !== "object") return;
      if (typeof value.$ref === "string") {
        const name = value.$ref.replace("#/components/schemas/", "");
        if (!(name in definitions) && this.schemas[name]) {
          definitions[name] = this.schemas[name];
          visit(definitions[name]);
        }
      }
      Object.values(value).forEach(visit);
    };
    // Input definitions only: response models can be enormous.
    visit(operation.parameters);
    visit(operation.requestBody);
    return {
      apiVersion: this.version,
      ...operation,
      components: { schemas: definitions },
      documentation: `https://developer.apple.com/documentation/appstoreconnectapi/${operation.method.toLowerCase()}-${operation.path.slice(1).replaceAll("/", "-").replaceAll("{", "_").replaceAll("}", "_").toLowerCase()}`,
    };
  }

  private validate(key: string, schema: Schema, value: unknown) {
    let validator = this.validators.get(key);
    if (!validator) {
      const serialized = JSON.stringify(normalize(schema)).replaceAll(
        '"#/components/schemas/',
        '"apple#/components/schemas/',
      );
      validator = this.ajv.compile(JSON.parse(serialized));
      this.validators.set(key, validator);
    }
    if (!validator(value)) {
      // Never include input values (review credentials may be in a request body).
      throw new Error(
        `Invalid ${key}: ${validator.errors?.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ")}`,
      );
    }
  }

  prepare(input: ApiInput) {
    const o = this.get(input.operationId);
    const pathValues = input.path || {};
    const queryValues = input.query || {};
    for (const key of Object.keys(pathValues))
      if (!o.parameters.some((p) => p.in === "path" && p.name === key))
        throw new Error(`Unknown path parameter: ${key}`);
    for (const key of Object.keys(queryValues))
      if (
        key !== "cursor" &&
        !o.parameters.some((p) => p.in === "query" && p.name === key)
      )
        throw new Error(`Unknown query parameter: ${key}`);
    let path = o.path;
    const query = new URLSearchParams();
    for (const p of o.parameters) {
      const raw = p.in === "path" ? pathValues[p.name] : queryValues[p.name];
      if (raw === undefined) {
        if (p.required) throw new Error(`Missing ${p.in} parameter: ${p.name}`);
        continue;
      }
      let value: unknown = raw;
      if (p.schema.type === "array" && typeof raw === "string")
        value = raw.split(",");
      this.validate(`${o.operationId}:${p.name}`, p.schema, value);
      const wire = Array.isArray(value) ? value.join(",") : String(value);
      if (p.in === "path") {
        if (!wire || wire === "." || wire === "..")
          throw new Error(`Invalid path parameter: ${p.name}`);
        path = path.replace(`{${p.name}}`, encodeURIComponent(wire));
      } else query.set(p.name, wire);
    }
    if (queryValues.cursor !== undefined)
      query.set("cursor", String(queryValues.cursor));
    const bodySchema = o.requestBody?.content?.["application/json"]?.schema;
    if (o.requestBody?.required && input.body === undefined)
      throw new Error("Missing request body");
    if (input.body !== undefined) {
      if (!bodySchema)
        throw new Error("This operation does not accept a JSON body");
      this.validate(`${o.operationId}:body`, bodySchema, input.body);
    }
    return {
      operation: o,
      url: path + (query.size ? `?${query}` : ""),
      body: input.body,
    };
  }

  async execute(
    client: AppStoreConnectClient,
    input: ApiInput,
    access: "read" | "write",
    dryRun = false,
  ) {
    const prepared = this.prepare(input);
    if ((prepared.operation.method === "GET") !== (access === "read"))
      throw new Error(
        `Use the ${prepared.operation.method === "GET" ? "read" : "write"} interface for this operation`,
      );
    if (dryRun)
      return {
        dryRun: true,
        operationId: input.operationId,
        method: prepared.operation.method,
        path: prepared.url,
        body: input.body,
      };
    return client.raw(prepared.operation.method, prepared.url, prepared.body);
  }
}

let catalog: AppleCatalog | undefined;
export function getCatalog() {
  return (catalog ??= new AppleCatalog());
}
