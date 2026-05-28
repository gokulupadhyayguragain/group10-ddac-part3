import crypto from 'crypto';

type VerificationEmailInput = {
  email: string;
  name: string;
  code: string;
  expiresMinutes: number;
  idempotencyKey: string;
};

function resendApiKey() {
  return process.env.RESEND_API_KEY || process.env.RESEND_KEY;
}

export function isResendConfigured() {
  return Boolean(resendApiKey());
}

export function exposeDevVerificationCode() {
  return process.env.NODE_ENV !== 'production' && process.env.AUTH_DEV_EXPOSE_VERIFICATION_CODE === 'true';
}

export async function sendVerificationEmail(input: VerificationEmailInput) {
  const apiKey = resendApiKey();
  const from = process.env.RESEND_FROM_EMAIL || 'SafeTrace <onboarding@resend.dev>';
  const subject = 'Your SafeTrace verification code';
  const text = [
    `Hello ${input.name},`,
    '',
    `Your SafeTrace verification code is ${input.code}.`,
    `It expires in ${input.expiresMinutes} minutes.`,
    '',
    'If you did not create a SafeTrace account, ignore this email.',
  ].join('\n');
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0f172a">
      <p>Hello ${escapeHtml(input.name)},</p>
      <p>Your SafeTrace verification code is:</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:6px;margin:16px 0">${input.code}</p>
      <p>This code expires in ${input.expiresMinutes} minutes.</p>
      <p style="color:#64748b">If you did not create a SafeTrace account, ignore this email.</p>
    </div>
  `;

  if (!apiKey) {
    console.info(`[SafeTrace] Verification code for ${input.email}: ${input.code}`);
    return { mode: 'local' as const, sent: false };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey || crypto.randomUUID(),
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed with ${response.status}: ${body}`);
  }

  const body = await response.json().catch(() => ({}));
  return { mode: 'resend' as const, sent: true, id: body.id as string | undefined };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
