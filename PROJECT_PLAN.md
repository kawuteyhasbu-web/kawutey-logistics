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
