import { getBootstrappedDb, type DrizzleDb } from "@retainiq/db";

export function getDb(): Promise<DrizzleDb> {
  return getBootstrappedDb();
}
