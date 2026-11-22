require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

async function main() {
  if (process.env.BOOTSTRAP_ADMIN_CONFIRM !== "YES_CREATE_ADMIN") {
    throw new Error("Set BOOTSTRAP_ADMIN_CONFIRM=YES_CREATE_ADMIN for this one-time setup.");
  }
  const name = String(process.env.ADMIN_NAME || "").trim();
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!name || !/^\\S+@\\S+\\.\\S+$/.test(email) || password.length < 14) {
    throw new Error("Set ADMIN_NAME, a valid ADMIN_EMAIL, and a unique ADMIN_PASSWORD of at least 14 characters.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
  try {
    const existing = await pool.query("SELECT id,email FROM users WHERE role='admin' LIMIT 1");
    if (existing.rowCount) {
      throw new Error("An administrator already exists. This setup script will not create or overwrite another admin.");
    }
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO users(full_name,email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,'admin','active')",
      [name, email, "ADMIN-CONTACT-NOT-SET", hash]
    );
    process.stdout.write("Administrator account created. Sign in through /admin.html and change/secure your credentials according to your hosting procedures.\n");
  } finally {
    await pool.end();
  }
}
main().catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
