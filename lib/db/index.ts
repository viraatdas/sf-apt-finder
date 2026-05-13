import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  // We don't throw at import time so `next build` can succeed without env.
  console.warn("DATABASE_URL is not set. DB queries will fail at runtime.");
}

declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined;
}

const client =
  globalThis.__pg ??
  postgres(url ?? "postgres://invalid", {
    prepare: false,
    max: 5,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") globalThis.__pg = client;

export const db = drizzle(client, { schema });
export { schema };
