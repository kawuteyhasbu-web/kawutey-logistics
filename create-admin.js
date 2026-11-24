require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const ADMIN_LIMIT = 4;
const ADMIN_LOCK_ID = 2026112304;

async function main() {
  if (process.env.BOOTSTRAP_ADMIN_CONFIRM !== "YES_CREATE_ADMIN") {
    throw new Error("Set BOOTSTRAP_ADMIN_CONFIRM=YES_CREATE_ADMIN for this administrator setup.");
  }
  const name = String(process.env.ADMIN_NAME || "").trim();
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 14) {
    throw new Error("Set ADMIN_NAME, a valid ADMIN_EMAIL, and a unique ADMIN_PASSWORD of at least 14 characters.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize administrator creation so two setup attempts cannot exceed the limit.
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADMIN_LOCK_ID]);
    const countResult = await client.query("SELECT COUNT(*)::int AS total FROM users WHERE role='admin'");
    const totalAdmins = countResult.rows[0].total;
    if (totalAdmins >= ADMIN_LIMIT) {
      throw new Error("The maximum of four administrator accounts has been reached. No account was created.");
    }

    const hash = await bcrypt.hash(password, 12);
    await client.query(
      "INSERT INTO users(full_name,email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,'admin','active')",
      [name, email, "ADMIN-CONTACT-NOT-SET", hash]
    );
    await client.query("COMMIT");
    transactionStarted = false;
    process.stdout.write(`Administrator account created. ${ADMIN_LIMIT - totalAdmins - 1} administrator slot(s) remain. Sign in through /admin-dashboard.\n`);
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
