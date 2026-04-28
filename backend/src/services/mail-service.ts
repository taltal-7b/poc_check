import nodemailer from 'nodemailer';
import { config } from '../config';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';

type MailOptions = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
};

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

async function getSettingMap(keys: string[]) {
  const rows = await prisma.setting.findMany({
    where: { name: { in: keys } },
  });
  return new Map(rows.map((row) => [row.name, row.value]));
}

function createTransport() {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth:
      config.SMTP_USER && config.SMTP_PASS
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
        : undefined,
  });
}

export async function sendMail(options: MailOptions): Promise<void> {
  const recipients = Array.from(new Set(options.to.map((mail) => mail.trim()).filter(Boolean)));
  if (!recipients.length) return;

  const settings = await getSettingMap(['mail_from', 'bcc_recipients']);
  const from = settings.get('mail_from')?.trim() || config.SMTP_FROM;
  const useBcc = isEnabled(settings.get('bcc_recipients'));
  const transporter = createTransport();

  await transporter.sendMail({
    from,
    to: useBcc ? from : recipients,
    bcc: useBcc ? recipients : undefined,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}

export async function sendMailBestEffort(options: MailOptions): Promise<void> {
  const recipients = Array.from(new Set(options.to.map((mail) => mail.trim()).filter(Boolean)));
  if (!recipients.length) return;

  try {
    await sendMail(options);
  } catch (error) {
    logger.warn('メール通知の送信に失敗しました', {
      subject: options.subject,
      recipients: recipients.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

