# Lyyve Security Runbook

This file is the practical baseline for safe account signup operations.

## Daily / Before release

- Run `npm run build` and fix build errors before deploy.
- Verify signup, email verification, login, logout, and password reset manually.
- Confirm no service role key is exposed in frontend code or `.env` examples.

## Weekly checks (5-10 minutes)

- Supabase:
  - Confirm project remains on intended plan (Free unless explicitly upgraded).
  - Check Auth spikes (unexpected signup/login bursts).
  - Check DB and storage usage against internal thresholds.
- Resend:
  - Check sending volume and bounce/spam trends.
  - Confirm domain DNS status (SPF/DKIM/DMARC still valid).
- Domain:
  - Confirm renewal date and auto-renew setting in Porkbun.

## Incident procedure (auth abuse, suspected leak, or compromise)

1. Contain:
   - Disable new signups temporarily (Supabase Auth settings).
   - Rotate impacted keys immediately (Supabase and Resend).
2. Assess:
   - Identify impacted systems, tables, and user scope.
   - Review recent auth logs and suspicious IP / burst behavior.
3. Recover:
   - Re-enable signups only after credentials/policies are validated.
   - Force session reset where needed (sign out all sessions if required).
4. Communicate:
   - Notify affected users when required.
   - Log timeline, impact, and remediation for postmortem.

## Data minimization rules

- Store only data needed for app functionality.
- Do not log passwords, token strings, or secret keys.
- Prefer bucket/file storage for photos over DB base64 blobs as migration target.

## Current security posture (quick view)

- Supabase Auth enabled (email + OAuth).
- Frontend uses publishable key only.
- RLS policies enforce owner-only writes for sensitive tables.
- Signup verification flow is active.
