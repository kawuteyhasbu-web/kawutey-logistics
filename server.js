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
const riderRouteCache = new Map();
const ROUTING_SERVICE_BASE = (process.env.ROUTING_SERVICE_URL || "https://router.project-osrm.org").replace(/\/+$/, "");
const jwtSecret = process.env.JWT_SECRET;
const ADMIN_LIMIT = 4;
const ADMIN_LOCK_ID = 2026112304;
const adminRegisterLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const authRegisterLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const authLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false });

if (!jwtSecret || jwtSecret.length < 32) {
  console.error("JWT_SECRET must be set to a random value of at least 32 characters.");
  process.exit(1);
}
// Render terminates TLS and forwards requests through one trusted proxy.
app.set("trust proxy", 1);
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


app.post("/api/admin/register", adminRegisterLimiter, asyncRoute(async (req, res) => {
  const configuredCode = process.env.ADMIN_INVITATION_CODE || "";
  if (configuredCode.length < 24) return res.status(503).json({ error: "Administrator invitations are not configured. Contact the system owner." });
  const { fullName, email, password, invitationCode } = req.body || {};
  const name = clean(fullName), mail = clean(email).toLowerCase();
  if (!name || name.length > 120 || !emailValid(mail) || typeof password !== "string" || password.length < 14 || Buffer.byteLength(password, "utf8") > 72 || typeof invitationCode !== "string" || invitationCode.length > 256) {
    return res.status(400).json({ error: "Provide your name, valid email, password of at least 14 characters, and invitation code." });
  }
  const supplied = Buffer.from(invitationCode, "utf8");
  const expected = Buffer.from(configuredCode, "utf8");
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(403).json({ error: "The invitation code is invalid." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADMIN_LOCK_ID]);
    const countResult = await client.query("SELECT COUNT(*)::int AS total FROM users WHERE role='admin'");
    const totalAdmins = countResult.rows[0].total;
    if (totalAdmins >= ADMIN_LIMIT) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "The maximum of four administrator accounts has been reached." });
    }
    const hash = await bcrypt.hash(password, 12);
    const result = await client.query(
      "INSERT INTO users(full_name,email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,'admin','active') RETURNING id,full_name,email,role,status",
      [name, mail, "ADMIN-CONTACT-" + crypto.randomUUID(), hash]
    );
    await client.query("COMMIT");
    res.status(201).json({ message: "Administrator account created. You can now sign in.", user: result.rows[0], remainingSlots: ADMIN_LIMIT - totalAdmins - 1 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") return res.status(409).json({ error: "An account with that email already exists." });
    throw error;
  } finally { client.release(); }
}));

app.post("/api/auth/register", authRegisterLimiter, asyncRoute(async (req, res) => {
  const { fullName, businessName, email, phone, password, role, ghanaCardNumber, location } = req.body || {};
  const name = clean(fullName), business = clean(businessName), mail = clean(email).toLowerCase(), tel = clean(phone);
  if (!name || !emailValid(mail) || !tel || !["vendor", "rider"].includes(role) || typeof password !== "string" || password.length < 10 || Buffer.byteLength(password, "utf8") > 72) {
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

app.post("/api/auth/login", authLoginLimiter, asyncRoute(async (req, res) => {
  const mail = clean(req.body?.email).toLowerCase(), password = req.body?.password;
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ error: "Enter a valid password." });
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


// Rider Connect: private, authenticated rider-to-rider messaging.
app.get("/api/rider/connect/riders", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const result = await pool.query(
    "SELECT u.id, u.full_name, u.location, rp.rider_code FROM users u LEFT JOIN rider_profiles rp ON rp.user_id=u.id WHERE u.role='rider' AND u.status='active' AND u.id<>$1 ORDER BY u.full_name ASC",
    [req.user.id]
  );
  res.set("Cache-Control", "private, no-store");
  res.json({ riders: result.rows });
}));

app.get("/api/rider/connect/conversations", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const result = await pool.query(`
    SELECT peer.id AS rider_id, peer.full_name, rp.rider_code,
      latest.message AS last_message, latest.created_at AS last_message_at,
      latest.sender_id AS last_sender_id,
      COALESCE(unread.unread_count,0)::int AS unread_count,
      COALESCE(prefs.archived,FALSE) AS archived,
      COALESCE(prefs.muted,FALSE) AS muted
    FROM (
      SELECT CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END AS peer_id,
        MAX(id) AS latest_id
      FROM rider_messages
      WHERE sender_id=$1 OR recipient_id=$1
      GROUP BY CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END
    ) threads
    JOIN users peer ON peer.id=threads.peer_id AND peer.role='rider' AND peer.status='active'
    LEFT JOIN rider_profiles rp ON rp.user_id=peer.id
    JOIN rider_messages latest ON latest.id=threads.latest_id
    LEFT JOIN rider_conversation_preferences prefs ON prefs.user_id=$1 AND prefs.peer_id=peer.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS unread_count FROM rider_messages
      WHERE sender_id=peer.id AND recipient_id=$1 AND read_at IS NULL
    ) unread ON TRUE
    ORDER BY latest.created_at DESC, latest.id DESC
  `, [req.user.id]);
  res.set("Cache-Control", "private, no-store");
  res.json({ conversations: result.rows });
}));

app.post("/api/rider/connect/preferences", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const peerId = Number(req.body?.peerId);
  const archived = req.body?.archived;
  const muted = req.body?.muted;
  if (!Number.isSafeInteger(peerId) || peerId < 1 || peerId === Number(req.user.id) ||
      (archived !== undefined && typeof archived !== "boolean") ||
      (muted !== undefined && typeof muted !== "boolean") ||
      (archived === undefined && muted === undefined)) {
    return res.status(400).json({ error: "Choose a valid conversation setting." });
  }
  const peer = await pool.query("SELECT id FROM users WHERE id=$1 AND role='rider' AND status='active'", [peerId]);
  if (!peer.rowCount) return res.status(404).json({ error: "That rider is not available on Rider Connect." });
  const saved = await pool.query(`
    INSERT INTO rider_conversation_preferences(user_id,peer_id,archived,muted)
    VALUES($1,$2,COALESCE($3,FALSE),COALESCE($4,FALSE))
    ON CONFLICT(user_id,peer_id) DO UPDATE SET
      archived=COALESCE($3,rider_conversation_preferences.archived),
      muted=COALESCE($4,rider_conversation_preferences.muted),
      updated_at=NOW()
    RETURNING archived,muted
  `, [req.user.id, peerId, archived ?? null, muted ?? null]);
  res.set("Cache-Control", "private, no-store");
  res.json({ preferences: saved.rows[0] });
}));

app.get("/api/rider/connect/messages", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const peerId = Number(req.query.with);
  if (!Number.isSafeInteger(peerId) || peerId < 1 || peerId === Number(req.user.id)) {
    return res.status(400).json({ error: "Choose a valid Rider Connect conversation." });
  }
  const beforeId = req.query.before === undefined ? null : Number(req.query.before);
  if (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId < 1)) {
    return res.status(400).json({ error: "Invalid message-history cursor." });
  }
  const peer = await pool.query("SELECT id FROM users WHERE id=$1 AND role='rider' AND status='active'", [peerId]);
  if (!peer.rowCount) return res.status(404).json({ error: "That rider is not available on Rider Connect." });
  const result = await pool.query(`
    SELECT m.id, m.sender_id, m.recipient_id, m.message, m.created_at, m.read_at,
      sender.full_name AS sender_name, recipient.full_name AS recipient_name
    FROM rider_messages m
    JOIN users sender ON sender.id=m.sender_id
    JOIN users recipient ON recipient.id=m.recipient_id
    WHERE ((m.sender_id=$1 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$1))
      AND ($3::bigint IS NULL OR m.id < $3)
    ORDER BY m.id DESC
    LIMIT 51
  `, [req.user.id, peerId, beforeId]);
  const hasMore = result.rows.length > 50;
  const messages = result.rows.slice(0, 50).reverse();
  res.set("Cache-Control", "private, no-store");
  res.json({ messages, hasMore });
}));

app.post("/api/rider/connect/read", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const peerId = Number(req.body?.peerId);
  if (!Number.isSafeInteger(peerId) || peerId < 1 || peerId === Number(req.user.id)) {
    return res.status(400).json({ error: "Choose a valid Rider Connect conversation." });
  }
  const peer = await pool.query("SELECT id FROM users WHERE id=$1 AND role='rider' AND status='active'", [peerId]);
  if (!peer.rowCount) return res.status(404).json({ error: "That rider is not available on Rider Connect." });
  await pool.query(
    "UPDATE rider_messages SET read_at=NOW() WHERE sender_id=$1 AND recipient_id=$2 AND read_at IS NULL",
    [peerId, req.user.id]
  );
  res.json({ ok: true });
}));

app.post("/api/rider/connect/messages", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const recipientId = Number(req.body?.recipientId);
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!Number.isSafeInteger(recipientId) || recipientId < 1 || recipientId === Number(req.user.id)) {
    return res.status(400).json({ error: "Choose another approved rider." });
  }
  if (!message || message.length > 2000) {
    return res.status(400).json({ error: "Messages must contain between 1 and 2,000 characters." });
  }
  const recipient = await pool.query(
    "SELECT id FROM users WHERE id=$1 AND role='rider' AND status='active'",
    [recipientId]
  );
  if (!recipient.rowCount) return res.status(404).json({ error: "That rider is not available on Rider Connect." });
  const inserted = await pool.query(
    "INSERT INTO rider_messages(sender_id,recipient_id,message) VALUES($1,$2,$3) RETURNING id,sender_id,recipient_id,message,created_at",
    [req.user.id, recipientId, message]
  );
  res.status(201).json({ message: inserted.rows[0] });
}));

app.get("/api/rider/profile", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT rider_code,approved_at,(photo_data IS NOT NULL AND octet_length(photo_data)>0) AS has_photo,photo_mime,octet_length(photo_data) AS photo_bytes FROM rider_profiles WHERE user_id=$1", [req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Rider profile not found." });
  res.set("Cache-Control", "private, no-store");
  res.json({ profile: result.rows[0] });
}));

app.post("/api/vendor/pickups/:id/cancellation-request", authenticate, roles("vendor"), asyncRoute(async (req, res) => {
  const pickupId=Number(req.params.id), reasonType=clean(req.body?.reasonType), explanation=clean(req.body?.explanation);
  const allowed=["customer_cancelled","incorrect_pickup_details","package_unavailable"];
  if(!Number.isSafeInteger(pickupId)||pickupId<1) return res.status(400).json({error:"Invalid pickup request."});
  if(!allowed.includes(reasonType)) return res.status(400).json({error:"Choose one of the listed cancellation reasons."});
  if(explanation.length<10||explanation.length>500) return res.status(400).json({error:"Please explain the cancellation in at least 10 characters (maximum 500)."});
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const owned=await client.query(`SELECT a.id,a.status,a.accepted_at,
        ((p.preferred_at AT TIME ZONE 'Africa/Accra')::date < (NOW() AT TIME ZONE 'Africa/Accra')::date) AS pickup_date_passed,
        (a.accepted_at IS NOT NULL AND NOW() >= a.accepted_at + INTERVAL '10 minutes') AS cancellation_window_passed
      FROM pickups p JOIN assignments a ON a.pickup_id=p.id
      WHERE p.id=$1 AND p.vendor_id=$2 FOR UPDATE OF a`,[pickupId,req.user.id]);
    if(!owned.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Pickup request not found."});}
    const row=owned.rows[0];
    if(row.pickup_date_passed){await client.query("ROLLBACK");return res.status(409).json({error:"This pickup date has passed. Cancellation requests are no longer available."});}
    if(row.cancellation_window_passed){await client.query("ROLLBACK");return res.status(409).json({error:"The 10-minute cancellation window after rider acceptance has expired."});}
    if(["cancelled","completed"].includes(row.status)){await client.query("ROLLBACK");return res.status(409).json({error:"This pickup can no longer be cancelled."});}
    const result=await client.query("INSERT INTO pickup_cancellation_requests(assignment_id,vendor_id,reason_type,explanation) VALUES($1,$2,$3,$4) RETURNING id,status,created_at",[row.id,req.user.id,reasonType,explanation]);
    await client.query("COMMIT");
    res.status(201).json({message:"Cancellation request sent to the administrator. Your pickup remains active until it is reviewed.",request:result.rows[0]});
  } catch(error) { await client.query("ROLLBACK"); if(error.code==="23505") return res.status(409).json({error:"A cancellation request is already pending for this pickup."}); throw error; }
  finally { client.release(); }
}));

app.get("/api/vendor/pickups", authenticate, roles("vendor"), asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT p.id,p.description,p.preferred_at,p.total_packages,p.large_packages,p.medium_packages,p.small_packages,p.created_at,
      ((p.preferred_at AT TIME ZONE 'Africa/Accra')::date < (NOW() AT TIME ZONE 'Africa/Accra')::date) AS pickup_date_passed,
      (a.accepted_at IS NOT NULL AND NOW() >= a.accepted_at + INTERVAL '10 minutes') AS cancellation_window_passed,
      a.status AS assignment_status,a.rider_id,a.accepted_at,a.delivered_at,
      cr.id AS cancellation_request_id,cr.reason_type AS cancellation_reason_type,cr.explanation AS cancellation_explanation,cr.status AS cancellation_status,cr.admin_note AS cancellation_admin_note,cr.created_at AS cancellation_requested_at,
      CASE WHEN a.rider_id IS NOT NULL AND a.status IN ('accepted','completed') AND u.status='active' THEN u.full_name END AS rider_name,
      CASE WHEN a.rider_id IS NOT NULL AND a.status IN ('accepted','completed') AND u.status='active' THEN u.phone END AS rider_phone,
      CASE WHEN a.rider_id IS NOT NULL AND a.status IN ('accepted','completed') AND u.status='active' THEN u.location END AS rider_location,
      CASE WHEN a.rider_id IS NOT NULL AND a.status IN ('accepted','completed') AND u.status='active' THEN rp.rider_code END AS rider_code,
      CASE WHEN a.rider_id IS NOT NULL AND a.status IN ('accepted','completed') AND u.status='active' THEN (rp.photo_data IS NOT NULL AND octet_length(rp.photo_data)>0) ELSE false END AS rider_has_photo
    FROM pickups p
    LEFT JOIN assignments a ON a.pickup_id=p.id
    LEFT JOIN LATERAL (SELECT id,reason_type,explanation,status,admin_note,created_at FROM pickup_cancellation_requests WHERE assignment_id=a.id ORDER BY created_at DESC LIMIT 1) cr ON true
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

app.delete("/api/vendor/pickups/:id", authenticate, roles("vendor"), asyncRoute(async (req, res) => {
  const pickupId = Number(req.params.id);
  if (!Number.isSafeInteger(pickupId) || pickupId < 1) return res.status(400).json({ error: "Invalid pickup request." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT a.id AS assignment_id,a.status,a.rider_id,
        ((p.preferred_at AT TIME ZONE 'Africa/Accra')::date < (NOW() AT TIME ZONE 'Africa/Accra')::date) AS pickup_date_passed
      FROM pickups p
      JOIN assignments a ON a.pickup_id=p.id
      WHERE p.id=$1 AND p.vendor_id=$2
      FOR UPDATE OF p,a`, [pickupId, req.user.id]);
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "This pickup request could not be found in your account." });
    }
    const assignment = result.rows[0];
    if (assignment.pickup_date_passed) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This pickup date has passed. The expired offer can no longer be changed or deleted." });
    }
    if (assignment.status !== "available" || assignment.rider_id !== null) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Deletion not allowed. This pickup request has already been accepted by a rider or is no longer available." });
    }
    const cancellationHistory = await client.query("SELECT EXISTS(SELECT 1 FROM pickup_cancellation_requests WHERE assignment_id=$1) AS exists",[assignment.assignment_id]);
    if(cancellationHistory.rows[0].exists) {
      await client.query("ROLLBACK");
      return res.status(409).json({error:"This pickup has cancellation review history and cannot be permanently deleted. The history must be preserved."});
    }
    const linkedRecords = await client.query(`SELECT
        EXISTS(SELECT 1 FROM wallet_transactions WHERE package_assignment_id=$1) AS has_wallet_records,
        EXISTS(SELECT 1 FROM exchange_requests WHERE assignment_id=$1) AS has_exchange_records`, [assignment.assignment_id]);
    if (linkedRecords.rows[0].has_wallet_records || linkedRecords.rows[0].has_exchange_records) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This pickup request has related financial or rider records and cannot be permanently deleted." });
    }
    await client.query("DELETE FROM assignments WHERE id=$1", [assignment.assignment_id]);
    await client.query("DELETE FROM pickups WHERE id=$1 AND vendor_id=$2", [pickupId, req.user.id]);
    await client.query("COMMIT");
    res.json({ ok: true, message: "Pickup request permanently deleted." });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/vendor/pickups", authenticate, roles("vendor"), asyncRoute(async (req, res) => {
  const { description, preferredAt, totalPackages, largePackages = 0, mediumPackages = 0, smallPackages = 0, pickupLatitude, pickupLongitude } = req.body || {};
  const total = Number(totalPackages), large = Number(largePackages), medium = Number(mediumPackages), small = Number(smallPackages), when = new Date(preferredAt);
  const hasLatitude = pickupLatitude !== null && pickupLatitude !== undefined && pickupLatitude !== "";
  const hasLongitude = pickupLongitude !== null && pickupLongitude !== undefined && pickupLongitude !== "";
  const lat = hasLatitude ? Number(pickupLatitude) : null;
  const lon = hasLongitude ? Number(pickupLongitude) : null;
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(large) || !Number.isInteger(medium) || !Number.isInteger(small) || Math.min(large, medium, small) < 0 || !Number.isFinite(when.getTime())) return res.status(400).json({ error: "Check the pickup date and package quantities." });
  if (hasLatitude !== hasLongitude || (hasLatitude && (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180))) return res.status(400).json({ error: "The pickup location coordinates are invalid. Please try sharing your location again." });
  const result = await pool.query("INSERT INTO pickups(vendor_id,description,preferred_at,total_packages,large_packages,medium_packages,small_packages,pickup_latitude,pickup_longitude) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [req.user.id, clean(description) || "Package pickup", when, total, large, medium, small, lat, lon]);
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
  const transactions = await pool.query(`SELECT id,type,amount_pesewas,status,reference,provider_reference,package_assignment_id,description,refund_reason,created_at
    FROM wallet_transactions WHERE rider_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`, [req.user.id]);
  res.set("Cache-Control", "private, no-store");
  res.json({
    riderCode: row.rider_code,
    balanceGhs: Number(row.balance_pesewas) / 100,
    totalDepositsGhs: Number(row.deposits_pesewas) / 100,
    commissionDeductedGhs: Number(row.commission_pesewas) / 100,
    packagesAvailable: Math.floor(Number(row.balance_pesewas) / COMMISSION_PESEWAS),
    transactions: transactions.rows.map(t => ({
      id: t.id, type: t.type, amountGhs: Number(t.amount_pesewas) / 100,
      status: t.status, reference: t.reference, providerReference: t.provider_reference,
      assignmentId: t.package_assignment_id, description: t.description, refundReason: t.refund_reason, createdAt: t.created_at
    }))
  });
}));

app.get("/api/rider/assignments", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const latValue = req.query.latitude, lonValue = req.query.longitude;
  const hasLocation = latValue !== undefined && lonValue !== undefined && latValue !== "" && lonValue !== "";
  const riderLat = hasLocation ? Number(latValue) : null;
  const riderLon = hasLocation ? Number(lonValue) : null;
  if (hasLocation && (!Number.isFinite(riderLat) || !Number.isFinite(riderLon) || riderLat < -90 || riderLat > 90 || riderLon < -180 || riderLon > 180)) return res.status(400).json({ error: "Your location could not be read. Please update your location and try again." });
  const result = await pool.query(`SELECT a.id,a.status,a.accepted_at,a.delivered_at,p.description,p.preferred_at,p.total_packages,p.large_packages,p.medium_packages,p.small_packages,p.pickup_latitude,p.pickup_longitude,u.full_name AS vendor_name
    FROM assignments a JOIN pickups p ON p.id=a.pickup_id JOIN users u ON u.id=p.vendor_id
    WHERE (a.status='available' AND (p.preferred_at AT TIME ZONE 'Africa/Accra')::date >= (NOW() AT TIME ZONE 'Africa/Accra')::date)
       OR a.rider_id=$1
    ORDER BY CASE WHEN a.status='available' THEN 0 ELSE 1 END,p.preferred_at ASC`, [req.user.id]);
  const assignments = result.rows.map(row => ({ ...row, distanceKm: null, travelMinutes: null, nearby: false }));
  const routable = hasLocation ? assignments.filter(a => a.status === "available" && a.pickup_latitude !== null && a.pickup_longitude !== null && Number.isFinite(Number(a.pickup_latitude)) && Number.isFinite(Number(a.pickup_longitude))).slice(0, 30) : [];
  if (routable.length) {
    const cacheKey = [riderLat.toFixed(4), riderLon.toFixed(4), routable.map(a => a.id + ":" + Number(a.pickup_latitude).toFixed(4) + ":" + Number(a.pickup_longitude).toFixed(4)).join(",")].join("|");
    let routeData = riderRouteCache.get(cacheKey);
    if (!routeData || Date.now() - routeData.savedAt > 30000) {
      try {
        const coordinates = [[riderLon, riderLat], ...routable.map(a => [Number(a.pickup_longitude), Number(a.pickup_latitude)])].map(pair => pair.join(",")).join(";");
        const destinations = routable.map((_, index) => index + 1).join(";");
        const routeUrl = ROUTING_SERVICE_BASE + "/table/v1/driving/" + coordinates + "?sources=0&destinations=" + destinations + "&annotations=distance,duration";
        const response = await fetch(routeUrl, { signal: AbortSignal.timeout(3500) });
        if (!response.ok) throw new Error("Routing service unavailable");
        const table = await response.json();
        if (table.code !== "Ok" || !Array.isArray(table.distances?.[0]) || !Array.isArray(table.durations?.[0])) throw new Error("No road-route estimates returned");
        routeData = { savedAt: Date.now(), estimates: routable.map((a, index) => ({ id: a.id, distanceKm: Number.isFinite(table.distances[0][index]) ? table.distances[0][index] / 1000 : null, travelMinutes: Number.isFinite(table.durations[0][index]) ? Math.max(1, Math.round(table.durations[0][index] / 60)) : null })) };
        riderRouteCache.set(cacheKey, routeData);
        if (riderRouteCache.size > 100) riderRouteCache.delete(riderRouteCache.keys().next().value);
      } catch {
        routeData = { savedAt: Date.now(), estimates: [] };
        riderRouteCache.set(cacheKey, routeData);
      }
    }
    const estimateById = new Map(routeData.estimates.map(item => [item.id, item]));
    for (const assignment of assignments) {
      const estimate = estimateById.get(assignment.id);
      if (!estimate) continue;
      assignment.distanceKm = estimate.distanceKm === null ? null : Number(estimate.distanceKm.toFixed(1));
      assignment.travelMinutes = estimate.travelMinutes;
      assignment.nearby = estimate.distanceKm !== null && estimate.travelMinutes !== null && estimate.distanceKm <= 5;
    }
  }
  assignments.sort((a, b) => {
    if (a.status !== b.status) return a.status === "available" ? -1 : 1;
    if (a.status === "available" && a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
    if (a.status === "available" && a.distanceKm !== null) return -1;
    if (a.status === "available" && b.distanceKm !== null) return 1;
    return new Date(a.preferred_at) - new Date(b.preferred_at);
  });
  res.set("Cache-Control", "private, no-store");
  res.json({ assignments, locationReceived: hasLocation, routingAvailable: routable.length > 0 && assignments.some(a => a.distanceKm !== null) });
}));

app.post("/api/rider/assignments/:id/accept", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const assignment = await client.query("SELECT a.id,a.status,a.rider_id,p.total_packages,((p.preferred_at AT TIME ZONE 'Africa/Accra')::date < (NOW() AT TIME ZONE 'Africa/Accra')::date) AS pickup_date_passed FROM assignments a JOIN pickups p ON p.id=a.pickup_id WHERE a.id=$1 FOR UPDATE OF a", [req.params.id]);
    if (!assignment.rowCount || assignment.rows[0].status !== "available") {
      const alreadyMine = assignment.rowCount && Number(assignment.rows[0].rider_id) === Number(req.user.id);
      await client.query("ROLLBACK");
      return res.status(409).json({ error: alreadyMine ? "You have already accepted this pickup." : "Sorry, another rider has already accepted this pickup." });
    }
    if (assignment.rows[0].pickup_date_passed) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This pickup offer has expired because its scheduled date has passed." });
    }
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
app.post("/api/rider/assignments/:id/deliver", authenticate, roles("rider"), asyncRoute(async (req,res)=>{
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const found=await client.query("SELECT a.id,a.pickup_id,a.status,a.rider_id FROM assignments a WHERE a.id=$1 FOR UPDATE",[req.params.id]);
    if(!found.rowCount||Number(found.rows[0].rider_id)!==Number(req.user.id)){await client.query("ROLLBACK");return res.status(404).json({error:"Assigned pickup not found."});}
    if(found.rows[0].status==="completed"){await client.query("ROLLBACK");return res.status(409).json({error:"This pickup has already been marked as delivered."});}
    if(found.rows[0].status!=="accepted"){await client.query("ROLLBACK");return res.status(409).json({error:"Only an accepted pickup can be marked as delivered."});}
    const updated=await client.query("UPDATE assignments SET status='completed',delivered_at=NOW() WHERE id=$1 AND status='accepted' RETURNING delivered_at",[req.params.id]);
    await client.query("UPDATE pickups SET status='completed' WHERE id=$1",[found.rows[0].pickup_id]);
    await client.query("COMMIT");
    res.json({message:"Pickup marked as delivered.",deliveredAt:updated.rows[0].delivered_at});
  } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
}));


app.get("/api/rider/deposit-options", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT manual_backup_enabled,momo_account_name,momo_account_number FROM payment_settings WHERE id=1");
  const setting = result.rows[0] || {};
  const paystackConfigured = Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_WEBHOOK_READY === "true");
  const mode = setting.manual_backup_enabled ? "manual" : paystackConfigured ? "paystack" : "unavailable";
  res.set("Cache-Control", "private, no-store");
  res.json({ mode, paystackConfigured, manualBackupEnabled: Boolean(setting.manual_backup_enabled),
    momoAccountName: mode === "manual" ? setting.momo_account_name || "" : "",
    momoAccountNumber: mode === "manual" ? setting.momo_account_number || "" : "" });
}));

app.post("/api/rider/deposits/manual-intents", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const amount = moneyPesewas(req.body?.amountGhs);
  if (amount < 500) return res.status(400).json({ error: "The minimum deposit is GH₵5.00." });
  const settings = await pool.query("SELECT manual_backup_enabled,momo_account_name,momo_account_number FROM payment_settings WHERE id=1");
  const setting = settings.rows[0] || {};
  if (!setting.manual_backup_enabled) return res.status(403).json({ error: "Manual Mobile Money deposits are currently disabled." });
  if (!setting.momo_account_name || !setting.momo_account_number) return res.status(503).json({ error: "The company Mobile Money receiving details have not been configured." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const profile = await client.query("SELECT rider_code FROM rider_profiles WHERE user_id=$1 FOR UPDATE", [req.user.id]);
    if (!profile.rowCount || !profile.rows[0].rider_code) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Your Kawutey rider reference code is not available. Please contact the administrator." });
    }
    const riderCode = String(profile.rows[0].rider_code).trim();
    let reference = "";
    for (let attempt = 0; attempt < 1000; attempt++) {
      const suffix = String(crypto.randomInt(0, 1000)).padStart(3, "0");
      const candidate = riderCode + "-" + suffix;
      const used = await client.query("SELECT 1 FROM wallet_transactions WHERE rider_id=$1 AND type='deposit' AND reference=$2 LIMIT 1", [req.user.id, candidate]);
      if (!used.rowCount) { reference = candidate; break; }
    }
    if (!reference) {
      await client.query("ROLLBACK");
      return res.status(503).json({ error: "A fresh three-digit payment reference could not be generated. Please try again shortly." });
    }
    const result = await client.query("INSERT INTO wallet_transactions(rider_id,type,amount_pesewas,status,reference,description) VALUES($1,'deposit',$2,'pending',$3,'MANUAL_AWAITING_PAYMENT') RETURNING id,amount_pesewas,status,reference,created_at",
      [req.user.id, amount, reference]);
    await client.query("COMMIT");
    res.status(201).json({ message: "Deposit reference created. Send the exact amount to the company account using this reference, then submit your Mobile Money transaction reference.", deposit: result.rows[0],
      payment: { accountName: setting.momo_account_name, accountNumber: setting.momo_account_number } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/rider/deposits/:id/submit", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const network = clean(req.body?.network);
  const momoNumber = clean(req.body?.momoNumber).replace(/[\s-]/g, "");
  const providerReference = clean(req.body?.providerReference);
  if (!["MTN MoMo","Telecel Cash","AT Money"].includes(network)) return res.status(400).json({ error: "Choose a supported Mobile Money network." });
  if (!/^0\d{9}$/.test(momoNumber)) return res.status(400).json({ error: "Enter a valid 10-digit Ghana Mobile Money number." });
  if (providerReference.length < 4 || providerReference.length > 100) return res.status(400).json({ error: "Enter the transaction reference shown by your Mobile Money provider." });
  const settings = await pool.query("SELECT manual_backup_enabled FROM payment_settings WHERE id=1");
  const intent = await pool.query("SELECT id FROM wallet_transactions WHERE id=$1 AND rider_id=$2 AND type='deposit' AND status='pending' AND provider_reference IS NULL AND description='MANUAL_AWAITING_PAYMENT'", [req.params.id, req.user.id]);
  if (!intent.rowCount) return res.status(404).json({ error: "Pending deposit reference not found, or payment details have already been submitted." });
  if (!settings.rows[0]?.manual_backup_enabled) return res.status(403).json({ error: "Manual deposit submissions are currently paused. Contact the administrator." });
  const duplicate = await pool.query("SELECT id FROM wallet_transactions WHERE type='deposit' AND lower(provider_reference)=lower($1) AND status IN ('pending','successful') LIMIT 1", [providerReference]);
  if (duplicate.rowCount) return res.status(409).json({ error: "That Mobile Money transaction reference has already been submitted." });
  const result = await pool.query("UPDATE wallet_transactions SET provider_reference=$1,description=$2 WHERE id=$3 AND rider_id=$4 AND provider_reference IS NULL RETURNING id,amount_pesewas,status,reference,provider_reference,description,created_at",
    [providerReference, "Manual Mobile Money | Network: " + network + " | Sender: " + momoNumber, req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(409).json({ error: "This deposit request has already been submitted." });
  res.json({ message: "Payment details submitted. Your wallet will be credited only after the administrator verifies receipt.", deposit: result.rows[0] });
}));

app.get("/api/rider/deposits", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT id,amount_pesewas,status,reference,provider_reference,description,created_at FROM wallet_transactions WHERE rider_id=$1 AND type='deposit' ORDER BY created_at DESC LIMIT 100", [req.user.id]);
  res.set("Cache-Control", "private, no-store");
  res.json({ deposits: result.rows.map(d => ({ id:d.id, amountGhs:Number(d.amount_pesewas)/100, status:d.status, reference:d.reference, providerReference:d.provider_reference, description:d.description, createdAt:d.created_at })) });
}));

app.get("/api/admin/payment-settings", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT manual_backup_enabled,momo_account_name,momo_account_number,manual_backup_reason,updated_at FROM payment_settings WHERE id=1");
  const setting = result.rows[0] || {};
  res.set("Cache-Control", "private, no-store");
  res.json({ paystackConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_WEBHOOK_READY === "true"), manualBackupEnabled: Boolean(setting.manual_backup_enabled),
    momoAccountName: setting.momo_account_name || "", momoAccountNumber: setting.momo_account_number || "",
    manualBackupReason: setting.manual_backup_reason || "", updatedAt: setting.updated_at || null });
}));

app.get("/api/admin/payment-settings/audit", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT a.manual_backup_enabled,a.reason,a.created_at,u.full_name AS admin_name FROM payment_mode_audit a LEFT JOIN users u ON u.id=a.admin_user_id ORDER BY a.created_at DESC LIMIT 30");
  res.set("Cache-Control", "private, no-store");
  res.json({ entries: result.rows });
}));

app.patch("/api/admin/payment-settings", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const enabled = req.body?.manualBackupEnabled === true;
  const accountName = clean(req.body?.momoAccountName).slice(0,120);
  const accountNumber = clean(req.body?.momoAccountNumber).replace(/[\s-]/g,"").slice(0,20);
  const reason = enabled ? "Manual Mobile Money backup activated by administrator." : "Manual Mobile Money backup deactivated by administrator.";
  if (enabled && (!accountName || !/^0\d{9}$/.test(accountNumber))) return res.status(400).json({ error: "To activate backup mode, provide the company account name and a valid 10-digit receiving number." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const prior = await client.query("SELECT manual_backup_enabled FROM payment_settings WHERE id=1 FOR UPDATE");
    await client.query("UPDATE payment_settings SET manual_backup_enabled=$1,momo_account_name=$2,momo_account_number=$3,manual_backup_reason=$4,updated_by=$5,updated_at=NOW() WHERE id=1",
      [enabled, accountName || null, accountNumber || null, reason, req.user.id]);
    await client.query("INSERT INTO payment_mode_audit(admin_user_id,manual_backup_enabled,reason) VALUES($1,$2,$3)", [req.user.id, enabled, reason]);
    await client.query("COMMIT");
    res.json({ message: enabled ? "Manual Mobile Money backup mode is now active." : "Manual Mobile Money backup mode is now off. Pending requests remain available for review.",
      manualBackupEnabled: enabled, previousManualBackupEnabled: Boolean(prior.rows[0]?.manual_backup_enabled) });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}));

app.get("/api/admin/wallet-transactions", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT t.id,t.rider_id,u.full_name,u.phone,r.rider_code,t.type,t.amount_pesewas,t.status,t.reference,t.provider_reference,t.package_assignment_id,t.description,t.created_at,
      t.related_transaction_id,t.refund_reason,t.reviewed_by,t.reviewed_at,
      cancellation.reason_type AS cancellation_reason_type,cancellation.explanation AS cancellation_explanation,
      refund.id AS refund_transaction_id,refund.reference AS refund_reference,refund.created_at AS refund_created_at,
      refund.reviewed_by AS refund_reviewed_by,refund.reviewed_at AS refund_reviewed_at,
      reviewer.full_name AS reviewer_name
    FROM wallet_transactions t
    JOIN users u ON u.id=t.rider_id
    JOIN rider_profiles r ON r.user_id=u.id
    LEFT JOIN wallet_transactions refund ON refund.related_transaction_id=t.id AND refund.type='refund' AND refund.status='successful'
    LEFT JOIN users reviewer ON reviewer.id=refund.reviewed_by
    LEFT JOIN LATERAL (SELECT reason_type,explanation FROM pickup_cancellation_requests WHERE assignment_id=t.package_assignment_id AND status='approved' ORDER BY reviewed_at DESC NULLS LAST,created_at DESC LIMIT 1) cancellation ON TRUE
    ORDER BY t.created_at DESC,t.id DESC LIMIT 300`);
  res.set("Cache-Control", "private, no-store");
  res.json({ transactions: result.rows.map(t => ({
    id:t.id, riderId:t.rider_id, riderName:t.full_name, phone:t.phone, riderCode:t.rider_code,
    type:t.type, amountGhs:Number(t.amount_pesewas)/100, status:t.status, reference:t.reference,
    providerReference:t.provider_reference, packageAssignmentId:t.package_assignment_id,
    description:t.description, createdAt:t.created_at,
    relatedTransactionId:t.related_transaction_id, refundReason:t.refund_reason, cancellationReasonType:t.cancellation_reason_type, cancellationExplanation:t.cancellation_explanation,
    reviewedBy:t.refund_reviewed_by, reviewedAt:t.refund_reviewed_at, reviewedByName:t.reviewer_name,
    hasSuccessfulRefund:Boolean(t.refund_transaction_id), refundReference:t.refund_reference,
    refundCreatedAt:t.refund_created_at
  })) });
}));


app.post("/api/admin/wallet-transactions/:id/refund", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const transactionId = Number(req.params.id);
  const reasonType = clean(req.body?.reasonType);
  const reason = clean(req.body?.reason).replace(/\s+/g, " ");
  const allowedReasons = ["pickup_cancelled", "incorrect_deduction", "other_valid_reason"];
  if (!Number.isSafeInteger(transactionId) || transactionId < 1) return res.status(400).json({ error: "Invalid wallet transaction." });
  if (!allowedReasons.includes(reasonType)) return res.status(400).json({ error: "Choose a valid refund reason." });
  if (reason.length < 10 || reason.length > 1000) return res.status(400).json({ error: "Please provide a clear refund explanation of at least 10 characters." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const originalResult = await client.query(
      "SELECT id,rider_id,amount_pesewas,status,package_assignment_id FROM wallet_transactions WHERE id=$1 AND type='commission' FOR UPDATE",
      [transactionId]
    );
    if (!originalResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Original commission transaction not found." });
    }
    const original = originalResult.rows[0];
    if (original.status !== "successful" || Number(original.amount_pesewas) >= 0 || !original.package_assignment_id) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Only a successful commission deduction linked to a pickup can be refunded." });
    }

    const existingRefund = await client.query(
      "SELECT id FROM wallet_transactions WHERE related_transaction_id=$1 AND type='refund' AND status='successful' LIMIT 1",
      [original.id]
    );
    if (existingRefund.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This commission has already been refunded. Duplicate refunds are not allowed." });
    }

    const assignmentResult = await client.query(
      "SELECT id,rider_id,status FROM assignments WHERE id=$1 FOR UPDATE",
      [original.package_assignment_id]
    );
    if (!assignmentResult.rowCount || Number(assignmentResult.rows[0].rider_id) !== Number(original.rider_id)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "The original pickup assignment could not be verified against this rider." });
    }
    const assignment = assignmentResult.rows[0];
    if (reasonType === "pickup_cancelled" && assignment.status !== "cancelled") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "A cancellation refund can only be issued after the pickup assignment has been formally cancelled." });
    }

    const wallet = await client.query("SELECT balance_pesewas FROM wallets WHERE rider_id=$1 FOR UPDATE", [original.rider_id]);
    if (!wallet.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "The rider wallet could not be found. No refund was issued." });
    }

    const refundAmount = Math.abs(Number(original.amount_pesewas));
    const reference = "REF-" + crypto.randomUUID();
    const inserted = await client.query(
      "INSERT INTO wallet_transactions (rider_id,type,amount_pesewas,status,reference,package_assignment_id,description,related_transaction_id,refund_reason,reviewed_by,reviewed_at) VALUES($1,'refund',$2,'successful',$3,$4,$5,$6,$7,$8,NOW()) RETURNING id,reference,amount_pesewas,created_at",
      [original.rider_id, refundAmount, reference, original.package_assignment_id,
       "Admin-authorized commission refund (" + reasonType + ")", original.id, reason, req.user.id]
    );
    const credited = await client.query(
      "UPDATE wallets SET balance_pesewas=balance_pesewas+$1 WHERE rider_id=$2",
      [refundAmount, original.rider_id]
    );
    if (!credited.rowCount) throw new Error("Rider wallet could not be credited; refund transaction rolled back.");

    await client.query("COMMIT");
    res.json({
      message: "Refund approved and credited to the rider's wallet.",
      refund: { id: inserted.rows[0].id, reference: inserted.rows[0].reference, amountGhs: refundAmount / 100, createdAt: inserted.rows[0].created_at }
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") return res.status(409).json({ error: "This commission has already been refunded. Duplicate refunds are not allowed." });
    throw error;
  } finally { client.release(); }
}));

app.get("/api/admin/commission-reports", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const requestedDate = typeof req.query.date === "string" ? req.query.date : "";
  const dateParts = requestedDate ? requestedDate.split("-") : [];
  const validDate = !requestedDate || (dateParts.length === 3 && dateParts[0].length === 4 && dateParts[1].length === 2 && dateParts[2].length === 2 && dateParts.every(part => /^[0-9]+$/.test(part)) && !Number.isNaN(Date.parse(requestedDate)) && new Date(requestedDate + "T00:00:00Z").toISOString().slice(0,10) === requestedDate);
  if (!validDate) {
    return res.status(400).json({ error: "Choose a valid report date in YYYY-MM-DD format." });
  }
  const current = await pool.query("SELECT to_char(NOW() AT TIME ZONE 'Africa/Accra','YYYY-MM-DD') AS today");
  const today = current.rows[0].today;
  const reportDate = requestedDate || today;
  if (reportDate > today) return res.status(400).json({ error: "Future commission reports are not available." });

  const [daily, history, entries] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS deduction_count,
        COALESCE(SUM(ABS(t.amount_pesewas)),0)::bigint AS total_pesewas,
        COALESCE(SUM(COALESCE(p.total_packages,0)),0)::int AS package_count
      FROM wallet_transactions t
      LEFT JOIN assignments a ON a.id=t.package_assignment_id
      LEFT JOIN pickups p ON p.id=a.pickup_id
      WHERE t.type='commission' AND t.status='successful' AND t.amount_pesewas<0
        AND (t.created_at AT TIME ZONE 'Africa/Accra')::date=$1::date`, [today]),
    pool.query(`SELECT to_char((t.created_at AT TIME ZONE 'Africa/Accra')::date,'YYYY-MM-DD') AS report_date,
        COUNT(*)::int AS deduction_count,
        COALESCE(SUM(ABS(t.amount_pesewas)),0)::bigint AS total_pesewas,
        COALESCE(SUM(COALESCE(p.total_packages,0)),0)::int AS package_count
      FROM wallet_transactions t
      LEFT JOIN assignments a ON a.id=t.package_assignment_id
      LEFT JOIN pickups p ON p.id=a.pickup_id
      WHERE t.type='commission' AND t.status='successful' AND t.amount_pesewas<0
      GROUP BY (t.created_at AT TIME ZONE 'Africa/Accra')::date
      ORDER BY (t.created_at AT TIME ZONE 'Africa/Accra')::date DESC`),
    pool.query(`SELECT t.id,u.full_name AS rider_name,u.phone,r.rider_code,
        ABS(t.amount_pesewas)::bigint AS amount_pesewas,t.reference,
        t.package_assignment_id,p.total_packages,t.created_at,
        to_char(t.created_at AT TIME ZONE 'Africa/Accra','YYYY-MM-DD HH24:MI:SS') AS ghana_time
      FROM wallet_transactions t
      JOIN users u ON u.id=t.rider_id
      JOIN rider_profiles r ON r.user_id=t.rider_id
      LEFT JOIN assignments a ON a.id=t.package_assignment_id
      LEFT JOIN pickups p ON p.id=a.pickup_id
      WHERE t.type='commission' AND t.status='successful' AND t.amount_pesewas<0
        AND (t.created_at AT TIME ZONE 'Africa/Accra')::date=$1::date
      ORDER BY t.created_at ASC,t.id ASC`, [reportDate])
  ]);
  res.set("Cache-Control", "private, no-store");
  res.json({
    timezone: "Africa/Accra", today, reportDate,
    todaySummary: {
      totalGhs: Number(daily.rows[0].total_pesewas) / 100,
      deductionCount: daily.rows[0].deduction_count,
      packageCount: daily.rows[0].package_count
    },
    reports: history.rows.map(row => ({
      date: row.report_date, totalGhs: Number(row.total_pesewas) / 100,
      deductionCount: row.deduction_count, packageCount: row.package_count
    })),
    entries: entries.rows.map(row => ({
      id: row.id, riderName: row.rider_name, phone: row.phone, riderCode: row.rider_code,
      amountGhs: Number(row.amount_pesewas) / 100, reference: row.reference,
      assignmentId: row.package_assignment_id, packageCount: row.total_packages,
      createdAt: row.created_at, ghanaTime: row.ghana_time
    }))
  });
}));

app.get("/api/admin/deposits", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT t.id,t.rider_id,u.full_name,u.phone,u.email,r.rider_code,t.amount_pesewas,t.status,t.reference,t.provider_reference,t.description,t.created_at FROM wallet_transactions t JOIN users u ON u.id=t.rider_id JOIN rider_profiles r ON r.user_id=u.id WHERE t.type='deposit' ORDER BY CASE WHEN t.status='pending' THEN 0 ELSE 1 END,t.created_at DESC LIMIT 200");
  res.set("Cache-Control", "private, no-store");
  res.json({ deposits: result.rows.map(d => ({ id:d.id, riderId:d.rider_id, riderName:d.full_name, phone:d.phone, email:d.email, riderCode:d.rider_code, amountGhs:Number(d.amount_pesewas)/100, status:d.status, reference:d.reference, providerReference:d.provider_reference, description:d.description, createdAt:d.created_at })) });
}));

app.patch("/api/admin/deposits/:id/review", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const decision = clean(req.body?.decision);
  if (!["approve","reject"].includes(decision)) return res.status(400).json({ error: "Choose approve or reject." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT id,rider_id,amount_pesewas,status FROM wallet_transactions WHERE id=$1 AND type='deposit' FOR UPDATE", [req.params.id]);
    if (!found.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Deposit request not found." }); }
    const deposit = found.rows[0];
    if (deposit.status !== "pending") { await client.query("ROLLBACK"); return res.status(409).json({ error: "This deposit has already been reviewed." }); }
    const details = await client.query("SELECT provider_reference,description FROM wallet_transactions WHERE id=$1", [deposit.id]);
    if (decision === "approve" && (!details.rows[0]?.provider_reference || details.rows[0]?.description === "MANUAL_AWAITING_PAYMENT")) { await client.query("ROLLBACK"); return res.status(400).json({ error: "This request has no submitted Mobile Money transaction reference yet." }); }
    if (decision === "approve") {
      const credited = await client.query("UPDATE wallets SET balance_pesewas=balance_pesewas+$1 WHERE rider_id=$2", [deposit.amount_pesewas, deposit.rider_id]);
      if (!credited.rowCount) throw new Error("Rider wallet was not found; no credit was applied.");
      await client.query("UPDATE wallet_transactions SET status='successful',reviewed_by=$2,reviewed_at=NOW() WHERE id=$1", [deposit.id, req.user.id]);
      await client.query("INSERT INTO payment_deposit_audit(wallet_transaction_id,admin_user_id,decision) VALUES($1,$2,'approve')", [deposit.id, req.user.id]);
    } else {
      await client.query("UPDATE wallet_transactions SET status='failed',reviewed_by=$2,reviewed_at=NOW() WHERE id=$1", [deposit.id, req.user.id]);
      await client.query("INSERT INTO payment_deposit_audit(wallet_transaction_id,admin_user_id,decision) VALUES($1,$2,'reject')", [deposit.id, req.user.id]);
    }
    await client.query("COMMIT");
    res.json({ message: decision === "approve" ? "Deposit verified and wallet credited." : "Deposit request rejected. Wallet not credited." });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}));

app.get("/api/admin/admin-account-count", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role='admin'");
  res.set("Cache-Control", "private, no-store");
  res.json({ total: result.rows[0].total, maximum: ADMIN_LIMIT });
}));

app.get("/api/admin/cancellation-requests", authenticate, roles("admin"), asyncRoute(async (req,res)=>{
  const result=await pool.query(`SELECT cr.id,cr.assignment_id,cr.reason_type,cr.explanation,cr.status,cr.admin_note,cr.contacted_vendor,cr.contact_outcome,cr.contacted_at,cr.created_at,cr.reviewed_at,
    p.id AS pickup_id,p.description,p.preferred_at,p.total_packages,
    v.full_name AS vendor_name,v.business_name AS vendor_business_name,v.phone AS vendor_phone,
    a.status AS assignment_status,a.rider_id,r.full_name AS rider_name,r.phone AS rider_phone
    FROM pickup_cancellation_requests cr
    JOIN assignments a ON a.id=cr.assignment_id
    JOIN pickups p ON p.id=a.pickup_id
    JOIN users v ON v.id=cr.vendor_id
    LEFT JOIN users r ON r.id=a.rider_id
    ORDER BY CASE cr.status WHEN 'pending' THEN 0 ELSE 1 END,cr.created_at DESC LIMIT 200`);
  res.set("Cache-Control","private, no-store"); res.json({requests:result.rows});
}));
app.patch("/api/admin/cancellation-requests/:id/contact", authenticate, roles("admin"), asyncRoute(async(req,res)=>{
  const outcome=clean(req.body?.outcome);
  if(!["spoke_confirmed","spoke_not_confirmed","no_answer","not_called"].includes(outcome)) return res.status(400).json({error:"Choose a valid contact outcome."});
  const result=await pool.query("UPDATE pickup_cancellation_requests SET contacted_vendor=$2,contact_outcome=$3,contacted_by=$4,contacted_at=CASE WHEN $2 THEN NOW() ELSE NULL END WHERE id=$1 AND status='pending' RETURNING id,contact_outcome,contacted_at",[req.params.id,outcome==="spoke_confirmed"||outcome==="spoke_not_confirmed",outcome,req.user.id]);
  if(!result.rowCount) return res.status(404).json({error:"Pending cancellation request not found."});
  res.json({message:"Optional call outcome recorded.",request:result.rows[0]});
}));
app.patch("/api/admin/cancellation-requests/:id/review", authenticate, roles("admin"), asyncRoute(async(req,res)=>{
  const decision=clean(req.body?.decision),note=clean(req.body?.adminNote);
  if(!["approve","reject"].includes(decision)) return res.status(400).json({error:"Choose approve or reject."});
  if(note.length>1000) return res.status(400).json({error:"Administrative note must be 1,000 characters or fewer."});
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const found=await client.query("SELECT cr.id,cr.assignment_id,cr.status,a.pickup_id,a.status AS assignment_status,p.preferred_at,((p.preferred_at AT TIME ZONE 'Africa/Accra')::date < (NOW() AT TIME ZONE 'Africa/Accra')::date) AS pickup_date_passed FROM pickup_cancellation_requests cr JOIN assignments a ON a.id=cr.assignment_id JOIN pickups p ON p.id=a.pickup_id WHERE cr.id=$1 FOR UPDATE OF cr,a,p",[req.params.id]);
    if(!found.rowCount||found.rows[0].status!=="pending"){await client.query("ROLLBACK");return res.status(404).json({error:"Pending cancellation request not found."});}
    const row=found.rows[0];
    if(decision==="approve"){
      if(row.pickup_date_passed && !["cancelled","completed"].includes(row.assignment_status)){
        await client.query("UPDATE pickup_cancellation_requests SET status='rejected',admin_note=$2,reviewed_by=$3,reviewed_at=NOW() WHERE id=$1",[row.id,"Automatically closed: the scheduled pickup date had already passed.",req.user.id]);
        await client.query("COMMIT");
        return res.status(409).json({error:"This pickup date has passed. The cancellation request was closed; expired pickups cannot be cancelled."});
      }
      if(["cancelled","completed"].includes(row.assignment_status)){await client.query("ROLLBACK");return res.status(409).json({error:"This pickup is already cancelled or completed."});}
      await client.query("UPDATE assignments SET status='cancelled' WHERE id=$1",[row.assignment_id]);
      await client.query("UPDATE pickups SET status='cancelled' WHERE id=$1",[row.pickup_id]);
    }
    await client.query("UPDATE pickup_cancellation_requests SET status=$2,admin_note=$3,reviewed_by=$4,reviewed_at=NOW() WHERE id=$1",[row.id,decision==="approve"?"approved":"rejected",note||null,req.user.id]);
    await client.query("COMMIT");
    res.json({message:decision==="approve"?"Cancellation approved. The pickup is now cancelled. Any eligible commission refund remains a separate administrator action.":"Cancellation rejected. The pickup remains active."});
  } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
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
  const result = await pool.query("SELECT u.id,u.full_name,u.email,u.phone,u.location,u.status,r.rider_code,r.approved_at,(r.photo_data IS NOT NULL AND octet_length(r.photo_data)>0) AS has_photo,(r.pending_photo_data IS NOT NULL AND octet_length(r.pending_photo_data)>0) AS has_pending_photo,r.pending_photo_submitted_at FROM users u JOIN rider_profiles r ON r.user_id=u.id WHERE u.role='rider' AND u.status IN ('active','suspended') ORDER BY CASE WHEN u.status='active' THEN 0 ELSE 1 END,r.approved_at DESC NULLS LAST,u.full_name");
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
app.post("/api/admin/riders/:id/photo/replacement", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const photo = req.body?.photoDataUrl;
  const match = typeof photo === "string" ? photo.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/) : null;
  if (!match) return res.status(400).json({ error: "Choose a JPEG, PNG or WebP photograph." });
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 512 * 1024 || bytes.toString("base64") !== match[2]) return res.status(400).json({ error: "The photograph must be no larger than 512 KB." });
  const mime = match[1];
  const validImage = (mime === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length-2] === 0xff && bytes[bytes.length-1] === 0xd9)
    || (mime === "image/png" && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    || (mime === "image/webp" && bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP");
  if (!validImage) return res.status(400).json({ error: "The uploaded file is not a valid supported image." });
  const result = await pool.query("UPDATE rider_profiles r SET pending_photo_data=$1,pending_photo_mime=$2,pending_photo_submitted_at=NOW() FROM users u WHERE r.user_id=u.id AND r.user_id=$3 AND u.role='rider' AND u.status IN ('active','suspended') RETURNING r.user_id,r.pending_photo_submitted_at", [bytes,mime,req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Approved rider not found." });
  res.set("Cache-Control", "no-store");
  res.json({ message: "Replacement photograph uploaded for review. The current approved photograph remains in use.", submittedAt: result.rows[0].pending_photo_submitted_at });
}));
app.get("/api/admin/riders/:id/photo/replacement", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT r.pending_photo_data,r.pending_photo_mime FROM rider_profiles r JOIN users u ON u.id=r.user_id WHERE r.user_id=$1 AND u.role='rider' AND u.status IN ('active','suspended')", [req.params.id]);
  if (!result.rowCount || !result.rows[0].pending_photo_data) return res.status(404).json({ error: "No replacement photograph is awaiting review." });
  res.set({ "Content-Type": result.rows[0].pending_photo_mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.send(result.rows[0].pending_photo_data);
}));
app.post("/api/admin/riders/:id/photo/approve", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("UPDATE rider_profiles r SET photo_data=r.pending_photo_data,photo_mime=r.pending_photo_mime,pending_photo_data=NULL,pending_photo_mime=NULL,pending_photo_submitted_at=NULL FROM users u WHERE r.user_id=u.id AND r.user_id=$1 AND u.role='rider' AND u.status IN ('active','suspended') AND r.pending_photo_data IS NOT NULL RETURNING r.user_id", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "No replacement photograph is awaiting approval." });
  res.set("Cache-Control", "no-store");
  res.json({ message: "Replacement photograph approved. The Rider and Vendor Portals will now use the updated official photograph." });
}));
app.post("/api/admin/riders/:id/photo/reject", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("UPDATE rider_profiles r SET pending_photo_data=NULL,pending_photo_mime=NULL,pending_photo_submitted_at=NULL FROM users u WHERE r.user_id=u.id AND r.user_id=$1 AND u.role='rider' AND u.status IN ('active','suspended') AND r.pending_photo_data IS NOT NULL RETURNING r.user_id", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "No replacement photograph is awaiting review." });
  res.set("Cache-Control", "no-store");
  res.json({ message: "Replacement photograph rejected. The current approved photograph remains unchanged." });
}));
app.post("/api/admin/riders/:id/approve", authenticate, roles("admin"), asyncRoute(async (req, res) => {
  const result = await pool.query("UPDATE users SET status='active' WHERE id=$1 AND role='rider' AND status='pending' RETURNING id", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Pending rider not found." });
  await pool.query("UPDATE rider_profiles SET approved_at=NOW() WHERE user_id=$1", [req.params.id]);
  res.json({ message: "Rider approved." });
}));

app.post("/api/payments/paystack/initialize", authenticate, roles("rider"), asyncRoute(async (req, res) => {
  if (!process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_WEBHOOK_READY !== "true") return res.status(503).json({ error: "Paystack is not fully configured yet. The secure payment webhook must also be registered." });
  const mode = await pool.query("SELECT manual_backup_enabled FROM payment_settings WHERE id=1");
  if (mode.rows[0]?.manual_backup_enabled) return res.status(403).json({ error: "Paystack deposits are paused while manual backup mode is active." });
  const amount = moneyPesewas(req.body?.amountGhs);
  if (amount < 500) return res.status(400).json({ error: "Minimum deposit is GH₵5." });
  let reference = "";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const profile = await client.query("SELECT rider_code FROM rider_profiles WHERE user_id=$1 FOR UPDATE", [req.user.id]);
    if (!profile.rowCount || !profile.rows[0].rider_code) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Your Kawutey rider reference code is not available. Please contact the administrator." });
    }
    const riderCode = String(profile.rows[0].rider_code).trim();
    for (let attempt = 0; attempt < 1000; attempt++) {
      const suffix = String(crypto.randomInt(0, 1000)).padStart(3, "0");
      const candidate = riderCode + "-" + suffix;
      const used = await client.query("SELECT 1 FROM wallet_transactions WHERE rider_id=$1 AND type='deposit' AND reference=$2 LIMIT 1", [req.user.id, candidate]);
      if (!used.rowCount) { reference = candidate; break; }
    }
    if (!reference) {
      await client.query("ROLLBACK");
      return res.status(503).json({ error: "A fresh three-digit payment reference could not be generated. Please try again shortly." });
    }
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
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); await pool.query("UPDATE wallet_transactions SET status='failed' WHERE reference=$1 AND status='pending'", [reference]).catch(() => {}); throw error; }
  finally { client.release(); }
}));

app.post("/api/payments/paystack/webhook", express.raw({ type: "application/json" }), asyncRoute(async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.sendStatus(503);
  const signature = req.headers["x-paystack-signature"];
  const expected = crypto.createHmac("sha512", secret).update(req.body).digest("hex");
  if (typeof signature !== "string" || !/^[a-f0-9]{128}$/i.test(signature) ||
      !crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return res.sendStatus(401);

  let event;
  try { event = JSON.parse(req.body.toString("utf8")); }
  catch { return res.sendStatus(400); }
  if (event.event !== "charge.success" || typeof event.data?.reference !== "string" || !event.data.reference) return res.sendStatus(200);

  const reference = event.data.reference;
  const verify = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { Authorization: "Bearer " + secret }
  });
  const verified = await verify.json();
  const payment = verified?.data;
  if (!verify.ok || !verified.status || payment?.status !== "success" || payment.currency !== "GHS" ||
      payment.reference !== reference || !Number.isSafeInteger(Number(payment.amount)) ||
      !payment.metadata || payment.metadata.purpose !== "rider_wallet_deposit") return res.sendStatus(200);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tx = await client.query(
      "SELECT t.*, rp.rider_code FROM wallet_transactions t JOIN rider_profiles rp ON rp.user_id=t.rider_id WHERE t.reference=$1 FOR UPDATE OF t",
      [reference]
    );
    if (tx.rowCount && tx.rows[0].status === "pending" && tx.rows[0].type === "deposit" &&
        Number(tx.rows[0].amount_pesewas) === Number(payment.amount) &&
        String(tx.rows[0].rider_id) === String(payment.metadata.riderId) &&
        String(tx.rows[0].rider_code) === String(payment.metadata.riderCode)) {
      const credited = await client.query(
        "UPDATE wallets SET balance_pesewas=balance_pesewas+$1 WHERE rider_id=$2",
        [tx.rows[0].amount_pesewas, tx.rows[0].rider_id]
      );
      if (credited.rowCount) {
        await client.query(
          "UPDATE wallet_transactions SET status='successful',provider_reference=$1 WHERE id=$2 AND status='pending'",
          [String(payment.id), tx.rows[0].id]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  res.sendStatus(200);
}));

// Serve only the public website pages and logo; do not expose backend source files.
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/index.html", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
const adminPortalPath = process.env.ADMIN_PORTAL_PATH || "";
if (/^\/[A-Za-z0-9_-]{24,100}$/.test(adminPortalPath)) {
  app.get(adminPortalPath, (req, res) => res.set("Cache-Control", "no-store").sendFile(path.join(__dirname, "admin-portal.html")));
} else {
  console.error("ADMIN_PORTAL_PATH must be configured as a private path with 24–100 letters, numbers, underscores or hyphens.");
}
app.get("/admin-dashboard", (req, res) => res.set("Cache-Control", "no-store").sendFile(path.join(__dirname, "admin.html")));
app.get("/admin.html", (req, res) => res.sendStatus(404));
app.get("/payment-return.html", (req, res) => res.sendFile(path.join(__dirname, "payment-return.html")));
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
    await pool.query("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reviewed_by BIGINT");
    await pool.query("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ");
    await pool.query("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS related_transaction_id BIGINT REFERENCES wallet_transactions(id)");
    await pool.query("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS refund_reason TEXT");
    await pool.query("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ");
    await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS one_successful_refund_per_transaction ON wallet_transactions(related_transaction_id) WHERE type='refund' AND status='successful'");
    await pool.query(`CREATE TABLE IF NOT EXISTS pickup_cancellation_requests (
      id BIGSERIAL PRIMARY KEY,
      assignment_id BIGINT NOT NULL REFERENCES assignments(id),
      vendor_id BIGINT NOT NULL REFERENCES users(id),
      reason_type TEXT NOT NULL CHECK(reason_type IN ('customer_cancelled','incorrect_pickup_details','package_unavailable')),
      explanation TEXT NOT NULL CHECK(length(explanation) BETWEEN 10 AND 500),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      admin_note TEXT,
      contacted_vendor BOOLEAN NOT NULL DEFAULT FALSE,
      contact_outcome TEXT CHECK(contact_outcome IN ('spoke_confirmed','spoke_not_confirmed','no_answer','not_called')),
      contacted_by BIGINT REFERENCES users(id),
      contacted_at TIMESTAMPTZ,
      reviewed_by BIGINT REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS one_pending_cancellation_per_assignment ON pickup_cancellation_requests(assignment_id) WHERE status='pending'");
    await pool.query("CREATE INDEX IF NOT EXISTS cancellation_requests_status_created_idx ON pickup_cancellation_requests(status,created_at DESC)");
    await pool.query("CREATE TABLE IF NOT EXISTS payment_settings (id INTEGER PRIMARY KEY CHECK (id=1), manual_backup_enabled BOOLEAN NOT NULL DEFAULT FALSE, momo_account_name TEXT, momo_account_number TEXT, manual_backup_reason TEXT, updated_by BIGINT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await pool.query("INSERT INTO payment_settings(id) VALUES(1) ON CONFLICT (id) DO NOTHING");
    await pool.query("CREATE TABLE IF NOT EXISTS payment_mode_audit (id BIGSERIAL PRIMARY KEY, admin_user_id BIGINT NOT NULL, manual_backup_enabled BOOLEAN NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await pool.query("CREATE TABLE IF NOT EXISTS payment_deposit_audit (id BIGSERIAL PRIMARY KEY, wallet_transaction_id BIGINT NOT NULL, admin_user_id BIGINT NOT NULL, decision TEXT NOT NULL CHECK (decision IN ('approve','reject')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await pool.query("CREATE TABLE IF NOT EXISTS rider_messages (\n  id BIGSERIAL PRIMARY KEY,\n  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,\n  recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,\n  message TEXT NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 2000),\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  CHECK (sender_id <> recipient_id)\n);\nCREATE INDEX IF NOT EXISTS rider_messages_sender_created_idx ON rider_messages(sender_id, created_at DESC, id DESC);\nCREATE INDEX IF NOT EXISTS rider_messages_recipient_created_idx ON rider_messages(recipient_id, created_at DESC, id DESC);");
    await pool.query("ALTER TABLE rider_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ");
    await pool.query("CREATE INDEX IF NOT EXISTS rider_messages_unread_idx ON rider_messages(recipient_id, sender_id, created_at DESC) WHERE read_at IS NULL");
    await pool.query("CREATE TABLE IF NOT EXISTS rider_conversation_preferences (user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, peer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, archived BOOLEAN NOT NULL DEFAULT FALSE, muted BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id,peer_id), CHECK(user_id <> peer_id))");
    console.log("Database connection and rider profile storage verified.");
    app.listen(port, () => console.log(`Kawutey Logistics API listening on port ${port}`));
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
