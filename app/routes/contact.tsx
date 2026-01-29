/**
 * Contact Page - Contact form submission
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faUser, faMessage, faCheckCircle } from "@fortawesome/free-solid-svg-icons";

import { submitContactForm } from "~/services/contact.service";
import { contactSchema } from "~/utils/validation";
import { Navigation, Footer } from "~/components";

export const meta: MetaFunction = () => [
  { title: "Contact Us - ZZA Platform" },
  { name: "description", content: "Get in touch with us. We'd love to hear from you." },
];

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject") || undefined,
    message: formData.get("message"),
  });

  if (!result.success) {
    return json({ errors: result.error.flatten().fieldErrors, success: false }, { status: 400 });
  }

  try {
    await submitContactForm(result.data);
    return json({ success: true, errors: null });
  } catch (error) {
    console.error("Contact form error:", error);
    return json({ 
      errors: { message: ["Failed to send message. Please try again."] }, 
      success: false 
    }, { status: 500 });
  }
}

export default function ContactPage() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <section className="bg-gradient-to-b from-primary-50 to-white py-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl">Contact Us</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            Have a question or feedback? We'd love to hear from you.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
          {actionData?.success ? <SuccessMessage /> : <ContactForm actionData={actionData} />}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function SuccessMessage() {
  return (
    <div className="rounded-lg bg-green-50 p-8 text-center">
      <FontAwesomeIcon icon={faCheckCircle} className="mx-auto h-12 w-12 text-green-500" />
      <h3 className="mt-4 text-xl font-semibold text-gray-900">Message Sent!</h3>
      <p className="mt-2 text-gray-600">Thank you for reaching out. We'll get back to you as soon as possible.</p>
      <Link to="/" className="mt-6 inline-block rounded-lg bg-primary-600 px-6 py-2 text-white hover:bg-primary-700">
        Back to Home
      </Link>
    </div>
  );
}

function ContactForm({ actionData }: { actionData: { errors?: Record<string, string[]> } | undefined }) {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-950/5">
      <Form method="post" className="space-y-6">
        <FormField name="name" label="Name" icon={faUser} placeholder="Your name" error={actionData?.errors?.name?.[0]} />
        <FormField name="email" label="Email" icon={faEnvelope} placeholder="you@example.com" type="email" error={actionData?.errors?.email?.[0]} />
        <div>
          <label htmlFor="subject" className="label">Subject (optional)</label>
          <input id="subject" name="subject" type="text" className="input" placeholder="What's this about?" />
        </div>
        <div>
          <label htmlFor="message" className="label">Message</label>
          <textarea id="message" name="message" rows={5} required className={`input resize-none ${actionData?.errors?.message ? "input-error" : ""}`} placeholder="Your message..." />
          {actionData?.errors?.message && <p className="mt-1 text-sm text-red-600">{actionData.errors.message[0]}</p>}
        </div>
        <button type="submit" className="btn-primary w-full py-3">
          <FontAwesomeIcon icon={faMessage} className="mr-2" />Send Message
        </button>
      </Form>
    </div>
  );
}

function FormField({ name, label, icon, placeholder, type = "text", error }: { name: string; label: string; icon: typeof faUser; placeholder: string; type?: string; error?: string }) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <div className="relative mt-1">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <FontAwesomeIcon icon={icon} className="h-5 w-5 text-gray-400" />
        </div>
        <input id={name} name={name} type={type} required className={`input pl-10 ${error ? "input-error" : ""}`} placeholder={placeholder} />
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
