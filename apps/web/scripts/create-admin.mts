/**
 * Create or update a control-room account.
 * Usage: npm run admin:create -w @confam/web -- <email> <role:admin|viewer>
 * The password is read from ADMIN_PASSWORD (never pass it on the command line, where it lands in shell history).
 */
import { adminUser, createDb, hashSecret } from "@confam/db";

const [email, role = "admin"] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("usage: admin:create <email> [admin|viewer]");
if (role !== "admin" && role !== "viewer") throw new Error("role must be admin or viewer");
if (!password || password.length < 12) throw new Error("set ADMIN_PASSWORD (12+ characters)");

const { db, close } = createDb(process.env.DATABASE_URL, { max: 1 });
try {
  const passwordHash = await hashSecret(password);
  await db
    .insert(adminUser)
    .values({ email: email.toLowerCase(), passwordHash, role })
    .onConflictDoUpdate({ target: adminUser.email, set: { passwordHash, role } });
  console.log(`account ready: ${email.toLowerCase()} (${role})`);
} finally {
  await close();
}
