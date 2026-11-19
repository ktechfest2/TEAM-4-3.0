import { createDb } from "./client.ts";
import { migrateDb } from "./migrate-lib.ts";

const handle = createDb(process.env.DATABASE_URL, { max: 1, statementTimeoutMs: 120_000 });
try {
  await migrateDb(handle.db);
  console.log("migrations applied");
} finally {
  await handle.close();
}
