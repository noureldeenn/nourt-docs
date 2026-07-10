# Nourt support form — Cloudflare Worker

Free, reliable backend for `support-contact-form.html`. It emails each submission
to you **and** sends the submitter an auto-responder confirmation (required by the
Shopify Theme Store). Email is sent through **Brevo** (free: 300 emails/day, single
verified sender, no domain needed).

## One-time setup (~10 min)

### 1. Brevo (email sending)
1. Create a free account at **brevo.com**.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: add
   `nourbadr4646@gmail.com` and click the verification link Brevo emails you.
3. **SMTP & API → API Keys → Generate a new API key**. Copy it (starts with `xkeysib-`).

### 2. Cloudflare (hosting the Worker)
1. Create a free account at **cloudflare.com** / **dash.cloudflare.com**.
2. From this `worker/` folder:
   ```bash
   npm install
   npx wrangler login          # opens a browser to authorize (one time)
   npx wrangler secret put BREVO_API_KEY   # paste the Brevo key when prompted
   npx wrangler deploy
   ```
3. Deploy prints your Worker URL, e.g.
   `https://nourt-support.<your-subdomain>.workers.dev`

### 3. Wire the form
Set the `action` of `support-contact-form.html` to that Worker URL and redeploy the
docs (GitHub Pages). *(If you paste me the Worker URL, I'll do this step for you.)*

## Config
Non-secret values live in `wrangler.toml` (`SUPPORT_EMAIL`, `SENDER_EMAIL`,
`SENDER_NAME`, `THANK_YOU_URL`, `ALLOWED_ORIGIN`). Only `BREVO_API_KEY` is a secret.

## Test
```bash
curl -i -X POST https://nourt-support.<subdomain>.workers.dev \
  -F name="Test" -F email="you@example.com" \
  -F store_url="https://x.myshopify.com" -F subject="Test" -F description="Hello"
```
You should get a `303` redirect to the thank-you page, an email in your inbox, and a
confirmation email at the submitter address.

## Alternatives
The sender in `src/index.js` is Brevo's API. To swap providers (e.g. SendGrid single
sender), replace `sendBrevo()` with that provider's send call — the rest is unchanged.
