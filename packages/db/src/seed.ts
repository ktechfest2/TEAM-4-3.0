import { createDb } from "./client.ts";
import { createPhoneCrypto } from "./phone.ts";
import { seed } from "./seed-lib.ts";

const teamPhones = (process.env.DEMO_TEAM_PHONES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const handle = createDb(process.env.DATABASE_URL, { max: 2, statementTimeoutMs: 60_000 });
try {
  const result = await seed(handle.db, createPhoneCrypto(), { teamPhones, officialPin: process.env.DEMO_OFFICIAL_PIN });
  console.log(`seeded: ${result.wards} wards, ${result.pollingUnits} polling units, ${result.people} people (${teamPhones.length} team phones)`);
  if (result.generatedOfficialPin) {
    console.log(`team official PIN (shown once, set DEMO_OFFICIAL_PIN to choose your own): ${result.generatedOfficialPin}`);
  }
} finally {
  await handle.close();
}
