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

