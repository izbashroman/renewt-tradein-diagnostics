# Re-Newt Trade-In - Diagnostika ustroystva

Static frontend + serverless proxy to M360 Customer API v2 (getHistory) by IMEI.
The M360 Bearer token never reaches the browser - it lives only in the serverless function's environment variables.

## Deploy to Vercel

1. Import this repo on vercel.com -> Add New -> Project
2. In Settings -> Environment Variables add:
   - M360_AUTH_CODE
   - M360_AUTH_TOKEN
   (values from your M360 Client Manager, auth format: Bearer authCode-authToken)
3. Deploy. index.html is served statically, api/diagnostics-status.js runs as a serverless function on the same domain.

## Files

- index.html - frontend (IMEI input, QR, test checklist, result screen)
- api/diagnostics-status.js - proxy to M360 getHistory
