import nodemailer from 'nodemailer';

// Email configuration interface
interface EmailConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from?: string;
}

// Get email configuration from environment variables
function getEmailConfig(): EmailConfig {
  return {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@example.com',
  };
}

// Create email transporter
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) {
    return transporter;
  }

  const config = getEmailConfig();

  // If no SMTP user is configured, use a test account (for development)
  if (!config.auth) {
    console.warn('[Email] No SMTP credentials configured. Email sending will be disabled.');
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });

    console.log('[Email] SMTP transporter initialized:', {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.auth?.user,
    });

    return transporter;
  } catch (error) {
    console.error('[Email] Failed to create transporter:', error);
    return null;
  }
}

// Email options interface
interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

// Send email
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const emailTransporter = getTransporter();
  
  if (!emailTransporter) {
    console.warn('[Email] Email transporter not available. Skipping email send.');
    return false;
  }

  const config = getEmailConfig();
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  try {
    const info = await emailTransporter.sendMail({
      from: options.from || config.from,
      to: recipients.join(', '),
      subject: options.subject,
      text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      html: options.html,
    });

    console.log('[Email] Email sent successfully:', {
      messageId: info.messageId,
      to: recipients,
      subject: options.subject,
    });

    return true;
  } catch (error) {
    console.error('[Email] Failed to send email:', error);
    return false;
  }
}

// Verify email configuration
export async function verifyEmailConfig(): Promise<boolean> {
  const emailTransporter = getTransporter();
  
  if (!emailTransporter) {
    return false;
  }

  try {
    await emailTransporter.verify();
    console.log('[Email] SMTP configuration verified successfully');
    return true;
  } catch (error) {
    console.error('[Email] SMTP configuration verification failed:', error);
    return false;
  }
}
