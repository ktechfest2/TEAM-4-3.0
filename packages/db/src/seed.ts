import { createDb } from "./client.ts";
import { createPhoneCrypto } from "./phone.ts";
import { seed } from "./seed-lib.ts";

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const handle = createDb(process.env.DATABASE_URL, { max: 2, statementTimeoutMs: 60_000 });
try {
  const r = await seed(handle.db, createPhoneCrypto(), {
    officialPhones: list(process.env.DEMO_OFFICIAL_PHONES),
    voterPhones: list(process.env.DEMO_VOTER_PHONES),
    officialPin: process.env.DEMO_OFFICIAL_PIN,
  });
  console.log(`seeded: ${r.wards} wards, ${r.pollingUnits} polling units, ${r.people} people; retired ${r.retiredDemoContacts} demo contacts; repaired ${r.repairedNumbers} numbers`);
  for (const c of r.created) console.log(`  created ${c}`);
  if (r.generatedOfficialPin) console.log(`official PIN (shown once; set DEMO_OFFICIAL_PIN to choose): ${r.generatedOfficialPin}`);
} finally {
  await handle.close();
}
