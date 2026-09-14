import "server-only";

export interface SignInEmail {
  readonly to: string;
  readonly signInUrl: string;
  readonly expiresAt: Date;
}

export interface EmailSender {
  sendSignInEmail(message: SignInEmail): Promise<void>;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export class ResendEmailSender implements EmailSender {
  async sendSignInEmail(message: SignInEmail): Promise<void> {
    const apiKey = requireEnv("RESEND_API_KEY");
    const from = requireEnv("AUTH_EMAIL_FROM");
    const safeUrl = escapeHtml(message.signInUrl);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: "Sign in to DPM-Assure",
        html: `<p>Use the secure link below to sign in to DPM-Assure.</p><p><a href="${safeUrl}">Sign in to DPM-Assure</a></p><p>This link expires at ${escapeHtml(message.expiresAt.toISOString())} and can be used only once.</p><p>If you did not request this email, you can ignore it.</p>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Email delivery failed (${response.status}): ${body.slice(0, 200)}`);
    }
  }
}

export function getEmailSender(): EmailSender {
  return new ResendEmailSender();
}
