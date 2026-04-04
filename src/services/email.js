import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.EMAIL_FROM || 'Huntz <noreply@huntz.com>';
const API    = process.env.API_URL;
const APP    = process.env.FRONTEND_URL;

// ── Email Verification ───────────────────────────────────
export const sendVerificationEmail = async (email, name, token) => {
  const link = `${API}/api/auth/verify-email/${token}`;
  await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: 'Verify your Huntz account',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;">
        <h2 style="color:#0D1B3E;font-size:22px;margin-bottom:8px;">Welcome to Huntz, ${name}!</h2>
        <p style="color:#4A6099;margin-bottom:24px;">Click the button below to verify your email and activate your account.</p>
        <a href="${link}" style="display:inline-block;background:#E8644A;color:#fff;padding:13px 28px;border-radius:50px;text-decoration:none;font-weight:500;">Verify my email</a>
        <p style="color:#A0AFCC;font-size:12px;margin-top:24px;">If you didn't create a Huntz account, you can safely ignore this email.</p>
      </div>`,
  });
};

// ── Password Reset ───────────────────────────────────────
export const sendPasswordResetEmail = async (email, name, token) => {
  const link = `${APP}/reset-password?token=${token}`;
  await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: 'Reset your Huntz password',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;">
        <h2 style="color:#0D1B3E;font-size:22px;margin-bottom:8px;">Password reset request</h2>
        <p style="color:#4A6099;margin-bottom:24px;">Hi ${name}, click below to reset your password. This link expires in 1 hour.</p>
        <a href="${link}" style="display:inline-block;background:#E8644A;color:#fff;padding:13px 28px;border-radius:50px;text-decoration:none;font-weight:500;">Reset password</a>
        <p style="color:#A0AFCC;font-size:12px;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  });
};

// ── Application Status Update ────────────────────────────
export const sendApplicationUpdateEmail = async (email, name, jobTitle, company, status) => {
  const statusMessages = {
    viewed:      { verb: 'viewed your application',  color: '#378ADD' },
    shortlisted: { verb: 'shortlisted you',          color: '#1D9E75' },
    rejected:    { verb: 'reviewed your application', color: '#888780' },
  };
  const msg = statusMessages[status] || { verb: 'updated your application status', color: '#0D1B3E' };
  await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: `Update on your ${jobTitle} application`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;">
        <h2 style="color:#0D1B3E;font-size:20px;margin-bottom:8px;">Application update</h2>
        <p style="color:#4A6099;margin-bottom:8px;">Hi ${name},</p>
        <p style="color:#4A6099;margin-bottom:24px;"><strong style="color:${msg.color}">${company}</strong> has ${msg.verb} for <strong>${jobTitle}</strong>.</p>
        <a href="${APP}/applications" style="display:inline-block;background:#0D1B3E;color:#fff;padding:13px 28px;border-radius:50px;text-decoration:none;font-weight:500;">View application</a>
      </div>`,
  });
};

// ── New Matches Found ────────────────────────────────────
export const sendMatchesFoundEmail = async (email, name, count) => {
  await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: `${count} new job matches found for you`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;">
        <h2 style="color:#0D1B3E;font-size:20px;margin-bottom:8px;">New matches ready</h2>
        <p style="color:#4A6099;margin-bottom:24px;">Hi ${name}, Huntz found <strong>${count} new job opportunities</strong> that match your profile. Review them and apply with one click.</p>
        <a href="${APP}/matches" style="display:inline-block;background:#E8644A;color:#fff;padding:13px 28px;border-radius:50px;text-decoration:none;font-weight:500;">View my matches</a>
      </div>`,
  });
};
