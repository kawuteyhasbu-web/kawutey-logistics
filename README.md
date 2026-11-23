# Kawutey Logistics

The existing homepage and logo are intentionally preserved. This branch adds the first server-side foundation for moving account and wallet operations out of browser storage.

## Current state
- Existing `index.html` and `logo.png` remain unchanged.
- `server.js` provides an Express API foundation.
- `schema.sql` defines PostgreSQL tables for users, rider wallets, pickups, assignments, transactions and rider messages.
- Rider commissions are represented as GH₵5 (500 pesewas) per package.
- Assignment acceptance and wallet deduction run in one database transaction with a unique commission constraint.
- Paystack deposit initialization and signed webhook verification are scaffolded.
- Vendor registration and rider registration have separate role handling. Riders require administrator approval.

## Local setup
1. Install Node.js 20 or newer and PostgreSQL.
2. Run `npm install`.
3. Create a PostgreSQL database and run `psql "$DATABASE_URL" -f schema.sql`.
4. Copy `.env.example` to `.env` and set real values locally. Never commit `.env`.
5. Set a long random `JWT_SECRET`, database connection, and allowed website origin.
6. Run `npm run check`, then `npm start`.

## Frontend API connection

The vendor portal now calls the backend API for registration, login, and pickup requests. If the website and API are hosted on different domains, set `window.KAWUTEY_API_BASE` to the backend's HTTPS address before the main website script runs, and set `CORS_ORIGIN` on the backend to the exact website origin. Do not include a trailing slash in the backend address. If both are served from the same domain, the default empty API base uses same-origin routes.

Vendor login tokens are kept in `sessionStorage` and are cleared when the vendor logs out or the browser session ends.

Rider registration and login are temporarily paused in the page because secure rider photograph storage and the handling of Ghana Card information are not yet implemented. Do not re-enable the old browser-storage rider flow.

## Important before public launch
This is a backend foundation, not a finished production deployment. The current static frontend still uses browser localStorage and must be connected to these API routes before it is used for real accounts, Ghana Card information, assignments or wallet balances. Do not accept real deposits until Paystack credentials, HTTPS webhook URL, merchant configuration and end-to-end payment tests are completed. File/photo upload, admin provisioning, rider messaging/exchange approval, refund processing, account recovery, audit logging and production database migrations still need implementation and testing.

The rider registration endpoint only retains the last four digits of the Ghana Card number; full Ghana Card details should not be collected until a lawful, secure handling and retention process is agreed. Use HTTPS and review Ghana data-protection obligations before launch.


## Administrator signup notifications (backend foundation)

Successful vendor and rider registrations now create a persistent record in the `admin_notifications` table. Authenticated administrator API routes are available:

- `GET /api/admin/notifications` — list recent notifications.
- `PATCH /api/admin/notifications/:id/read` — mark a notification as read.

Email alerts use SMTP when configured. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL`, and optionally `MAIL_FROM` as private environment variables on the backend host. Do not commit real values to GitHub. If SMTP is not configured or email delivery fails, the signup notification remains saved in the database and its email status records the outcome.

**Still required before this is usable by the administrator:** create/provision a secure admin account, build the Admin Dashboard login and notification interface, configure SMTP, apply the updated database schema, and test both registration types end to end. The API routes are not a substitute for the dashboard UI.

## Administrator account and dashboard

A separate `admin.html` page now provides an administrator sign-in and a signup-notification inbox. It uses the existing `/api/auth/login`, `/api/me`, and admin-only notification endpoints. Only a user whose database role is `admin` can load the inbox. Admin session tokens are kept in session storage and cleared on logout.

### One-time initial administrator setup

1. Configure a development/test PostgreSQL database and apply `schema.sql`.
2. Set `DATABASE_URL`, `JWT_SECRET` (at least 32 random characters), `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` (at least 14 characters) in a private local `.env` file or hosting secrets. Never commit the real `.env` file or share credentials in chat.
3. Set `BOOTSTRAP_ADMIN_CONFIRM=YES_CREATE_ADMIN` temporarily in that private environment.
4. Run `npm run create-admin`. Repeat the setup with different administrator details only when you are ready to create another approved administrator. The script stops once four administrator accounts exist.
5. Remove `BOOTSTRAP_ADMIN_CONFIRM` and the temporary administrator password variable from the environment after each setup. Keep all passwords private.
6. Open `/admin.html` on the same website origin, or set `window.KAWUTEY_API_BASE` to the backend HTTPS origin before its page script runs and configure the backend CORS allowlist.

The system allows a maximum of four administrator accounts in total. The database trigger blocks a fifth administrator even if another code path attempts to add one. The setup script uses a database lock and count check so simultaneous setup attempts cannot exceed the limit. It can create administrator accounts until all four positions are filled; it does not reset or recover existing administrator credentials. If an administrator already exists, use a separately reviewed password-reset procedure rather than deleting or overwriting accounts.

The dashboard currently lists recent signup notifications and lets an administrator mark them as reviewed. It is a first-stage notification inbox, not the complete operational Admin Dashboard (rider approvals, vendor management, assignments, wallet oversight, refunds and reports remain outstanding).

Email delivery still requires private SMTP environment variables. An unconfigured or failed email is recorded in the inbox status; the dashboard notification is still persisted in PostgreSQL.
