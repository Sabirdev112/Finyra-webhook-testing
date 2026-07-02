# Finyra B2B webhook test receiver

Small local server that receives **outgoing** Finyra partner webhooks, verifies the signature, logs the payload, and returns `200`.

## Setup

1. Copy env file and paste your signing secret from the partner dashboard:

```powershell
cd C:\projects\finyra-webhook-test
copy .env.example .env
# Edit .env and set WEBHOOK_SECRET=whsec_...
```

2. Start the server:

```powershell
npm start
```

Default URL to register in Finyra:

```text
http://localhost:3456/webhooks/finyra
```

Backend must run with `APP_ENV=development` so `http://localhost` URLs are allowed.

## UI test flow

1. Finyra backend: `npm run dev` (port 8080)
2. Finyra web: `npm run dev` (port 5173)
3. This server: `npm start`
4. Partner dashboard → **Webhooks** → add endpoint URL above
5. Click **Send test**
6. Watch this terminal for logs
7. Partner dashboard → **Recent deliveries** should show `succeeded` / `200`

## Health check

```powershell
curl http://localhost:3456/health
```

## Trigger test via Finyra API (curl)

Use this if you want to trigger delivery without clicking **Send test**. You need:

- Partner session cookie (`finyra_partner_access_token`) from browser after partner login
- Endpoint id from dashboard or `GET /api/v1/b2b/webhooks/endpoints`

```powershell
$base = "http://localhost:8080/api/v1"
$endpointId = "YOUR_ENDPOINT_ID"
$cookie = "finyra_partner_access_token=YOUR_TOKEN"

curl.exe -X POST "$base/v1/b2b/webhooks/endpoints/$endpointId/test" `
  -H "Cookie: $cookie" `
  -H "Content-Type: application/json"
```

List endpoints:

```powershell
curl.exe "$base/v1/b2b/webhooks/endpoints" -H "Cookie: $cookie"
```

List delivery logs:

```powershell
curl.exe "$base/v1/b2b/webhooks/deliveries" -H "Cookie: $cookie"
```

## What gets logged

Each delivery prints:

- `Finyra-Webhook-Id`
- `Finyra-Webhook-Timestamp`
- Signature verification result
- Parsed JSON body (`type`, `id`, `data`, etc.)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Finyra cannot create localhost URL | Set backend `APP_ENV=development` |
| Signature mismatch | Use exact `whsec_...` from endpoint create; do not trim |
| Connection refused | Start this server before **Send test** |
| 401 from this server | Wrong secret or body modified before verify |
