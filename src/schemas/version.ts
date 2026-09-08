/** Bump on breaking schema changes. All documents share this version. */
export const SCHEMA_VERSION = 1 as const;

export type SchemaVersion = typeof SCHEMA_VERSION;
