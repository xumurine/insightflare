import { z } from "zod";

// ─── Schema Registry ────────────────────────────────────────────────────

interface SchemaDefinition {
  name: string;
  schema: z.ZodTypeAny;
}

const schemaRegistry = new Map<string, z.ZodTypeAny>();

export function registerSchema(name: string, schema: z.ZodTypeAny) {
  schemaRegistry.set(name, schema);
}

export function getAllRegisteredSchemas(): SchemaDefinition[] {
  return Array.from(schemaRegistry.entries()).map(([name, schema]) => ({
    name,
    schema,
  }));
}

// ─── Base Schemas ───────────────────────────────────────────────────────

export const EnvelopeSchema = z.object({
  ok: z.literal(true),
  requestId: z.string().describe("Cloudflare Ray ID for request tracing"),
  timestamp: z.string().describe("ISO 8601 response generation time"),
});

export const ErrorDetailSchema = z.object({
  code: z.string().describe("Machine-readable error code"),
  message: z.string().describe("Human-readable error description"),
});

export const ErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  requestId: z.string(),
  timestamp: z.string(),
  error: ErrorDetailSchema,
});

export const PaginationMetaSchema = z.object({
  page: z.number().int().describe("Current page number (1-indexed)"),
  pageSize: z.number().int().describe("Results per page"),
  returned: z.number().int().describe("Number of results in this page"),
  hasMore: z.boolean().describe("Whether more pages exist"),
  nextPage: z.number().int().nullable().describe("Next page number, or null"),
});

// ─── Envelope Builders ──────────────────────────────────────────────────

export function createEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return EnvelopeSchema.extend({
    data: dataSchema,
  });
}

export function createPaginatedEnvelopeSchema<T extends z.ZodTypeAny>(
  dataSchema: T,
) {
  return EnvelopeSchema.extend({
    data: dataSchema,
    meta: PaginationMetaSchema,
  });
}

// ─── Register ───────────────────────────────────────────────────────────

registerSchema("Envelope", EnvelopeSchema);
registerSchema("ErrorEnvelope", ErrorEnvelopeSchema);
registerSchema("PaginationMeta", PaginationMetaSchema);
