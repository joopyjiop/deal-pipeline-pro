import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

const RESEND_API = "https://api.resend.com/emails";
const DEFAULT_FROM = "Deal Forge <support@dealforge.homes>";

function appName(): string {
  return process.env.VLY_APP_NAME || "a freebuff.com application";
}

/**
 * Send the login OTP through the owner's own Resend account (the same account
 * used for purchase-confirmation emails). This keeps sign-in working even when
 * the shared Freebuff relay is out of its monthly quota.
 */
async function sendViaResend(to: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured on the Convex deployment");
  }
  const from = process.env.PURCHASE_EMAIL_FROM?.trim() || DEFAULT_FROM;
  const subject = `${otp} is your ${appName()} verification code`;
  const text = `Your ${appName()} verification code is ${otp}.\n\nIt expires in 15 minutes. If you didn't request this code, you can safely ignore this email — no one has access to your account.`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your verification code is ${otp}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,.08);overflow:hidden;">
        <tr><td style="background:#0f172a;padding:24px 32px;text-align:center;">
          <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.5px;">Deal&nbsp;Forge</span>
        </td></tr>
        <tr><td style="padding:36px 40px 40px;text-align:center;">
          <p style="font-size:16px;line-height:1.6;color:#0f172a;margin:0 0 6px;">Hi there,</p>
          <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 24px;">Use this code to sign in to ${appName()}:</p>
          <div style="margin:0 auto 28px;padding:18px 24px;background:#f8fafc;border:2px dashed #cbd5e1;border-radius:10px;display:inline-block;">
            <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0f172a;">${otp}</span>
          </div>
          <p style="font-size:13px;line-height:1.6;color:#64748b;margin:0 0 20px;">
            This code expires in <strong style="color:#334155">15 minutes</strong>.
          </p>
          <p style="font-size:12px;line-height:1.7;color:#94a3b8;margin:0;">
            Didn't request this? You can safely ignore this email —<br>your account stays secure.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="font-size:11px;line-height:1.6;color:#94a3b8;margin:0;">&copy; ${new Date().getFullYear()} ${appName()} &middot; Automated message</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  let response: Response;
  try {
    response = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(
      `Resend request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = payload?.message ? String(payload.message) : response.statusText;
    throw new Error(`Resend ${response.status}: ${message}`);
  }
}

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    // Prefer the owner's own Resend account so sign-in never depends on the
    // shared Freebuff relay (which can hit its monthly quota). Fall back to
    // the Freebuff relay only on deployments where Resend isn't configured.
    if (process.env.RESEND_API_KEY?.trim()) {
      await sendViaResend(email, token);
      return;
    }

    const apiKey = process.env.VLY_EMAIL_API_KEY || "fb_email_2crN1hqIArZP2bEfvjp5Qik4";
    try {
      await axios.post(
        "https://auth.freebuff.app/send_otp",
        {
          to: email,
          otp: token,
          appName: appName(),
        },
        {
          headers: {
            "x-api-key": apiKey,
          },
        },
      );
    } catch (error) {
      // Surface the relay's real error (e.g. quota exhausted) instead of a raw
      // AxiosError blob, so the owner can see why the email didn't go out.
      const detail = axios.isAxiosError(error)
        ? `${error.response?.status ?? error.code}: ${
            error.response?.data ? JSON.stringify(error.response.data) : error.message
          }`
        : error instanceof Error
          ? error.message
          : String(error);
      throw new Error(`Email OTP delivery failed (Freebuff relay): ${detail}`);
    }
  },
});
