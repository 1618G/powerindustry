/**
 * Email Service - Transactional email via SendGrid or Gmail
 * Supports: SendGrid (recommended), Gmail (via OAuth), SMTP (fallback)
 */

import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { db } from "~/lib/prisma";

// ============================================
// Types
// ============================================

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

type EmailProvider = "sendgrid" | "gmail" | "smtp";

// ============================================
// Provider Configuration
// ============================================

const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || "sendgrid") as EmailProvider;

// SendGrid setup
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// SMTP transporter (lazy initialization)
let smtpTransporter: nodemailer.Transporter | null = null;

function getSmtpTransporter(): nodemailer.Transporter {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return smtpTransporter;
}

// Gmail OAuth2 setup
async function getGmailTransporter(): Promise<nodemailer.Transporter> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  const accessToken = await oauth2Client.getAccessToken();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_FROM_EMAIL,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken.token || undefined,
    },
  });
}

// ============================================
// Get Default From Address
// ============================================

function getDefaultFrom(): string {
  switch (EMAIL_PROVIDER) {
    case "sendgrid":
      const sendgridFrom = process.env.SENDGRID_FROM_EMAIL || "noreply@example.com";
      const sendgridName = process.env.SENDGRID_FROM_NAME;
      return sendgridName ? `${sendgridName} <${sendgridFrom}>` : sendgridFrom;
    case "gmail":
      return process.env.GMAIL_FROM_EMAIL || "";
    case "smtp":
    default:
      const smtpFrom = process.env.SMTP_FROM_EMAIL || "noreply@example.com";
      const smtpName = process.env.SMTP_FROM_NAME;
      return smtpName ? `${smtpName} <${smtpFrom}>` : smtpFrom;
  }
}

// ============================================
// Send Email (Direct)
// ============================================

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const from = options.from || getDefaultFrom();

  try {
    switch (EMAIL_PROVIDER) {
      case "sendgrid":
        return await sendViaSendGrid({ ...options, from });
      case "gmail":
        return await sendViaGmail({ ...options, from });
      case "smtp":
      default:
        return await sendViaSmtp({ ...options, from });
    }
  } catch (error) {
    console.error("Email send error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// Provider Implementations
// ============================================

async function sendViaSendGrid(options: EmailOptions & { from: string }): Promise<EmailResult> {
  if (!process.env.SENDGRID_API_KEY) {
    return { success: false, error: "SendGrid API key not configured" };
  }

  const msg = {
    to: options.to,
    from: options.from,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
    attachments: options.attachments?.map((att) => ({
      filename: att.filename,
      content: typeof att.content === "string" ? att.content : att.content.toString("base64"),
      type: att.contentType,
      disposition: "attachment" as const,
    })),
  };

  const [response] = await sgMail.send(msg);
  return {
    success: response.statusCode >= 200 && response.statusCode < 300,
    messageId: response.headers["x-message-id"],
  };
}

async function sendViaGmail(options: EmailOptions & { from: string }): Promise<EmailResult> {
  const transporter = await getGmailTransporter();

  const info = await transporter.sendMail({
    from: options.from,
    to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
    attachments: options.attachments?.map((att) => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
    })),
  });

  return { success: true, messageId: info.messageId };
}

async function sendViaSmtp(options: EmailOptions & { from: string }): Promise<EmailResult> {
  const transporter = getSmtpTransporter();

  const info = await transporter.sendMail({
    from: options.from,
    to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
    attachments: options.attachments?.map((att) => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
    })),
  });

  return { success: true, messageId: info.messageId };
}

// ============================================
// Queue Email (for background processing)
// ============================================

export async function queueEmail(options: EmailOptions): Promise<{ id: string }> {
  const email = await db.emailQueue.create({
    data: {
      to: Array.isArray(options.to) ? options.to.join(",") : options.to,
      from: options.from || getDefaultFrom(),
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text,
      status: "PENDING",
    },
  });

  return { id: email.id };
}

// ============================================
// Process Email Queue
// ============================================

export async function processEmailQueue(batchSize: number = 10): Promise<{ processed: number; failed: number }> {
  const emails = await db.emailQueue.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: new Date() },
      attempts: { lt: db.emailQueue.fields.maxAttempts },
    },
    take: batchSize,
    orderBy: { scheduledAt: "asc" },
  });

  let processed = 0;
  let failed = 0;

  for (const email of emails) {
    await db.emailQueue.update({
      where: { id: email.id },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });

    const result = await sendEmail({
      to: email.to.split(","),
      from: email.from || undefined,
      subject: email.subject,
      html: email.htmlContent,
      text: email.textContent || undefined,
    });

    if (result.success) {
      await db.emailQueue.update({
        where: { id: email.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      processed++;
    } else {
      const newStatus = email.attempts + 1 >= email.maxAttempts ? "FAILED" : "PENDING";
      await db.emailQueue.update({
        where: { id: email.id },
        data: { status: newStatus, lastError: result.error },
      });
      failed++;
    }
  }

  return { processed, failed };
}

// ============================================
// Email Templates
// ============================================

export function welcomeEmail(name: string): string {
  const appName = process.env.APP_NAME || "ZZA Platform";
  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #4F46E5;">Welcome to ${appName}!</h1>
        <p>Hi ${name || "there"},</p>
        <p>Thank you for joining ${appName}. We're excited to have you on board!</p>
        <p>Get started by exploring your dashboard and setting up your profile.</p>
        <p>Best regards,<br>The ${appName} Team</p>
      </body>
    </html>
  `;
}

export function passwordResetEmail(resetUrl: string): string {
  const appName = process.env.APP_NAME || "ZZA Platform";
  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #4F46E5;">Reset Your Password</h1>
        <p>You requested to reset your password for ${appName}.</p>
        <p>Click the button below to set a new password:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #4F46E5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
            Reset Password
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
      </body>
    </html>
  `;
}

