// Lead Capture API Endpoint
import { json, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/prisma";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const message = formData.get("message") as string;

    // Validate required fields
    if (!name || !email) {
      return json({ error: "Name and email are required" }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return json({ error: "Invalid email address" }, { status: 400 });
    }

    // Store as contact message in database
    await db.contactMessage.create({
      data: {
        name,
        email,
        subject: "Power Industry Calculator - Lead Enquiry",
        message: `Phone: ${phone || "Not provided"}\n\n${message || "No message provided"}`,
        status: "NEW",
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
      },
    });

    // TODO: Send email notification to Jordan Prescott
    // await sendEmail({
    //   to: "jordan.prescott@example.com",
    //   subject: `New Lead: ${name}`,
    //   body: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`
    // });

    // Redirect to thank you page or back to home with success message
    return redirect("/?lead=success#contact");
  } catch (error) {
    console.error("Lead capture error:", error);
    return json({ error: "Failed to submit enquiry" }, { status: 500 });
  }
}

// Don't allow GET requests
export async function loader() {
  return redirect("/");
}
