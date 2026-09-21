import nodemailer from 'nodemailer';
import type { EmailDeliveryPort } from './auth.js';

export interface SmtpEnvironment {
  CARELINK_SMTP_HOST?: string;
  CARELINK_SMTP_PORT?: string;
  CARELINK_SMTP_SECURE?: string;
  CARELINK_SMTP_USER?: string;
  CARELINK_SMTP_PASS?: string;
  CARELINK_SMTP_FROM?: string;
}

export function smtpConfigured(environment: SmtpEnvironment): boolean {
  return Boolean(environment.CARELINK_SMTP_HOST && environment.CARELINK_SMTP_FROM);
}

export class SmtpEmailDelivery implements EmailDeliveryPort {
  private readonly transport;
  private readonly from: string;

  constructor(environment: SmtpEnvironment) {
    if (!smtpConfigured(environment)) throw new Error('SMTP host and sender are required.');
    const port = Number(environment.CARELINK_SMTP_PORT ?? '587');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP port.');
    this.from = environment.CARELINK_SMTP_FROM!;
    this.transport = nodemailer.createTransport({
      host: environment.CARELINK_SMTP_HOST,
      port,
      secure: environment.CARELINK_SMTP_SECURE === 'true' || port === 465,
      ...(environment.CARELINK_SMTP_USER
        ? { auth: { user: environment.CARELINK_SMTP_USER, pass: environment.CARELINK_SMTP_PASS ?? '' } }
        : {}),
    });
  }

  async sendVerificationCode(input: { email: string; code: string; expiresAt: string }) {
    await this.transport.sendMail({
      from: this.from,
      to: input.email,
      subject: 'CareLink 登录验证码',
      text: `您的 CareLink 登录验证码是 ${input.code}。验证码将在 ${input.expiresAt} 失效。请勿将验证码告诉他人。`,
      html: `<p>您的 CareLink 登录验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${input.code}</p><p>验证码将在 ${input.expiresAt} 失效。请勿将验证码告诉他人。</p>`,
    });
  }
}
