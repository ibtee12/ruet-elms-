import { Resend } from "resend";

export interface SendPasswordResetEmailOptions {
  to: string;
  resetUrl: string;
  recipientName?: string;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

function shouldSimulateEmail(): boolean {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "re_123456789") return true;
  if (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)) return true;
  return false;
}

/**
 * Fail-safe email helper: logs errors and never throws into the calling action.
 */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
  recipientName,
}: SendPasswordResetEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "RUET ELMS <noreply@ruet.ac.bd>";

  if (shouldSimulateEmail()) {
    // In test mode or local development with placeholder key, simulate delivery
    console.info(
      `[Email] Simulated password reset email to ${to}.\nReset Link: ${resetUrl}`
    );
    return {
      success: true,
      id: "simulated-" + Date.now(),
    };
  }

  try {
    const resend = new Resend(apiKey);
    const greeting = recipientName ? `Hello ${recipientName},` : "Hello,";

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: "Reset your RUET ELMS Password",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Reset your password</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9fc; margin: 0; padding: 24px; color: #1e293b;">
            <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <div style="background-color: #0F2A4A; padding: 24px 32px; color: #ffffff;">
                <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #5eead4; font-weight: 600;">Rajshahi University of Engineering &amp; Technology</p>
                <h1 style="margin: 4px 0 0 0; font-size: 20px; font-weight: 700;">RUET ELMS Password Reset</h1>
              </div>
              <div style="padding: 32px;">
                <p style="margin-top: 0; font-size: 15px; line-height: 1.6;">${greeting}</p>
                <p style="font-size: 15px; line-height: 1.6; color: #334155;">
                  We received a request to reset your password for your RUET ELMS account. Click the button below to choose a new password:
                </p>
                <div style="margin: 28px 0; text-align: center;">
                  <a href="${resetUrl}" style="background-color: #0B7D7C; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                    Reset Password
                  </a>
                </div>
                <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
                  <strong>Important:</strong> This link is single-use and will expire in <strong>30 minutes</strong>.
                </p>
                <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
                  If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
                </p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="font-size: 11px; color: #94a3b8; margin-bottom: 0;">
                  Button not working? Copy and paste this URL into your browser:<br />
                  <a href="${resetUrl}" style="color: #0B7D7C; word-break: break-all;">${resetUrl}</a>
                </p>
              </div>
              <div style="background-color: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
                RUET ELMS • Even Term 2026 • Kazla, Rajshahi-6204, Bangladesh
              </div>
            </div>
          </body>
        </html>
      `,
      text: `${greeting}\n\nWe received a request to reset your password for your RUET ELMS account.\n\nPlease visit the link below to choose a new password:\n${resetUrl}\n\nThis link is single-use and will expire in 30 minutes.\n\nIf you did not request a password reset, you can safely ignore this email.\n\nRUET ELMS`,
    });

    if (error) {
      console.error("[Email] Resend API returned an error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Email] Unexpected error sending email via Resend:", message);
    return { success: false, error: message };
  }
}

export interface SendWelcomeEmailOptions {
  to: string;
  recipientName: string;
  role: string;
  tempPassword: string;
}

/**
 * Sends welcome email with initial temporary credentials. Fail-safe.
 */
export async function sendWelcomeEmail({
  to,
  recipientName,
  role,
  tempPassword,
}: SendWelcomeEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "RUET ELMS <noreply@ruet.ac.bd>";

  if (shouldSimulateEmail()) {
    console.info(
      `[Email] Simulated welcome email to ${to} (Role: ${role}).\nTemp Password: ${tempPassword}`
    );
    return {
      success: true,
      id: "simulated-" + Date.now(),
    };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: "Welcome to RUET ELMS",
      html: `<p>Dear ${recipientName},</p><p>Your account has been created with role <strong>${role}</strong>. Your temporary password is: <code>${tempPassword}</code></p><p>Please log in and update your password.</p>`,
      text: `Dear ${recipientName},\n\nYour RUET ELMS account has been created with role ${role}.\nYour temporary password is: ${tempPassword}\n\nPlease change your password upon first login.\n\nRUET ELMS`,
    });

    if (error) {
      console.error("[Email] Error sending welcome email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Email] Unexpected error sending welcome email:", message);
    return { success: false, error: message };
  }
}

export interface SendUrgentNotificationEmailOptions {
  to: string;
  recipientName?: string;
  title: string;
  message: string;
  link?: string;
}

/**
 * Sends urgent notification email via Resend. Fail-safe, never throws.
 */
export async function sendUrgentNotificationEmail({
  to,
  recipientName,
  title,
  message,
  link,
}: SendUrgentNotificationEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "RUET ELMS <noreply@ruet.ac.bd>";

  if (shouldSimulateEmail()) {
    console.info(
      `[Email] Simulated urgent notification email to ${to}.\nTitle: ${title}\nMessage: ${message}`
    );
    return {
      success: true,
      id: "simulated-" + Date.now(),
    };
  }

  try {
    const resend = new Resend(apiKey);
    const greeting = recipientName ? `Hello ${recipientName},` : "Hello,";
    const fullLink = link
      ? link.startsWith("http")
        ? link
        : `${process.env.NEXTAUTH_URL || ""}${link}`
      : null;

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: `[URGENT] ${title} - RUET ELMS`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #dc2626; margin-top: 0;">⚠️ Urgent Academic Notification</h2>
          <p>${greeting}</p>
          <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0;">
            <h3 style="margin: 0 0 8px 0; color: #991b1b;">${title}</h3>
            <p style="margin: 0; color: #4b5563;">${message}</p>
          </div>
          ${
            fullLink
              ? `<p><a href="${fullLink}" style="background-color: #0F2A4A; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">View in RUET ELMS</a></p>`
              : ""
          }
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 12px;">Rajshahi University of Engineering &amp; Technology</p>
        </div>
      `,
      text: `${greeting}\n\n[URGENT] ${title}\n\n${message}\n\n${fullLink ? `View details: ${fullLink}\n\n` : ""}RUET ELMS`,
    });

    if (error) {
      console.error("[Email] Error sending urgent notification email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Email] Unexpected error sending urgent notification email:", msg);
    return { success: false, error: msg };
  }
}


