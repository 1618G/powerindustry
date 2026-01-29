/**
 * Contact Service - Contact form handling
 */

import { sendEmail } from "./email.server";
import { logAuditTrail } from "./soc2-compliance.server";
import { config } from "~/lib/config.server";

// ============================================
// Types
// ============================================

export type ContactFormData = {
  name: string;
  email: string;
  subject?: string;
  message: string;
};

// ============================================
// Contact Form
// ============================================

/**
 * Submit contact form
 */
export async function submitContactForm(data: ContactFormData): Promise<void> {
  const supportEmail = process.env.SUPPORT_EMAIL || "support@example.com";

  await sendEmail({
    to: supportEmail,
    subject: data.subject || `Contact Form: ${data.name}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <p><strong>From:</strong> ${data.name} (${data.email})</p>
      <p><strong>Subject:</strong> ${data.subject || "General Inquiry"}</p>
      <hr>
      <p>${data.message.replace(/\n/g, "<br>")}</p>
    `,
    replyTo: data.email,
  });

  // Send confirmation to user
  await sendEmail({
    to: data.email,
    subject: `We received your message - ${config.app.name}`,
    html: `
      <h2>Thank you for contacting us!</h2>
      <p>Hi ${data.name},</p>
      <p>We've received your message and will get back to you as soon as possible.</p>
      <p>Here's a copy of your message:</p>
      <blockquote style="border-left: 3px solid #ccc; padding-left: 1em; margin-left: 0;">
        ${data.message.replace(/\n/g, "<br>")}
      </blockquote>
      <p>Best regards,<br>The ${config.app.name} Team</p>
    `,
  });

  await logAuditTrail(null, "contact_form.submitted", {
    details: { email: data.email, subject: data.subject },
  });
}
