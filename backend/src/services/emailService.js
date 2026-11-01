import { env } from "../config/env.js"

export const emailService = {
  /**
   * Send a password reset email using Resend API.
   * If RESEND_API_KEY is not configured:
   *   - In dev/test: logs the reset URL to console and returns dev mock status.
   *   - In production: logs an actionable configuration warning and safely returns.
   */
  async sendPasswordResetEmail({ to, name, resetToken }) {
    const rawAppUrl = env.appUrl || "http://localhost:5173"
    const appUrl = rawAppUrl.replace(/\/+$/, "")
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(resetToken)}`

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - WorkFlow</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #4f46e5; padding: 28px 32px; text-align: left;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <div style="width: 32px; height: 32px; background-color: rgba(255, 255, 255, 0.2); border-radius: 8px; display: inline-block; text-align: center; line-height: 32px; color: #ffffff; font-weight: 700; font-size: 18px;">W</div>
                  </td>
                  <td style="padding-left: 12px; vertical-align: middle;">
                    <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">WorkFlow</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #0f172a;">Reset your password</h1>
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 24px; color: #475569;">
                Hello${name ? ` ${name}` : ""},
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 24px; color: #475569;">
                We received a request to reset the password for your WorkFlow account. Click the button below to choose a new password. This link is single-use and will expire in <strong>1 hour</strong>.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: 600; font-size: 15px; padding: 12px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);">Reset Password</a>
              </div>
              <p style="margin: 0 0 12px; font-size: 13px; line-height: 20px; color: #64748b;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 12px; line-height: 18px; word-break: break-all; color: #4f46e5;">
                <a href="${resetUrl}" style="color: #4f46e5; text-decoration: underline;">${resetUrl}</a>
              </p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
              <p style="margin: 0; font-size: 13px; line-height: 20px; color: #94a3b8;">
                If you did not request a password reset, no further action is required. Your password will remain unchanged and your account stays secure.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                WorkFlow &bull; Modern Multi-Tenant Project Management SaaS
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim()

    const textContent = `
Reset your WorkFlow password

Hello${name ? ` ${name}` : ""},

We received a request to reset your WorkFlow account password.
Please visit the following URL to set a new password (valid for 1 hour):

${resetUrl}

If you did not request a password reset, you can safely ignore this email.
Your password will remain unchanged.

--
WorkFlow
    `.trim()

    if (!env.resendApiKey) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[EMAIL SERVICE: DEV] Password reset link for ${to}:\n${resetUrl}`)
        return {
          success: true,
          delivered: false,
          mode: "development",
          resetUrl,
        }
      }
      console.warn(
        `[EMAIL SERVICE: WARN] RESEND_API_KEY is not configured in production. Password reset email to <${to}> was queued but could not be dispatched.`,
      )
      return {
        success: false,
        delivered: false,
        reason: "RESEND_API_KEY_NOT_CONFIGURED",
      }
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.emailFrom,
          to: [to],
          subject: "Reset your WorkFlow password",
          html: htmlContent,
          text: textContent,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        console.error(
          `[EMAIL SERVICE: ERROR] Resend dispatch failed (${response.status}):`,
          data?.message || response.statusText,
        )
        return {
          success: false,
          delivered: false,
          error: data?.message || "Email dispatch failed",
        }
      }

      console.log(`[EMAIL SERVICE] Password reset email dispatched to ${to} (id: ${data.id})`)
      return {
        success: true,
        delivered: true,
        id: data.id,
      }
    } catch (err) {
      console.error("[EMAIL SERVICE: EXCEPTION] Unexpected error sending email via Resend:", err.message)
      return {
        success: false,
        delivered: false,
        error: err.message,
      }
    }
  },
}
