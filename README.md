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
