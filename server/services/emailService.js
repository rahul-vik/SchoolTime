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

export function getPasswordResetUrl(rawToken) {
  const base = ENV.APP_BASE_URL || "http://localhost:5173";
  const url = new URL(base);
  url.searchParams.set("mode", "reset");
  url.searchParams.set("token", rawToken);
  return url.toString();
}

export async function sendPasswordResetEmail(email, rawToken) {
  const t = getTransporter();
  if (!t) return { sent: false, reason: "smtp_not_configured" };
  const resetUrl = getPasswordResetUrl(rawToken);
  await t.sendMail({
    from: ENV.SMTP_FROM,
    to: email,
    subject: "SchoolTime password reset",
    text: `Use this link to reset your SchoolTime password:\n\n${resetUrl}\n\nThis link expires in 60 minutes.`,
    html: `
      <p>Use this link to reset your <b>SchoolTime</b> password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 60 minutes.</p>
    `,
  });
  return { sent: true };
}
