# Kawutey Logistics — Project Plan

_Last updated: 22 November 2026_

This document is the working reference for the Kawutey Logistics website. Update it when decisions change. Do not treat this plan as proof that a feature is already implemented or secure; implementation and testing must be recorded separately.

## 1. Main decisions

- **Business:** Kawutey Logistics, Ghana.
- **Brand promise:** “Your Packages, Our Priority.”
- **Budget:** GH₵1–GH₵50 per month for the initial development stage.
- **Development approach:** Preserve the existing website design, logo, colours and layout while improving functionality.
- **Code repository:** GitHub.
- **Backend hosting target:** Render.
- **Database target:** Managed PostgreSQL, initially evaluating Neon.
- **Payment provider target:** Paystack, subject to merchant onboarding, fees and supported Ghanaian payment methods.
- **Launch approach:** Build and test first. Do not accept real customer data or real deposits on an unsuitable free development setup.

## 2. Hosting plan and budget

### Development and testing stage
- Keep source code in GitHub.
- Use Render's free service only for development/testing if its current limits are suitable.
- Use Neon’s free PostgreSQL tier only for test data and development.
- Check current provider pricing, limits, data retention, backups, sleep behaviour and regional availability before relying on any plan.
- Do not enter payment details or approve a paid subscription without the owner's explicit decision.
- Do not put secrets, passwords, database URLs or API keys in GitHub.

### Before live business operations
- Select dependable paid backend hosting and managed PostgreSQL with a cost the business can sustain.
- Configure automatic backups and test restoration.
- Configure HTTPS, secure environment variables, access controls, monitoring and error logging.
- Confirm data protection, payment and other applicable Ghanaian legal requirements with qualified professionals.
- Recheck all provider prices and terms before purchase.

**Important:** GH₵1–GH₵50 is a development-stage budget, not a promise that a complete live logistics platform with secure payments and reliable backups can operate safely within that amount.

## 3. Website features

### Vendor portal
- Vendor registration and login.
- Collect name, business name, phone number, email and password.
- Request package pickups and schedule collection dates/times.
- View assigned riders and delivery history.
- Contact assigned riders.

Keep these features out of the vendor dashboard for the current phase:
- Enter customer delivery details.
- View delivery charges.
- Monitor package status.
- Submit complaints.

### Rider portal
### Rider profile photograph — required display behaviour

- The rider's uploaded and approved photograph is the official profile image.
- Whenever a rider is logged in, display this photograph prominently on the rider dashboard, alongside the rider's name and unique rider reference code.
- When a vendor views the rider assigned to a pickup/package handover, display that same photograph clearly beside the rider's name and relevant handover details. This helps the vendor recognise the rider receiving the package.
- Use one consistent approved profile image in both places. If an administrator approves an updated photograph, both views must show the updated image.
- Store the image securely and show it only to authenticated users with a legitimate role-based need to see it. Do not expose Ghana Card images or other identity documents as profile photographs.
- If no approved photograph is available, show a clear neutral placeholder rather than a broken image or another rider's photograph.

- Rider registration and login.
- Collect name, phone, email, Ghana Card ID number, profile photograph and password.
- Admin verification/approval before receiving assignments.
- Rider wallet, deposit records, commission deductions and transaction history.
- Permanent unique rider reference code, for example `KW-RD-0001`.
- Accept or decline eligible package assignments.
- Rider Connect for rider-to-rider communication and package exchange requests. Company approval and records are required for exchanges.
- Refund request workflow, subject to the policy below.

Protect Ghana Card information and rider photographs. Do not expose them publicly or collect real sensitive data during development tests.

### Administrator portal
- Manage vendor accounts.
- Verify, approve, suspend or deactivate riders.
- Assign deliveries and manage pickup requests.
- Monitor delivery operations.
- Verify payment transactions and monitor wallet deposits/deductions.
- Review eligible refund requests.
- Review and approve/reject package exchange requests.
- Manage service areas and delivery prices.
- View operational and financial reports.
- Restrict administrator access using secure role-based permissions.

## 4. Wallet and commission rules

- Rider deposits are funds held for the rider's delivery access; deposits are **not** company commission revenue.
- Commission is **GH₵5 for each package successfully accepted**.
- Deduct the commission exactly once when acceptance succeeds.
- Viewing or declining a package must not cause a deduction.
- Block acceptance when available balance is below GH₵5.
- Prevent duplicate deductions from repeat clicks, refreshes, retries or duplicate requests.
- Link every deduction to a specific package/assignment ID.
- Record deposits, gateway references, rider reference code, timestamps, statuses, deductions, package IDs and refunds.
- If an assignment is cancelled or reversed, apply the documented company refund policy and record the reversal.
- Refund requests are not automatic payouts. A refund workflow and actual payout process must be implemented and tested.
- Refund requests may be restricted after a rider accepts an assignment, subject to a clearly published policy.
- Example: a GH₵50 deposit permits up to 10 package acceptances before fees; after four successful acceptances, GH₵20 commission has been deducted and GH₵30 remains.

## 5. Payment safety

- Paystack is the intended payment integration candidate, subject to merchant approval and current Ghana service availability.
- Verify every payment on the server using the provider's verification mechanism and/or authenticated webhook.
- Never credit a wallet from a screenshot, browser message or unverified callback.
- Match each successful payment to the correct rider and unique rider reference.
- Use idempotency/unique transaction references to prevent duplicate wallet credits.
- Keep all provider secret keys in hosting environment variables, never in frontend code or GitHub.
- Test with provider test mode before enabling live payments.

## 6. Security and legal safeguards

- Hash passwords with a suitable password-hashing algorithm; never store plaintext passwords.
- Enforce server-side authentication, authorization and input validation.
- Apply least-privilege access for vendors, riders and administrators.
- Protect personal data in transit and at rest; limit collection and retention to what is necessary.
- Do not publish Ghana Card numbers, private contact details or rider documents.
- Keep audit records for wallet credits, commission deductions, refunds and administrator actions.
- Use secure backups and test recovery before major changes.
- Review Ghana's Data Protection Act, 2012 (Act 843), Cybersecurity Act, 2020 (Act 1038), Electronic Transactions Act, 2008 (Act 772), and Payment Systems and Services Act, 2019 (Act 987), as applicable. Obtain qualified Ghanaian legal advice before launch; this list is not a legal compliance determination.

## 7. Working sequence

1. Inspect the existing repository and preserve the current website design.
2. Review the existing frontend and the backend-preparation branch.
3. Identify what is already implemented, incomplete or unsafe.
4. Agree on the technical changes before modifying existing website files.
5. Build authentication, database integration and role permissions.
6. Build and test vendor, rider and administrator workflows.
7. Implement wallet accounting and simulated payment tests.
8. Perform security, backup/restore and functional testing.
9. Select live hosting within an approved budget.
10. Complete payment-provider onboarding, legal review and launch checks before accepting real users or money.

## 8. Change and release rules

- Keep the existing main branch and original backup intact.
- Work on a separate development branch and review changes before merging.
- Do not overwrite existing files without inspecting them first.
- Do not deploy untested changes to the live website.
- Record significant decisions, completed work, tests and outstanding risks in this document or the project README.
- The business owner retains control of GitHub, hosting, payment-provider accounts and credentials.

## 9. Current status at the time this plan was written

- The GitHub repository exists and has a `main` branch.
- A development branch named `setup/secure-backend-prep` exists.
- The development branch contains `index.html`, `logo.png`, `server.js`, `schema.sql`, `package.json`, `.env.example`, `.gitignore` and `README.md`.
- This plan has been added as a project reference. The presence of these files does not mean the backend has been fully audited, deployed or tested.
- Hosting accounts, production database, live payment integration and launch readiness are not confirmed by this document.


## 10. Progress update — 22 November 2026

### Completed in the development branch
- Added a vendor pickup-history API endpoint.
- Added vendor location to account records, including a safe SQL migration for existing databases.
- Connected vendor registration and login in the existing page to the backend API.
- Connected vendor pickup submission and pickup-history display to PostgreSQL-backed API routes.
- Vendor login tokens are held in session storage rather than saved as long-lived browser profile data.
- Removed the exposed Web3Forms access key from the current page.
- Updated the vendor password field to require at least 10 characters.
- Added a required business-name field to vendor registration and passed it to the API.
- Added a nullable `business_name` database column and safe migration; the owner has run the migration successfully in Neon.
- Updated registration, login and authenticated account lookup to save and return vendor business names; admin signup notification details use the saved business name.
- Preserved the existing page design and logo.

### Temporarily paused for safety
- Rider registration and login are hidden/paused until secure photograph storage and the required identity-data handling are implemented. The old browser-based rider flow must not be re-enabled.
- Wallet, rider messaging, exchanges, refunds and administrator controls are not yet connected to the new backend.

### Not yet verified
- The hosted API health endpoint and browser-to-API CORS reachability have been checked successfully. This does not prove vendor registration, login or pickup workflows are fully tested.
- The new vendor business-name registration and database flow still needs a controlled functional test.
- No real deposits or real Ghana Card details should be used during this development stage.
- Functional, security and payment tests remain outstanding.


## 11. Existing account preservation and migration — required

- Make a reasonable, documented effort to preserve existing vendor and rider accounts when moving from the old website to the new database-backed system.
- Before migration, inspect the old website's actual account-storage format and determine which fields and records can be recovered safely.
- Do not assume that account records are stored in GitHub. The old site used browser-local storage, which may mean records exist separately on individual users' devices rather than in one central database.
- Recoverable records may include names, business names, phone numbers, email addresses and other necessary account details, depending on what was actually stored and whether the owner/user can provide the data.
- Do not migrate plaintext passwords. If the old system stored passwords insecurely or their format cannot be safely verified, require users to set a new password through a secure reset or account-claim process.
- Migrate only data that is available, accurate enough to use, and lawfully collected. Verify account ownership before activating migrated accounts.
- Treat Ghana Card information and profile photographs as sensitive personal data: migrate only where necessary, securely, with appropriate access restrictions and legal review.
- Keep a migration log, protect any temporary export files, and securely dispose of temporary copies after successful verification.
- Do not promise that every old account can be recovered. If a user's only copy of their old account data was in a browser that is no longer accessible and no backup/export exists, that account may not be recoverable.
- Where full migration is not possible, provide a safe account-recovery or re-registration route that minimises inconvenience and avoids duplicate accounts where practical.
- Test migration on a copy/test database first. Keep a verified backup before any production migration.

## 12. Administrator notifications for new registrations — required

- Notify the administrator whenever a new vendor account is successfully registered.
- Notify the administrator whenever a new rider account is successfully registered.
- Notifications should be generated by the server only after the registration record has been successfully saved; do not send a success notification for a failed or incomplete signup.
- Include useful, non-sensitive details such as account type (vendor/rider), registered name, business name where relevant, date/time and a secure link or instruction for the administrator to review the account.
- Never include passwords, full Ghana Card numbers, identity-document images, authentication tokens or other unnecessary sensitive information in notification messages.
- Rider notifications should make clear that the rider still requires administrator verification/approval before receiving assignments.
- Vendor and rider signup notifications should be distinguishable so the administrator can quickly identify which type of account needs attention.
- **Required delivery channels: both administrator email and an in-dashboard notification.** Send an email alert and create a persistent notification inside the Admin Dashboard for each successful vendor or rider signup. Any email service credentials must be stored as hosting environment secrets, not in frontend code or GitHub.
- Handle notification-service failure safely: save the account first, log the notification failure securely, and allow retry or show the pending notification state to an administrator. A notification failure must not silently create duplicate accounts if the user retries signup.
- Restrict notification recipients and administrative review links to authorised administrators.
- Test both vendor and rider signup notifications, including failed signups, duplicate submissions and notification-provider outages, before launch.

## 13. Newly agreed requirements — 22 November 2026

- Existing vendor and rider account preservation/migration is an official project requirement, subject to recoverability, safe password handling, verification and applicable law.
- Administrator notification on every successful vendor or rider signup is an official project requirement, delivered through **both email and the Admin Dashboard**.
- These are requirements recorded in the plan; they are not yet implemented or tested.


## 14. Implementation progress — signup notifications

### Added to the development branch
- Added a PostgreSQL `admin_notifications` table to store vendor/rider signup alerts, creation time, read time and email-delivery status.
- Updated successful vendor and rider registration to create a persistent notification in the same database transaction as the new account.
- Added admin-only API routes to list notifications and mark them as read.
- Added SMTP email delivery support for signup alerts. Email content excludes passwords and Ghana Card details.
- Added environment-variable placeholders for SMTP configuration. Real email credentials must be added privately to the hosting environment, never committed to GitHub.
- Email failure does not undo a successful signup; the database notification remains and records the email status.

### Still outstanding
- Provision a secure administrator account and define its initial credential/reset process.
- Build the Admin Dashboard login, notification list, unread indicator and mark-as-read interface.
- Configure the administrator email address and SMTP provider credentials.
- Apply the updated SQL schema to the development database.
- Run syntax, database, functional and security tests for both vendor and rider signup notifications.
- Rider registration remains paused until secure photo upload and identity-data handling are implemented.
- Account migration remains a planned requirement; no old user accounts have yet been migrated.

These changes are code additions only. They have not been deployed or verified against a running database or email service.


## 15. Implementation progress — administrator account and signup inbox

### Added to the development branch
- Added `create-admin.js`, a one-time administrator bootstrap script. It requires explicit confirmation, a strong password (minimum 14 characters), and refuses to create a second administrator if one already exists.
- Added the `npm run create-admin` command.
- Added `admin.html`, a separate administrator sign-in page and persistent signup-notification inbox.
- The page authenticates through the existing login endpoint, checks the signed-in role, loads notifications through admin-protected APIs, and supports marking notifications as reviewed.
- Admin login token is stored in session storage and removed on logout.
- The existing public website design and `main` branch have not been changed.

### Still outstanding
- The bootstrap script has not been run. No administrator account has been created by this code change.
- Configure private hosting/local environment secrets and apply `schema.sql` to a development database.
- Configure SMTP and administrator email address.
- Test admin creation, login, role restrictions, notification rendering, mark-as-reviewed, and email delivery.
- The admin page is only the initial notification inbox; the full operational Admin Dashboard remains to be built.
- Do not deploy or use this for real customer information until functional and security testing is completed.


## 16. Administrator-controlled rider photograph replacement — 25 November 2026

### Added to the testing branch
- Added separate pending replacement-photograph storage fields to rider profiles. Uploading a replacement does not overwrite the current approved photograph.
- Added administrator-only routes to upload a replacement, privately preview it, approve it, or reject it.
- Replacement uploads accept validated JPEG, PNG or WebP images up to 512 KB.
- The Admin Portal Rider Management section now shows the current official photograph and a separate pending replacement preview, with upload, approve and reject controls.
- Approval promotes the pending image to the official rider photograph; rejection clears only the pending image. The existing official photograph remains unchanged after rejection.
- Rider and Vendor photo endpoints continue reading the same official photograph fields, so both portals use the approved image.

### Required before use
- Apply the new `schema.sql` migration to the **testing database only**.
- JavaScript syntax checks for `server.js` and the Admin Portal script passed after the changes.
- Still test upload validation, administrator-only access, pending preview, approve/reject behaviour, and the Rider and Vendor photo views.
- Confirm the testing deployment is Live and verify the complete workflow in the browser.
- Do not apply this migration to the production database or merge to the production branch without separate approval.

### Testing results — 25 November 2026
- The three pending-photo database columns were successfully added to the testing database.
- Render reported the testing service deployment as **Live**.
- Successfully uploaded a replacement photograph and confirmed it appeared as pending for administrator review.
- Confirmed the existing approved photograph remained official while the replacement was pending.
- Approved a replacement and confirmed the new official photograph appeared in both the Vendor Portal and Rider Portal.
- Uploaded a second replacement and rejected it. The system confirmed the current approved photograph remained unchanged.
- Confirmed the rejected pending photograph was no longer accessible through the administrator's private preview.
- The owner manually verified the portal displays and post-rejection access behaviour during this test session.

**Testing status:** The administrator-controlled replacement-photo workflow has passed the functional checks listed above on the testing deployment. This is not a full independent security audit. Keep the production branch and production database unchanged; do not merge or deploy to production without separate approval.



## 17. Authentication hardening — 25 November 2026

### Implemented on the testing branch
- Added a dedicated rate limit of five vendor/rider registration attempts per IP per hour.
- Added a dedicated login rate limit of ten failed attempts per IP per 15 minutes; successful logins are excluded from the failure count.
- Retained the existing general API rate limit and administrator-registration rate limit.
- Enforced a maximum bcrypt-compatible password size of 72 UTF-8 bytes for vendor/rider registration, login input and administrator registration, preventing silent bcrypt truncation ambiguity. Existing minimum password requirements remain in place.

### Verification still required
- Run JavaScript syntax checks and deploy to the testing service.
- Test that ordinary sign-in and registration still work, invalid attempts are throttled, and valid users can sign in after successful attempts.
- These controls are IP-based application limits, not a substitute for a full security audit or edge/WAF protection. Production remains unchanged and must not be merged/deployed without separate approval.


## 18. Rider commission and wallet integrity review — 25 November 2026

### Code review findings on the testing branch
- Commission rate is defined as 500 pesewas (GH₵5.00) per package.
- The acceptance endpoint calculates the fee from the pickup's total package count, checks the rider's wallet balance, locks the assignment and wallet rows, changes the assignment to accepted, deducts the fee, and records a commission transaction within one database transaction. If a step fails, the transaction is rolled back.
- The database schema defines a partial unique index allowing only one successful commission transaction per assignment. This provides an additional duplicate-deduction safeguard.
- Wallet deposit totals include only successful deposit transactions; commission totals include only successful commission transactions. Deposits and commission are reported separately.
- Commission reports filter by Ghana local date (Africa/Accra), include successful negative commission entries only, and show rider, package count, reference and Ghana time.

### Existing owner-observed test evidence
- Owner previously reported a 24 November 2026 commission report showing GH₵10.00 deducted for two packages, with a commission reference. This is consistent with the GH₵5-per-package rule.
- Owner reported that daily report dates reset at midnight Ghana time while previous dated commission receipts remained available.

### Remaining testing before production
- Confirm the unique index one_commission_per_assignment exists in the testing database; if not, apply the idempotent index statement from schema.sql to the testing database only.
- On testing data only, verify one-package acceptance deducts GH₵5, two-package acceptance deducts GH₵10, insufficient balance blocks acceptance, a repeated acceptance attempt does not deduct again, and a deposit changes the wallet balance without appearing as commission revenue.
- Verify CSV export matches the selected Ghana-time report date and entries.
- Do not run acceptance tests using real customer deliveries or real funds. Production remains unchanged.

## 19. Open pickup offers, live availability and rider distance — 25 November 2026

### Official owner-approved behaviour
- Every active/approved rider may see and attempt to accept every available pickup, regardless of the rider's current location. Distance must never be an eligibility restriction.
- Each available pickup should show the rider the distance from their current location and an estimated travel duration, preferably based on a road route rather than straight-line distance.
- If either location is unavailable or routing cannot produce a reliable estimate, show a clear unavailable message; never invent a distance or travel time.
- Nearby pickups should receive stronger visual prominence, be sorted ahead of farther pickups where a reliable route estimate exists, and support a stronger/immediate notification to the rider where notification permission is granted. A nearby label/threshold must be explicit and configurable.
- Riders farther away must continue to see and accept the same offer.
- After one rider successfully accepts a pickup, it must disappear from every other rider's available list and remain in the successful rider's accepted assignments.
- The backend/database must allow only one rider to win, including simultaneous attempts. Losing riders receive a clear “already accepted” response. Only the winning rider is charged the commission.
- Rider available-offer lists should refresh automatically so accepted offers disappear without requiring a manual refresh.

### Existing code review — testing branch
- The rider assignments API currently returns all assignments with status 'available' to every authenticated rider, without a location restriction. It also returns that rider's own accepted/completed assignments.
- The acceptance endpoint already locks the assignment row, checks that it remains 'available', and commits the assignment claim and commission deduction in one database transaction. This is a strong existing safeguard against simultaneous acceptance.
- The current rider page refreshes the assignments only when manually refreshed or after an acceptance; there is no automatic refresh/push update.
- Pickup records currently have no latitude/longitude fields. Vendor account location is text only, and the rider page does not currently request or submit the rider's live coordinates. Therefore distance and travel duration cannot yet be calculated reliably.
- Existing acceptance and commission tests do not test two different riders attempting the same offer simultaneously or verify that the losing rider's screen refreshes automatically.

### Implementation and verification still required
- Add optional, consent-based pickup coordinates captured at the vendor's pickup location and rider current-location capture; retain offer visibility if either party declines location sharing.
- Add a road-routing integration for distance and travel duration, with safe timeouts, sensible request limits and a clear unavailable fallback. Do not use fabricated straight-line values as road-route estimates.
- Display distance and estimated duration together on available pickup cards.
- Prioritise nearby offers visually and in ordering without excluding distant riders; provide optional browser notifications subject to rider permission.
- Automatically refresh offers and confirm a claimed offer disappears for other riders.
- Test with at least two approved test riders: both see the same available offer; one accepts; the other sees it disappear; a stale/simultaneous second acceptance is rejected; exactly one assignment and one commission transaction remain.
- Keep all changes on the testing branch and testing database. Do not merge or deploy to production without separate approval.

## 20. Implementation progress — open pickup offers and rider distance/ETA — 25 November 2026

### Added to the testing branch
- Added nullable pickup latitude/longitude fields to the pickup schema, including idempotent ALTER TABLE ... ADD COLUMN IF NOT EXISTS migration statements.
- Vendor pickup submission now attempts to capture the browser's current coordinates at the pickup point when the vendor grants location permission. If location is unavailable/declined, the pickup request still submits and remains visible to riders.
- The rider assignments API continues returning every available pickup to every authenticated rider, regardless of rider location. It accepts optional rider latitude/longitude and, when both rider and pickup coordinates are present, requests road distance and duration from a configurable OSRM-compatible routing service.
- Routing failures, missing coordinates or unavailable estimates produce null distance/time values; offers are not hidden and the interface displays an unavailable message instead of fabricating an estimate.
- Available offers are sorted by road distance where estimates exist. Offers within 5 km receive a “Nearby to you” label; this affects prominence only and never eligibility.
- Rider Portal now includes an explicit “Share / update my location” control and an optional browser-notification permission control for newly available nearby pickups.
- Rider offer lists now refresh every five seconds while the Rider Portal is open. The polling refreshes assignment data without repeatedly reloading wallet transaction history.
- Acceptance conflict responses now distinguish an offer already accepted by the same rider from one accepted by another rider. Existing row locking and transactional commission deduction remain in place.
- Added ROUTING_SERVICE_URL to .env.example. The public OSRM demo endpoint is only a development/testing default; a reliable provider with appropriate terms and capacity must be selected before production.
- JavaScript syntax parsing passed for server.js and the script in index.html after these changes.

### Not yet tested / required next
- Apply the two pickup-coordinate migration statements to the Neon testing database only before using the updated backend:
  - ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS pickup_latitude DOUBLE PRECISION;
  - ALTER TABLE public.pickups ADD COLUMN IF NOT EXISTS pickup_longitude DOUBLE PRECISION;
- Confirm Render's testing deployment is Live after the branch commits.
- Create a new test pickup while the vendor browser is physically at the pickup point and grants location permission; verify the two coordinate columns are populated without exposing the coordinates to other users.
- Sign in as at least two approved test riders on separate browsers/devices. Confirm both see the same available offer regardless of distance, and confirm each sees its own road distance and estimated driving duration when routing data is available.
- Confirm a nearby rider sees the “Nearby to you” label and receives an optional browser notification after granting permission; confirm a distant rider still sees and can accept the offer.
- Confirm the offer disappears from the other rider's list within the automatic refresh interval after acceptance. Test a stale/simultaneous second acceptance and verify it returns a conflict without changing the winner or deducting commission again.
- Test denied location permission, missing pickup coordinates, and routing-service timeout; offers must remain visible with a clear unavailable estimate.
- Browser notifications currently require the Rider Portal to remain open and permission to be granted; this is not a background push-notification service.
- Do not use the public OSRM demo endpoint as a production routing dependency. Production routing provider, limits, privacy terms and operating cost require review.
- Keep production branch/database unchanged; do not merge or launch without separate approval.

## Visual design direction and delivery standard — 27 November 2026

The approved visual direction is a unified, premium Kawutey Logistics experience across the public website, Vendor Portal, Rider Portal, and Administrator Portal. Use the navy, white, and orange brand palette consistently. The public experience should communicate trust, clarity, and easy access to delivery services. Authenticated workspaces should prioritize operational information, readable status, financial clarity, and efficient task completion.

### Responsive design requirements
- Treat desktop and mobile as first-class layouts for every portal; do not merely shrink desktop screens.
- Use clear visual hierarchy, consistent spacing, readable typography, accessible focus states, touch-friendly controls, responsive cards, and mobile-safe tables.
- Preserve existing portal workflows, authentication, permissions, business rules, and financial behavior while changing presentation.
- Keep Vendor and Rider operational workspaces easy to scan, with pickup/assignment states, wallet information, transaction history, profile details, and Rider Connect legible and usable on small screens.
- Keep administrator navigation, review queues, notifications, wallet reconciliation, commission reporting, and operational controls organized without hiding critical information.
- Do not introduce fake metrics, sample transactions, or misleading status indicators as decoration.
- Commit visual work only to `setup/secure-backend-prep`. Do not modify `main` or `production-release`, and do not promote or merge without explicit user approval.
- Keep the approved Preview, Testing, and Kawutey Logistics Render services integrated with the development branch. Public access links remain restricted to the approved Public Portal and Administrator Portal links.


### Portal dashboard component standards — 27 November 2026
- Vendor dashboard: prioritize the welcome/business identity, clear pickup action, a legible pickup request form and scan-friendly pickup history. Package counts and optional pickup location controls must remain usable on small screens.
- Rider dashboard: give wallet balance and its four existing financial/eligibility measures a clear hierarchy; keep deposit, transaction history and refund actions accessible; visually separate available assignments, accepted work and Rider Connect.
- Collapsible dashboard sections must keep their existing accessible expanded state and keyboard-operable controls. Responsive styling must not change which sections are open by default or alter any data/action behavior.
- Registration and sign-in forms should use responsive field grids on desktop and a single column on mobile. Ghana Card information and profile photographs remain subject to existing privacy and access restrictions.
- Visual-only changes must not change the GH₵5 commission, wallet accounting, refund authorization, pickup deletion restrictions, rider approval, or assignment acceptance logic.


### Responsive experience finish and accessibility pass — 27 November 2026
- Added a coordinated final presentation layer across the public website, Administrator workspace, and secure Administrator entry page. This supplements the existing Vendor/Rider operational styling without replacing application markup or workflow logic.
- Public navigation remains horizontally accessible on small screens; the homepage hero and calls to action reflow into a single-column mobile composition. Public content sections, forms, and portal workspaces receive consistent scroll positioning and narrow-screen overflow safeguards.
- Administrator review sections, finance tables, action groups, and form controls receive additional responsive sizing, keyboard focus visibility, and readable dense-data treatment. Wide financial tables remain horizontally scrollable rather than compressing or hiding columns.
- Administrator sign-in and registration receive additional narrow-device safeguards, accessible focus treatment, and more resilient feedback wrapping.
- Reduced-motion preferences are respected in the new presentation layers.
- These changes are CSS-only. They do not alter authentication, authorization, API calls, wallet calculations, GH₵5 acceptance commission, refunds, pickup deletion restrictions, rider approval, assignment acceptance, or financial records.
- Continue to verify each page at desktop, tablet, and narrow mobile widths in a real browser. Source-level CSS changes are not a substitute for visual QA or functional regression testing.


### Mobile app-style navigation and public contact consistency — 27 November 2026
- Added a fixed, safe-area-aware mobile bottom navigation bar for Home, Vendor, Rider, and Contact/Help. It reuses the existing section-switching behavior and active-state updates; it does not introduce a second navigation state or alter portal access.
- The mobile bar is limited to narrow screens, keeps touch targets readable, respects reduced-motion preferences, and reserves page-bottom space so it does not cover portal content or controls.
- Corrected the legacy footer's outdated contact number so all public contact placements consistently use the approved business numbers: 024 226 7974 and 059 111 4638.
- This is a front-end presentation/contact consistency update only; no authentication, payment, wallet, assignment, or refund logic was changed.


### Administrator command-centre responsive completion — 27 November 2026
- Added a coordinated desktop/mobile presentation pass for the administrator login, command-centre hero, quick navigation, section search, commission reporting, notification controls, review panels and dense financial tables.
- Mobile quick navigation remains horizontally scrollable and sticky beneath the header. Search and logout controls reflow to full-width rows on very narrow screens; commission report controls and summary metrics adapt to small viewports.
- Dense tables preserve all columns and use horizontal scrolling instead of hiding financial or operational information. Keyboard focus states and reduced-motion preferences are supported.
- Improved secure administrator entry form spacing, touch sizing, focus visibility and narrow-screen resilience.
- CSS-only presentation update. No administrator authorization, session, API, payment, wallet, refund, commission, rider approval, or vendor/rider account logic has been changed.
- Visual QA still requires actual browser/device inspection; source-level checks alone do not establish rendered appearance.


### Vendor and Rider workspace hierarchy pass — 27 November 2026
- Added a substantial responsive presentation pass for authenticated Vendor and Rider workspaces, including pickup request entry, package quantity fields, pickup history, rider status header, wallet metrics, deposits, transaction history, available and accepted assignments, rider directory and messaging.
- Vendor pickup fields now use clearer grouped layouts that progressively collapse from three columns to two and then one on narrow phones. Pickup history has a calm empty-state treatment without changing its data source.
- Rider wallet metrics use a four-to-two-column responsive layout, with the wallet action controls reflowing for small screens. Assignment, transaction, rider-directory and communication surfaces receive consistent card treatment and overflow protection.
- The rider profile/status header and vendor dashboard welcome area receive clearer visual hierarchy. All dynamic data continues to come from the existing application logic.
- CSS-only changes. No pickup deletion rules, assignment acceptance rules, rider identity checks, wallet balance calculations, GH₵5 commission, deposit processing, refunds, or messaging APIs were changed.
- Actual rendered browser/device QA and financial/workflow regression testing remain required before release promotion.


### Public information and support page design pass — 27 November 2026
- Completed a responsive presentation pass across About, How It Works, Contact, Vendor Support and Rider Support pages.
- Introduced a consistent editorial hero, reading hierarchy, step cards, contact cards, calls to action and responsive footer layout.
- Contact actions continue to use the established business phone numbers, email and social accounts. No new contact details or claims were introduced.
- Mobile layouts progressively collapse to one column and retain full contact details without clipping; reduced-motion preferences are respected.
- CSS-only update. Existing portal navigation, registration, authentication, contact destinations and business logic remain unchanged.
- Rendered visual QA on physical devices and workflow regression tests remain outstanding.


### Administrator finance, review and operational workspace finish — 27 November 2026
- Added a cohesive presentation system for dynamically grouped administrator sections, with clear disclosure controls, readable headings, consistent card surfaces and visible keyboard focus.
- Refined commission summaries and Ghana-time report controls, notification filtering and review actions, payment-mode settings and audit history, wallet reconciliation output, wallet transaction review, deposit review, rider management, rider approval and cancellation queues.
- Dense dynamic result areas now have consistent spacing, overflow handling and image constraints. The payment settings form adapts to phone widths without hiding its controls.
- Presentation-only CSS. Existing admin authentication, permission checks, refund eligibility and duplicate protection, commission calculations, wallet reconciliation, deposit verification, rider approval and account status APIs are unchanged.
- Source-level implementation only; visual appearance and interaction still require browser testing at desktop and phone breakpoints before release promotion.
