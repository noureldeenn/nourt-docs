/**
 * Nourt theme — support contact form handler (Cloudflare Worker).
 *
 * Receives the POST from support-contact-form.html, emails the submission to the
 * theme author, and sends the submitter an AUTO-RESPONDER confirmation (required
 * by the Shopify Theme Store). Email is sent via the Brevo (Sendinblue) API, which
 * allows a single verified sender + sending to any recipient on its free tier
 * (300 emails/day) — no domain ownership needed.
 *
 * Secrets / vars (set via wrangler — see worker/README.md):
 *   BREVO_API_KEY   (secret)  Brevo v3 API key
 *   SUPPORT_EMAIL   (var)     where submissions are delivered (e.g. nourbadr4646@gmail.com)
 *   SENDER_EMAIL    (var)     the Brevo-verified sender address
 *   SENDER_NAME     (var)     e.g. "Nourt Theme Support"
 *   THANK_YOU_URL   (var)     redirect target after a successful submit
 *   ALLOWED_ORIGIN  (var)     the docs site origin (e.g. https://noureldeenn.github.io)
 */

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 MB cap

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function bufToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function sendBrevo(env, payload) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
  return res.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method === "GET") return new Response("Nourt support form handler — POST only.", { status: 200 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

    let form;
    try {
      form = await request.formData();
    } catch {
      return new Response("Bad request", { status: 400, headers: cors });
    }

    // Honeypot: bots fill hidden fields. Pretend success, send nothing.
    if ((form.get("_honey") || "").toString().trim() !== "") {
      return Response.redirect(env.THANK_YOU_URL, 303);
    }

    const name = (form.get("name") || "").toString().trim();
    const email = (form.get("email") || "").toString().trim();
    const storeUrl = (form.get("store_url") || "").toString().trim();
    const subject = (form.get("subject") || "").toString().trim();
    const description = (form.get("description") || "").toString().trim();

    if (!name || !email || !storeUrl || !subject || !description) {
      return new Response("Please fill in all required fields.", { status: 422, headers: cors });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return new Response("Please provide a valid email address.", { status: 422, headers: cors });
    }

    // Optional screenshot -> Brevo attachment (author email only).
    const attachments = [];
    const file = form.get("attachment");
    if (file && typeof file === "object" && file.size > 0 && file.size <= MAX_ATTACHMENT_BYTES) {
      attachments.push({ name: file.name || "attachment", content: bufToBase64(await file.arrayBuffer()) });
    }

    const sender = { email: env.SENDER_EMAIL, name: env.SENDER_NAME || "Nourt Theme Support" };
    const rows = [
      ["Name", name],
      ["Email", email],
      ["Store URL", storeUrl],
      ["Subject", subject],
      ["Description", description],
    ]
      .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:600">${esc(k)}</td><td style="padding:6px 12px">${esc(v)}</td></tr>`)
      .join("");

    try {
      // 1) Notify the author (reply-to the submitter for easy responses).
      await sendBrevo(env, {
        sender,
        to: [{ email: env.SUPPORT_EMAIL }],
        replyTo: { email, name },
        subject: `Nourt support: ${subject}`,
        htmlContent: `<h2>New support request</h2><table style="border-collapse:collapse">${rows}</table>`,
        ...(attachments.length ? { attachment: attachments } : {}),
      });

      // 2) Auto-responder confirmation to the submitter.
      await sendBrevo(env, {
        sender,
        to: [{ email, name }],
        subject: "We received your Nourt support request",
        htmlContent:
          `<p>Hi ${esc(name)},</p>` +
          `<p>Thanks for contacting Nourt theme support — we've received your request and will reply within two business days.</p>` +
          `<p style="color:#6b7280">This is an automated confirmation; there's no need to reply to it.</p>` +
          `<p>— Nourt Theme Support</p>`,
      });
    } catch (err) {
      // Logged to `wrangler tail` / dashboard logs. Append ?debug=1 to the POST
      // URL to see the exact provider error in the response body while setting up.
      console.error("[nourt-support] send failed:", err && err.message);
      const debug = url.searchParams.get("debug") === "1";
      return new Response(
        debug
          ? `send failed: ${err && err.message}`
          : "We couldn't send your message right now. Please try again shortly.",
        { status: 502, headers: cors }
      );
    }

    // Normal full-page form submit -> redirect to the thank-you page.
    return Response.redirect(env.THANK_YOU_URL, 303);
  },
};
