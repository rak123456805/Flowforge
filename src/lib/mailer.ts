import nodemailer from "nodemailer";

interface SendInviteEmailParams {
  toEmail: string;
  orgName: string;
  inviterEmail: string;
  role: string;
  inviteLink: string;
}

export async function sendInviteEmail({
  toEmail,
  orgName,
  inviterEmail,
  role,
  inviteLink,
}: SendInviteEmailParams): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"FlowForge" <onboarding@resend.dev>`;

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Organization Invitation</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 40px auto; background-color: #18181b; border-radius: 16px; border: 1px solid #27272a; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
      <!-- Header -->
      <tr>
        <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #27272a; background: linear-gradient(to bottom, #1e1b4b, #18181b);">
          <div style="font-size: 24px; font-weight: 800; color: #a78bfa; letter-spacing: -0.5px;">⚡ FlowForge</div>
        </td>
      </tr>
      
      <!-- Content -->
      <tr>
        <td style="padding: 40px;">
          <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #f4f4f5; text-align: center;">
            You're invited to join <span style="color: #c4b5fd;">${orgName}</span>
          </h1>
          <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #a1a1aa; text-align: center;">
            <strong style="color: #e4e4e7;">${inviterEmail}</strong> has invited you to collaborate as a 
            <span style="display: inline-block; padding: 2px 8px; background-color: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 9999px; color: #ddd6fe; font-weight: 600; font-size: 12px; text-transform: capitalize;">${role}</span> 
            in their organization workspace.
          </p>

          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0;">
            <tr>
              <td align="center">
                <a href="${inviteLink}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 10px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);">
                  Accept Invitation
                </a>
              </td>
            </tr>
          </table>

          <p style="margin: 24px 0 0 0; font-size: 12px; line-height: 1.5; color: #71717a; text-align: center;">
            Or copy and paste this URL into your browser:<br>
            <a href="${inviteLink}" style="color: #a78bfa; word-break: break-all;">${inviteLink}</a>
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding: 24px 40px; background-color: #09090b; border-top: 1px solid #27272a; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #52525b;">
            This invitation was sent by FlowForge. If you were not expecting this invite, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  // 1. Resend API (HTTP)
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [toEmail],
          subject: `Invitation to join ${orgName} on FlowForge`,
          html: htmlContent,
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("[Resend API Error]:", errorText);
        return { success: false, error: errorText };
      }
      return { success: true };
    } catch (err) {
      console.error("[Resend API Exception]:", err);
      return { success: false, error: err instanceof Error ? err.message : "Failed to send email via Resend" };
    }
  }

  // 2. Nodemailer SMTP
  if (host && user && pass) {
    const cleanPass = pass.replace(/\s+/g, "");
    const senderEmail = user.trim();
    // For Gmail SMTP, the sender email address must match the authenticated Gmail user
    const defaultFrom = senderEmail.includes("@gmail.com")
      ? `"FlowForge" <${senderEmail}>`
      : `"FlowForge" <noreply@flowforge.app>`;
    const fromAddress = process.env.SMTP_FROM || defaultFrom;

    try {
      const transporter = nodemailer.createTransport({
        host: host.trim(),
        port,
        secure, // false for port 587 (TLS), true for port 465 (SSL)
        auth: {
          user: senderEmail,
          pass: cleanPass,
        },
      });

      const info = await transporter.sendMail({
        from: fromAddress,
        to: toEmail,
        subject: `Invitation to join ${orgName} on FlowForge`,
        html: htmlContent,
      });

      console.log(`[Mailer SMTP Success] Email sent to ${toEmail}. Message ID: ${info.messageId}`);
      return { success: true };
    } catch (error) {
      console.error("[Mailer SMTP Error]: Failed to send email via SMTP:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send email via SMTP",
      };
    }
  }

  // 3. Fallback: simulated mode
  console.log(
    `[Mailer Simulated - No SMTP or Resend credentials set in .env.local] Email to ${toEmail} for joining "${orgName}" as ${role}. Link: ${inviteLink}`
  );
  return { success: true, simulated: true };
}
