require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
const COMMISSION_PESEWAS = 500;
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
  console.error("JWT_SECRET must be set to a random value of at least 32 characters.");
  process.exit(1);
}
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"]
    }
  }
}));
const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map(v => v.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.path !== "/api/payments/paystack/webhook") {
    const origin = req.get("Origin");
    if (!origin || !allowedOrigins.includes(origin)) return res.status(403).json({ error: "Request origin is not allowed." });
  }
  next();
});
app.use((req, res, next) => req.path === "/api/payments/paystack/webhook" ? next() : express.json({ limit: "1mb" })(req, res, next));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = value => String(value || "").trim();
const emailValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const moneyPesewas = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || Math.round(n * 100) !== n * 100) throw Object.assign(new Error("Enter a valid amount in Ghana cedis."), { status: 400 });
  return Math.round(n * 100);
};
function tokenFor(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || "8h", issuer: "kawutey-logistics" });
}
const VENDOR_COOKIE = "kl_vendor_session";
const vendorCookieOptions = { httpOnly: true, secure: true, sameSite: "none", path: "/api", maxAge: 8 * 60 * 60 * 1000 };
function setVendorCookie(res, user) { res.cookie(VENDOR_COOKIE, tokenFor(user), vendorCookieOptions); }
function clearVendorCookie(res) { res.clearCookie(VENDOR_COOKIE, { httpOnly: true, secure: true, sameSite: "none", path: "/api" }); }
const authenticate = asyncRoute(async (req, res, next) => {
  const raw = req.headers.authorization || "";
  const bearer = raw.startsWith("Bearer ") ? raw.slice(7) : "";
  const cookie = (req.headers.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith(VENDOR_COOKIE + "="));
  const cookieToken = cookie ? decodeURIComponent(cookie.slice(VENDOR_COOKIE.length + 1)) : "";
  const token = bearer || cookieToken;
  if (!token) return res.status(401).json({ error: "Please log in." });
  let claims;
  try { claims = jwt.verify(token, jwtSecret, { issuer: "kawutey-logistics" }); }
  catch { return res.status(401).json({ error: "Your session has expired. Please log in again." }); }
  const result = await pool.query("SELECT id, full_name, business_name, email, phone, role, status, location FROM users WHERE id=$1", [claims.sub]);
  if (!result.rowCount || result.rows[0].status !== "active") return res.status(401).json({ error: "Account unavailable." });
  req.user = result.rows[0];
  next();
});
const roles = (...allowed) => (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).json({ error: "You are not allowed to perform this action." });

async function sendSignupEmail(notification) {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "ADMIN_EMAIL"];
  if (required.some(key => !process.env[key])) return { sent: false, reason: "SMTP is not configured." };
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  const details = notification.details || {};
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL,
    subject: `New ${notification.account_type} signup — Kawutey Logistics`,
    text: [
      `A new ${notification.account_type} account has registered.`,
      `Name: ${details.fullName || "Not provided"}`,
      details.businessName ? `Business: ${details.businessName}` : null,
      `Email: ${details.email || "Not provided"}`,
      `Phone: ${details.phone || "Not provided"}`,
      `Registered: ${new Date(notification.created_at).toISOString()}`,
      notification.account_type === "rider" ? "Approval required before the rider can receive assignments." : null,
      "",
      "For privacy, this message excludes passwords and Ghana Card details."
    ].filter(Boolean).join("\n")
  });
  return { sent: true };
}

app.get("/api/health", (req, res) => res.json({ ok: true, service: "Kawutey Logistics API" }));

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const { fullName, businessName, email, phone, password, role, ghanaCardNumber, location } = req.body || {};
  const name = clean(fullName), business = clean(businessName), mail = clean(email).toLowerCase(), tel = clean(phone);
  if (!name || !emailValid(mail) || !tel || !["vendor", "rider"].includes(role) || typeof password !== "string" || password.length < 10) {
    return res.status(400).json({ error: "Provide your name, valid email, phone, vendor/rider role and a password of at least 10 characters." });
  }
  if (role === "vendor" && (!business || business.length > 120)) return res.status(400).json({ error: "Please provide your business name (up to 120 characters)." });
  let riderPhoto = null;
  if (role === "rider") {
    const card = clean(ghanaCardNumber).toUpperCase().replace(/[\s-]/g, "");
    if (!/^GHA\d{10}$/.test(card)) return res.status(400).json({ error: "Enter a valid Ghana Card number in the format GHA-XXXXXXXXX-X." });
    const photo = req.body?.photoDataUrl;
    const match = typeof photo === "string" ? photo.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/) : null;
    if (!match) return res.status(400).json({ error: "Upload a JPEG, PNG or WebP profile photograph." });
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > 512 * 1024 || bytes.toString("base64") !== match[2]) return res.status(400).json({ error: "The photograph must be no larger than 512 KB." });
    const mime = match[1];
    const validImage = (mime === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length-2] === 0xff && bytes[bytes.length-1] === 0xd9)
      || (mime === "image/png" && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
      || (mime === "image/webp" && bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP");
    if (!validImage) return res.status(400).json({ error: "The uploaded file is not a valid supported image." });
    riderPhoto = { bytes, mime, last4: card.slice(-4) };
  }
  let riderCode = null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hash = await bcrypt.hash(password, 12);
    const userResult = await client.query(
      "INSERT INTO users(full_name,business_name,email,phone,password_hash,role,status,location) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,full_name,business_name,email,phone,role,status,location",
      [name, role === "vendor" ? business : null, mail, tel, hash, role, role === "rider" ? "pending" : "active", clean(location) || null]
    );
    const user = userResult.rows[0];
    if (role === "rider") {
      riderCode = "KW-RD-" + String(user.id).padStart(4, "0");
      await client.query("INSERT INTO rider_profiles(user_id,rider_code,ghana_card_last4,photo_data,photo_mime) VALUES($1,$2,$3,$4,$5)", [user.id, riderCode, riderPhoto.last4, riderPhoto.bytes, riderPhoto.mime]);
      await client.query("INSERT INTO wallets(rider_id) VALUES($1)", [user.id]);
    }
    const noticeResult = await client.query(
      "INSERT INTO admin_notifications(account_type,details,email_status) VALUES($1,$2::jsonb,'pending') RETURNING id,account_type,details,created_at",
      [role, JSON.stringify({ fullName: user.full_name, email: user.email, phone: user.phone, businessName: user.business_name || null })]
    );
    await client.query("COMMIT");
    const notice = noticeResult.rows[0];
    try {
      const emailResult = await sendSignupEmail(notice);
      await pool.query("UPDATE admin_notifications SET email_status=$1,email_error=$2 WHERE id=$3",
        [emailResult.sent ? "sent" : "not_configured", emailResult.reason || null, notice.id]);
    } catch (mailError) {
      console.error("Admin signup email notification failed:", mailError.message);
      await pool.query("UPDATE admin_notifications SET email_status='failed',email_error=$1 WHERE id=$2",
        [String(mailError.message).slice(0,500), notice.id]).catch(() => {});
    }
    if (role === "vendor") setVendorCookie(res, user);
    res.status(201).json({ message: role === "rider" ? "Registration received. Your account awaits admin approval." : "Vendor account created.", user, riderCode });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "An account with that email already exists." });
    throw error;
  } finally { client.release(); }
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const mail = clean(req.body?.email).toLowerCase(), password = req.body?.password;
  const found = await pool.query("SELECT id,full_name,business_name,email,phone,password_hash,role,status,location FROM users WHERE email=$1", [mail]);
  if (!found.rowCount || !(await bcrypt.compare(String(password || ""), found.rows[0].password_hash))) return res.status(401).json({ error: "Invalid email or password." });
  const user = found.rows[0];
  if (user.status === "suspended") return res.status(403).json({ error: "Your account is suspended. Contact Kawutey Logistics." });
  if (user.role === "rider" && user.status !== "active") return res.status(403).json({ error: "Your rider account is awaiting administrator approval." });
  delete user.password_hash;
  if (user.role === "vendor") {
    setVendorCookie(res, user);
    return res.json({ user });
  }
  res.json({ user, token: tokenFor(user) });
}));

app.post("/api/auth/logout", (req, res) => {
  clearVendorCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", authenticate, (req, res) => res.json({ user: req.user }));

app.get("/api/rider/profile/photo", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  if (req.user.status !== "active") return res.status(403).json({ error: "Your rider account is not approved." });
  const result = await pool.query("SELECT photo_data,photo_mime FROM rider_profiles WHERE user_id=$1", [req.user.id]);
  if (!result.rowCount || !result.rows[0].photo_data) return res.status(404).json({ error: "No profile photograph is available." });
  res.set({ "Content-Type": result.rows[0].photo_mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.send(result.rows[0].photo_data);
}));

app.get("/api/rider/profile", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT rider_code,approved_at,(photo_data IS NOT NULL AND octet_length(photo_data)>0) AS has_photo,photo_mime,octet_length(photo_data) AS photo_bytes FROM rider_profiles WHERE user_id=$1", [req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Rider profile not found." });
  res.set("Cache-Control", "private, no-store");
  res.json({ profile: result.rows[0] });
}));

app.get("/api/vendor/pickups", authenticate, roles("vendor"), asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT p.id,p.description,p.preferred_at,p.total_packages,p.large_packages,p.medium_packages,p.small_packages,p.created_at,
      a.status AS assignment_status,a.rider_id,
      CASE WHEN a.rider_id IS NOT NULL AND a.status IN ('accepted','completed') AND u.status='active' THEN u.full_name END AS rider_name,
      CASE WHEN a.rider_id IS NOT NULL AND a.status IN ('accepted','completed') AND u.status='active' THEN u.phone END AS rider_phone,
      CASE WHEN a.rider_id IS NOT NULL AND a.status IN ('accepted','completed') AND u.status='active' THEN u.location END AS rider_location,
      CASE WHEN a.rider_id IS NOT NULL AND a.status IN ('accepted','completed') AND u.status='active' THEN rp.rider_code END AS rider_code,
      CASE WHEN a.rider_id IS NOT NULL AND a.status IN ('accepted','completed') AND u.status='active' THEN (rp.photo_data IS NOT NULL AND octet_length(rp.photo_data)>0) ELSE false END AS rider_has_photo
    FROM pickups p
    LEFT JOIN assignments a ON a.pickup_id=p.id
    LEFT JOIN users u ON u.id=a.rider_id AND u.role='rider'
    LEFT JOIN rider_profiles rp ON rp.user_id=u.id
    WHERE p.vendor_id=$1 ORDER BY p.created_at DESC`, [req.user.id]);
  res.set("Cache-Control", "private, no-store");
  res.json({ pickups: result.rows });
}));

app.get("/api/vendor/pickups/:id/assigned-rider/photo", authenticate, roles("vendor"), asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT rp.photo_data,rp.photo_mime
    FROM pickups p
    JOIN assignments a ON a.pickup_id=p.id
    JOIN users u ON u.id=a.rider_id AND u.role='rider' AND u.status='active'
    JOIN rider_profiles rp ON rp.user_id=u.id
    WHERE p.id=$1 AND p.vendor_id=$2 AND a.status IN ('accepted','completed')`, [req.params.id, req.user.id]);
  if (!result.rowCount || !result.rows[0].photo_data) return res.status(404).json({ error: "Assigned rider photograph is not available." });
  res.set({ "Content-Type": result.rows[0].photo_mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.send(result.rows[0].photo_data);
}));

app.post("/api/vendor/pickups", authenticate, roles("vendor"), asyncRoute(async (req, res) => {
  const { description, preferredAt, totalPackages, largePackages = 0, mediumPackages = 0, smallPackages = 0 } = req.body || {};
  const total = Number(totalPackages), large = Number(largePackages), medium = Number(mediumPackages), small = Number(smallPackages), when = new Date(preferredAt);
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(large) || !Number.isInteger(medium) || !Number.isInteger(small) || Math.min(large, medium, small) < 0 || !Number.isFinite(when.getTime())) return res.status(400).json({ error: "Check the pickup date and package quantities." });
  const result = await pool.query("INSERT INTO pickups(vendor_id,description,preferred_at,total_packages,large_packages,medium_packages,small_packages) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [req.user.id, clean(description) || "Package pickup", when, total, large, medium, small]);
  await pool.query("INSERT INTO assignments(pickup_id) VALUES($1)", [result.rows[0].id]);
  res.status(201).json({ pickup: result.rows[0] });
}));

app.get("/api/rider/wallet", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT w.balance_pesewas, rp.rider_code,
    COALESCE(SUM(CASE WHEN t.type='deposit' AND t.status='successful' THEN t.amount_pesewas ELSE 0 END),0) AS deposits_pesewas,
    COALESCE(SUM(CASE WHEN t.type='commission' AND t.status='successful' THEN ABS(t.amount_pesewas) ELSE 0 END),0) AS commission_pesewas
    FROM wallets w JOIN rider_profiles rp ON rp.user_id=w.rider_id
    LEFT JOIN wallet_transactions t ON t.rider_id=w.rider_id WHERE w.rider_id=$1
    GROUP BY w.balance_pesewas,rp.rider_code`, [req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Wallet not found." });
  const row = result.rows[0];
  res.json({ riderCode: row.rider_code, balanceGhs: Number(row.balance_pesewas) / 100, totalDepositsGhs: Number(row.deposits_pesewas) / 100, commissionDeductedGhs: Number(row.commission_pesewas) / 100, packagesAvailable: Math.floor(Number(row.balance_pesewas) / COMMISSION_PESEWAS) });
}));

app.get("/api/rider/assignments", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT a.id,a.status,p.description,p.preferred_at,p.total_packages,p.large_packages,p.medium_packages,p.small_packages,u.full_name AS vendor_name
    FROM assignments a JOIN pickups p ON p.id=a.pickup_id JOIN users u ON u.id=p.vendor_id
    WHERE a.status='available' OR a.rider_id=$1 ORDER BY CASE WHEN a.status='available' THEN 0 ELSE 1 END,p.preferred_at ASC`, [req.user.id]);
  res.set("Cache-Control", "private, no-store");
  res.json({ assignments: result.rows });
}));

app.post("/api/rider/assignments/:id/accept", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const assignment = await client.query("SELECT a.id,a.status,a.rider_id,p.total_packages FROM assignments a JOIN pickups p ON p.id=a.pickup_id WHERE a.id=$1 FOR UPDATE OF a", [req.params.id]);
    if (!assignment.rowCount || assignment.rows[0].status !== "available") { await client.query("ROLLBACK"); return res.status(409).json({ error: "This delivery is no longer available." }); }
    const count = Number(assignment.rows[0].total_packages);
    const fee = count * COMMISSION_PESEWAS;
    const wallet = await client.query("SELECT balance_pesewas FROM wallets WHERE rider_id=$1 FOR UPDATE", [req.user.id]);
    if (!wallet.rowCount || Number(wallet.rows[0].balance_pesewas) < fee) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Insufficient wallet balance. Deposit funds before accepting this delivery." }); }
    const claimed = await client.query("UPDATE assignments SET status='accepted',rider_id=$1,accepted_at=NOW() WHERE id=$2 AND status='available' RETURNING id", [req.user.id, req.params.id]);
    if (!claimed.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "This delivery has already been accepted." }); }
    await client.query("UPDATE wallets SET balance_pesewas=balance_pesewas-$1 WHERE rider_id=$2", [fee, req.user.id]);
    await client.query("INSERT INTO wallet_transactions(rider_id,type,amount_pesewas,status,reference,package_assignment_id,description) VALUES($1,'commission',$2,'successful',$3,$4,$5)", [req.user.id, -fee, "COM-" + crypto.randomUUID(), req.params.id, "GH₵5 commission per package accepted"]);
    await client.query("COMMIT");
    res.json({ message: "Delivery accepted. Commission deducted once.", commissionGhs: fee / 100 });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}));

app.get("/api/admin/notifications", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT id,account_type,details,email_status,created_at,read_at FROM admin_notifications ORDER BY created_at DESC LIMIT 100");
  res.json({ notifications: result.rows });
}));
app.patch("/api/admin/notifications/:id/read", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("UPDATE admin_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 RETURNING id,read_at", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Notification not found." });
  res.json({ notification: result.rows[0] });
}));

app.get("/api/admin/riders/managed", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT u.id,u.full_name,u.email,u.phone,u.location,u.status,r.rider_code,r.approved_at,(r.photo_data IS NOT NULL AND octet_length(r.photo_data)>0) AS has_photo FROM users u JOIN rider_profiles r ON r.user_id=u.id WHERE u.role='rider' AND u.status IN ('active','suspended') ORDER BY CASE WHEN u.status='active' THEN 0 ELSE 1 END,r.approved_at DESC NULLS LAST,u.full_name");
  res.set("Cache-Control", "private, no-store");
  res.json({ riders: result.rows });
}));
app.patch("/api/admin/riders/:id/status", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const status = req.body?.status;
  if (!["active","suspended"].includes(status)) return res.status(400).json({ error: "Choose active or suspended status." });
  const result = await pool.query("UPDATE users SET status=$1 WHERE id=$2 AND role='rider' AND status IN ('active','suspended') RETURNING id,status", [status, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Approved rider not found." });
  res.set("Cache-Control", "no-store");
  res.json({ rider: result.rows[0], message: status==="suspended" ? "Rider suspended." : "Rider reactivated." });
}));
app.get("/api/admin/riders/approved", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT u.id,u.full_name,u.email,u.phone,u.location,u.created_at,r.rider_code,r.approved_at,(r.photo_data IS NOT NULL AND octet_length(r.photo_data)>0) AS has_photo FROM users u JOIN rider_profiles r ON r.user_id=u.id WHERE u.role='rider' AND u.status='active' ORDER BY r.approved_at DESC NULLS LAST,u.full_name");
  res.set("Cache-Control", "private, no-store");
  res.json({ riders: result.rows });
}));
app.get("/api/admin/riders/pending", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT u.id,u.full_name,u.email,u.phone,u.location,u.created_at,r.rider_code,r.ghana_card_last4,(r.photo_data IS NOT NULL) AS has_photo FROM users u JOIN rider_profiles r ON r.user_id=u.id WHERE u.role='rider' AND u.status='pending' ORDER BY u.created_at");
  res.json({ riders: result.rows });
}));
app.get("/api/admin/riders/:id/photo", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT photo_data,photo_mime FROM rider_profiles WHERE user_id=$1", [req.params.id]);
  if (!result.rowCount || !result.rows[0].photo_data) return res.status(404).json({ error: "Rider photograph not found." });
  res.set({ "Content-Type": result.rows[0].photo_mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.send(result.rows[0].photo_data);
}));
app.post("/api/admin/riders/:id/approve", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("UPDATE users SET status='active' WHERE id=$1 AND role='rider' AND status='pending' RETURNING id", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Pending rider not found." });
  await pool.query("UPDATE rider_profiles SET approved_at=NOW() WHERE user_id=$1", [req.params.id]);
  res.json({ message: "Rider approved." });
}));

app.post("/api/payments/paystack/initialize", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  if (!process.env.PAYSTACK_SECRET_KEY) return res.status(503).json({ error: "Mobile Money payments are not configured yet." });
  const amount = moneyPesewas(req.body?.amountGhs);
  if (amount < 500) return res.status(400).json({ error: "Minimum deposit is GH₵5." });
  const reference = "KAW-" + crypto.randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const profile = await client.query("SELECT rider_code FROM rider_profiles WHERE user_id=$1", [req.user.id]);
    await client.query("INSERT INTO wallet_transactions(rider_id,type,amount_pesewas,status,reference,description) VALUES($1,'deposit',$2,'pending',$3,$4)", [req.user.id, amount, reference, "Rider wallet deposit"]);
    await client.query("COMMIT");
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: req.user.email, amount, reference, callback_url: process.env.PAYSTACK_CALLBACK_URL, metadata: { riderId: req.user.id, riderCode: profile.rows[0].rider_code, purpose: "rider_wallet_deposit" } })
    });
    const data = await response.json();
    if (!response.ok || !data.status) throw new Error("Payment provider could not initialize the transaction.");
    res.json({ authorizationUrl: data.data.authorization_url, reference });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}));

app.post("/api/payments/paystack/webhook", express.raw({ type: "application/json" }), asyncRoute(async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.sendStatus(503);
  const signature = req.headers["x-paystack-signature"];
  const expected = crypto.createHmac("sha512", secret).update(req.body).digest("hex");
  if (typeof signature !== "string" || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.sendStatus(401);
  const event = JSON.parse(req.body.toString("utf8"));
  if (event.event !== "charge.success" || !event.data?.reference) return res.sendStatus(200);
  const reference = event.data.reference;
  const verify = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), { headers: { Authorization: "Bearer " + secret } });
  const verified = await verify.json();
  if (!verify.ok || !verified.status || verified.data.status !== "success") return res.sendStatus(200);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tx = await client.query("SELECT * FROM wallet_transactions WHERE reference=$1 FOR UPDATE", [reference]);
    if (tx.rowCount && tx.rows[0].status === "pending" && tx.rows[0].type === "deposit" && Number(tx.rows[0].amount_pesewas) === Number(verified.data.amount) && String(tx.rows[0].rider_id) === String(verified.data.metadata?.riderId)) {
      await client.query("UPDATE wallet_transactions SET status='successful',provider_reference=$1 WHERE id=$2", [String(verified.data.id), tx.rows[0].id]);
      await client.query("UPDATE wallets SET balance_pesewas=balance_pesewas+$1 WHERE rider_id=$2", [tx.rows[0].amount_pesewas, tx.rows[0].rider_id]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  res.sendStatus(200);
}));

// Serve only the public website pages and logo; do not expose backend source files.
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/index.html", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("/admin-password.js", (req, res) => res.sendFile(path.join(__dirname, "admin-password.js")));
app.get("/logo.png", (req, res) => res.sendFile(path.join(__dirname, "logo.png")));

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.status ? err.message : "Something went wrong. Please try again." });
});
async function startServer() {
  try {
    await pool.query("SELECT 1");
    await pool.query("ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS photo_data BYTEA");
    await pool.query("ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS photo_mime TEXT");
    console.log("Database connection and rider profile storage verified.");
    app.listen(port, () => console.log(`Kawutey Logistics API listening on port ${port}`));
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
