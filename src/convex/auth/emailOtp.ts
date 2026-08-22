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
  const text = `Your verification code is ${otp}. It expires in 15 minutes. If you didn't request this, you can ignore this email.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
    <p style="font-size:14px;line-height:1.6">Your ${appName()} verification code is:</p>
    <p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:12px 0">${otp}</p>
    <p style="font-size:13px;line-height:1.6;color:#475569">It expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
  </div>`;

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
