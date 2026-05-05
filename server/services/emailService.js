import nodemailer from "nodemailer";
import { ENV } from "../config/env.js";

function isSmtpConfigured() {
  return Boolean(ENV.SMTP_HOST && ENV.SMTP_USER && ENV.SMTP_PASS && ENV.SMTP_FROM);
}

let transporter = null;

function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: ENV.SMTP_PORT,
    secure: ENV.SMTP_SECURE,
    auth: { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS },
  });
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

export async function sendPasswordResetEmail(email, rawToken, expiresAtIso) {
  const t = getTransporter();
  if (!t) return { sent: false, reason: "smtp_not_configured" };
  const resetUrl = getPasswordResetUrl(rawToken);
  const expiresLabel = formatIstDateTime(expiresAtIso);
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
}
