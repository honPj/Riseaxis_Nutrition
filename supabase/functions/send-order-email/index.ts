// supabase/functions/send-order-email/index.ts
// @ts-ignore Deno resolves URL imports; configure the editor with Deno support.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Deno is provided by the Supabase Edge Functions runtime, but may not be
// present in the editor's TypeScript type environment.
declare const Deno: { env: { get(name: string): string | undefined } };

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Rise Axis <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("REPLY_TO") ?? "contact@riseaxissolutions.com";

interface OrderRecord {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  updated_at: string;
}

interface WebhookPayload {
  type: string;
  table: string;
  record: OrderRecord;
  old_record: OrderRecord | null;
  schema: string;
}

const STATUS_CONFIG: Record<string, { label: string; emoji: string; color: string; message: string }> = {
  pending:    { label: "Order Received",    emoji: "📋", color: "#F59E0B", message: "We've received your order and will start processing it soon." },
  processing: { label: "Being Processed",   emoji: "⚙️", color: "#1e53b4", message: "Good news — we're preparing your order for dispatch." },
  shipped:    { label: "On The Way",        emoji: "🚚", color: "#6366F1", message: "Your order has been shipped and is on its way to you." },
  delivered:  { label: "Delivered",         emoji: "✅", color: "#0E7A3C", message: "Your order has been delivered. Thank you for shopping with us!" },
  cancelled:  { label: "Cancelled",         emoji: "❌", color: "#C8102E", message: "Your order has been cancelled. Contact us if this is unexpected." }
};

const PAYMENT_CONFIG: Record<string, { label: string; color: string }> = {
  pending:  { label: "Payment Pending",   color: "#F59E0B" },
  paid:     { label: "Payment Confirmed", color: "#0E7A3C" },
  failed:   { label: "Payment Failed",    color: "#C8102E" },
  refunded: { label: "Payment Refunded",  color: "#7C3AED" }
};

function fmtKES(n: number) {
  return "KES " + Number(n || 0).toLocaleString("en-KE");
}

function buildEmail(order: OrderRecord) {
  const status = STATUS_CONFIG[order.order_status] ?? STATUS_CONFIG.pending;
  const payment = PAYMENT_CONFIG[order.payment_status] ?? PAYMENT_CONFIG.pending;
  const firstName = (order.customer_name || "there").split(" ")[0];
  const trackingUrl = "https://riseaxissolutions.com/pages/account.html";
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1729;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(31,58,110,0.08);">

<tr><td style="background:linear-gradient(135deg,#12326e 0%,#1e53b4 55%,#C8102E 160%);padding:36px 40px;text-align:center;">
  <div style="color:#fff;font-size:1.6rem;font-weight:900;letter-spacing:1px;margin-bottom:6px;">
    <span style="color:#fff;">RISE</span><span style="color:#E85D26;">AXIS</span>
  </div>
  <div style="color:rgba(255,255,255,0.75);font-size:0.7rem;letter-spacing:3px;font-weight:700;">SOLUTIONS LTD</div>
</td></tr>

<tr><td style="padding:40px 40px 20px;text-align:center;background:#fff;">
  <div style="font-size:3rem;line-height:1;margin-bottom:14px;">${status.emoji}</div>
  <div style="display:inline-block;background:${status.color}15;color:${status.color};padding:6px 16px;border-radius:30px;font-size:0.72rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px;">${status.label}</div>
  <h1 style="font-size:1.6rem;font-weight:900;color:#12326e;margin:0 0 10px;letter-spacing:-0.5px;">Hi ${firstName}, your order has an update</h1>
  <p style="color:#4a5568;font-size:0.95rem;margin:0;line-height:1.6;">${status.message}</p>
</td></tr>

<tr><td style="padding:10px 40px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border-radius:14px;border:1px solid #e2e8f0;">
    <tr><td style="padding:20px 24px;text-align:center;">
      <div style="font-size:0.7rem;font-weight:800;color:#4a5568;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">Order Number</div>
      <div style="font-size:1.3rem;font-weight:900;color:#1e53b4;letter-spacing:1px;font-family:'Courier New',monospace;">${order.order_number}</div>
    </td></tr>
  </table>
</td></tr>

<tr><td style="padding:0 40px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="48%" style="padding-right:8px;"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;">
      <div style="font-size:0.65rem;font-weight:800;color:#4a5568;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">Order Status</div>
      <div style="font-size:0.95rem;font-weight:900;color:${status.color};">${status.label}</div>
    </div></td>
    <td width="48%" style="padding-left:8px;"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;">
      <div style="font-size:0.65rem;font-weight:800;color:#4a5568;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">Payment</div>
      <div style="font-size:0.95rem;font-weight:900;color:${payment.color};">${payment.label}</div>
    </div></td>
  </tr></table>
</td></tr>

<tr><td style="padding:0 40px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#f7fafd,#eef4fb);border-radius:14px;border:1px solid rgba(30,83,180,0.1);">
    <tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:0.85rem;color:#4a5568;padding:4px 0;">Subtotal</td><td align="right" style="font-size:0.85rem;color:#1e53b4;font-weight:700;padding:4px 0;">${fmtKES(order.subtotal)}</td></tr>
        <tr><td style="font-size:0.85rem;color:#4a5568;padding:4px 0;">Delivery</td><td align="right" style="font-size:0.85rem;color:#1e53b4;font-weight:700;padding:4px 0;">${fmtKES(order.delivery_fee)}</td></tr>
        <tr><td style="padding-top:12px;border-top:2px dashed rgba(30,83,180,0.2);font-size:1rem;color:#12326e;font-weight:900;">Total</td><td align="right" style="padding-top:12px;border-top:2px dashed rgba(30,83,180,0.2);font-size:1.15rem;color:#C8102E;font-weight:900;">${fmtKES(order.total)}</td></tr>
      </table>
    </td></tr>
  </table>
</td></tr>

<tr><td style="padding:0 40px 30px;text-align:center;">
  <a href="${trackingUrl}" style="display:inline-block;background:#1e53b4;color:#fff;text-decoration:none;padding:14px 36px;border-radius:120px;font-weight:800;font-size:0.92rem;letter-spacing:0.5px;">Track Your Order →</a>
</td></tr>

<tr><td style="padding:0 40px 30px;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;">
    <div style="font-size:0.7rem;font-weight:800;color:#4a5568;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:10px;">📍 Delivery Address</div>
    <div style="font-size:0.9rem;color:#1e53b4;font-weight:600;line-height:1.55;">${order.customer_name}<br>${order.delivery_address}<br>${order.customer_phone}</div>
  </div>
</td></tr>

<tr><td style="background:#12326e;padding:28px 40px;text-align:center;">
  <div style="color:#fff;font-size:0.9rem;font-weight:700;margin-bottom:6px;">Need help?</div>
  <div style="color:rgba(255,255,255,0.75);font-size:0.82rem;line-height:1.6;margin-bottom:16px;">Reply to this email or WhatsApp us at <a href="https://wa.me/254725538297" style="color:#E85D26;text-decoration:none;font-weight:700;">+254 725 538 297</a></div>
  <div style="color:rgba(255,255,255,0.5);font-size:0.72rem;">© ${year} Rise Axis Solutions Ltd · Nairobi, Kenya</div>
</td></tr>

</table></td></tr></table></body></html>`;

  const text = `Hi ${firstName},\n\nYour order ${order.order_number} has been updated.\n\nStatus: ${status.label}\nPayment: ${payment.label}\nTotal: ${fmtKES(order.total)}\n\n${status.message}\n\nTrack your order: ${trackingUrl}\n\n— Rise Axis Solutions Ltd`;

  return { html, text, subject: `${status.emoji} Order ${order.order_number} · ${status.label}` };
}

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const payload: WebhookPayload = await req.json();

    if (payload.table !== "orders" || payload.type !== "UPDATE") {
      return new Response(JSON.stringify({ skipped: true, reason: "not order update" }), { headers: { "Content-Type": "application/json" } });
    }

    const { record, old_record } = payload;

    if (old_record && old_record.order_status === record.order_status && old_record.payment_status === record.payment_status) {
      return new Response(JSON.stringify({ skipped: true, reason: "no status change" }), { headers: { "Content-Type": "application/json" } });
    }

    if (!record.customer_email) {
      return new Response(JSON.stringify({ skipped: true, reason: "no email" }), { headers: { "Content-Type": "application/json" } });
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const { html, text, subject } = buildEmail(record);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [record.customer_email], reply_to: REPLY_TO, subject, html, text })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(JSON.stringify({ error: "send failed", details: data }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    console.log("Email sent:", data.id, "to", record.customer_email);
    return new Response(JSON.stringify({ success: true, id: data.id }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error("error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});