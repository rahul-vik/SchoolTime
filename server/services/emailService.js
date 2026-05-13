import nodemailer from "nodemailer";
import { ENV } from "../config/env.js";

function isSmtpConfigured() {
  return Boolean(ENV.SMTP_HOST && ENV.SMTP_USER && ENV.SMTP_PASS && ENV.SMTP_FROM);
}

let transporter = null;

function buildTransportOptions() {
  const opts = {
    host: ENV.SMTP_HOST,
    port: ENV.SMTP_PORT,
    secure: ENV.SMTP_SECURE,
    auth: { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS },
    connectionTimeout: ENV.SMTP_CONNECTION_TIMEOUT_MS,
    socketTimeout: ENV.SMTP_SOCKET_TIMEOUT_MS,
  };
  if (ENV.SMTP_FORCE_IPV4) opts.family = 4;
  if (ENV.SMTP_REQUIRE_TLS_MODE === "on") opts.requireTLS = true;
  else if (ENV.SMTP_REQUIRE_TLS_MODE === "auto" && ENV.SMTP_PORT === 587 && !ENV.SMTP_SECURE) opts.requireTLS = true;
  if (ENV.NODE_ENV === "production") {
    opts.tls = { minVersion: "TLSv1.2" };
  }
  return opts;
}

function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport(buildTransportOptions());
  if (ENV.SMTP_PORT === 587 && ENV.SMTP_SECURE) {
    console.warn(
      "[smtp] SMTP_PORT=587 with SMTP_SECURE=true is unusual (587 expects STARTTLS). Use SMTP_SECURE=false, or port 465 with SMTP_SECURE=true.",
    );
  }
  if (ENV.SMTP_PORT === 465 && !ENV.SMTP_SECURE) {
    console.warn("[smtp] SMTP_PORT=465 usually requires SMTP_SECURE=true (implicit TLS).");
  }
  return transporter;
}

const IST_DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function formatIstDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return IST_DATE_TIME.format(d);
}

export function getPasswordResetUrl(rawToken) {
  const base = ENV.APP_BASE_URL || "http://localhost:5173";
  const url = new URL(base);
  url.searchParams.set("mode", "reset");
  url.searchParams.set("token", rawToken);
  return url.toString();
}

/**
 * Sends password reset email. Does not throw on SMTP errors (returns { sent: false }).
 * Callers should still respond with a generic success to avoid account enumeration.
 */
export async function sendPasswordResetEmail(email, rawToken, expiresAtIso) {
  const t = getTransporter();
  if (!t) return { sent: false, reason: "smtp_not_configured" };
  const resetUrl = getPasswordResetUrl(rawToken);
  const expiresLabel = formatIstDateTime(expiresAtIso);
  try {
    await t.sendMail({
      from: ENV.SMTP_FROM,
      to: email,
      subject: "SchoolTime password reset",
      text: `Use this link to reset your SchoolTime password:\n\n${resetUrl}\n\nThis link expires in 60 minutes${expiresLabel ? ` (by ${expiresLabel} IST)` : ""}.`,
      html: `
      <p>Use this link to reset your <b>SchoolTime</b> password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 60 minutes${expiresLabel ? ` (by <b>${expiresLabel} IST</b>)` : ""}.</p>
    `,
    });
    return { sent: true };
  } catch (err) {
    const message = err?.message || String(err);
    const code = err?.code || err?.responseCode;
    console.error("[password-reset] SMTP send failed:", message, code != null ? `(code ${code})` : "");
    return { sent: false, reason: "smtp_send_failed", message };
  }
}
