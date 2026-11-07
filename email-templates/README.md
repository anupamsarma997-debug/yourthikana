# Yourthikana password-reset email (implementation draft)

The branded HTML template is in `email-templates/password-reset.html`.

## Current state

- The app still calls Firebase Client SDK `sendPasswordResetEmail()`.
- Firebase's built-in email is still the active sender. This HTML file is **not connected** to Firebase Auth and does not change emails users receive.
- The HTML is a design draft for a future trusted email sender. It uses placeholders: `{{RESET_URL}}`, `{{REPORT_URL}}`, and `{{YEAR}}`.
- No report endpoint exists yet. Do not point `{{REPORT_URL}}` at a guessed URL.

## Required before enabling

1. Choose and verify an email-sending provider/domain (for example, a verified sender with Resend or SMTP).
2. Configure Firebase Admin SDK on the server using a server-only service account credential. Never put admin credentials or provider API keys in `VITE_*` variables or browser code.
3. Replace the client-side reset request with a server endpoint that validates the email input and creates the Firebase password-reset link using Admin SDK.
4. Send the email from the verified sender, replacing the template placeholders with safely encoded URLs.
5. Implement a signed, expiring, one-use report token bound to the reset event. The report endpoint must validate it, rate-limit requests, prevent duplicate reports, and store reports durably before notifying the configured recipient.
6. Add automated tests for invalid tokens, expired tokens, repeated reports, rate limits, and reset-link generation.

## Report destination

The requested notification recipient is `jarusharma381@gmail.com`. This is a recipient address only; it is not a verified sender address.

## Safety

Do not deploy a fake report link, mailto-only flow, in-memory-only report storage, or a reset flow that claims success without verified email delivery. Until the backend and provider are configured, keep Firebase's existing reset flow unchanged.
