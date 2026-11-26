# Rider Ghana Card verification — implementation requirement

Status: planned; not yet connected to an authoritative identity-verification service.

## Objective
Prevent a rider account from being approved solely because an applicant typed a plausible-looking Ghana Card number. A number-format check is not proof that a card or identity is genuine.

## Required onboarding behaviour
1. Validate the submitted identifier's expected format server-side. Treat this only as a syntax check.
2. Detect duplicate identifiers using a protected, server-side uniqueness mechanism. Do not expose another rider's identity or account details when a duplicate is found.
3. Verify identity through the National Identification Authority (NIA) or a provider demonstrably authorised to perform Ghana Card verification, subject to documented access, lawful basis, applicant notice/consent where required, and the provider's contractual terms.
4. Compare the returned identity attributes with the applicant's submitted details. A mismatch, inconclusive response, or failed verification must not result in automatic approval.
5. If the verification provider is unavailable, times out, or returns an uncertain result, keep the application in a pending/manual-review state. Fail closed for rider activation and assignment eligibility.
6. Only an authoritative successful result may set a verified status. Record provider reference, verification timestamp, outcome, and reviewer/audit metadata; never store provider secrets in source code.
7. Restrict access to Ghana Card data to authorised roles. Encrypt sensitive data in transit and at rest, avoid logging full identifiers or document images, mask identifiers in admin views, define retention/deletion rules, and audit access.
8. Do not treat an uploaded image, OCR result, card layout, or format-valid number as authoritative proof. These may support review but cannot independently confirm authenticity.

## Acceptance tests
- Malformed identifier is rejected server-side.
- A repeated identifier is safely flagged without disclosing the existing account.
- A format-valid but unverified/fake identifier cannot pass as verified.
- A provider-confirmed mismatch is flagged and cannot activate the rider.
- Provider outage, timeout, or inconclusive response leaves the rider pending and ineligible for assignments.
- Only a confirmed authoritative success can transition the rider to verified.
- Admin cannot manually mark a rider as officially verified without an auditable, authorised override process.
- Full Ghana Card numbers and verification secrets never appear in client logs, application logs, analytics, or ordinary admin lists.
- Existing rider records are not silently marked verified during migration.

## External dependency / release gate
Before implementation, establish an authorised NIA integration or select a provider whose Ghana Card verification authority and data-protection terms have been independently confirmed. Obtain credentials through protected environment variables/secret management. Do not invent an NIA API endpoint or simulate successful verification.

Until this dependency is available and tested, the UI and backend must describe the status honestly (for example, “identity check pending” or “manual review”), not “Ghana Card verified”.
