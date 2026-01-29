import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { Navigation, Footer } from "~/components";

export const meta: MetaFunction = () => [
  { title: "About Us - ZZA Platform" },
  { name: "description", content: "Learn more about ZZA Platform and our mission." },
];

const values = [
  "Quality over quantity",
  "Transparency in everything",
  "Continuous improvement",
  "Customer success",
  "Security by default",
  "Developer empowerment",
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      {/* Hero */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl">About Us</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            We're on a mission to help you build amazing products faster.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg max-w-none">
            <h2>Our Story</h2>
            <p>
              ZZA Platform was born from a simple idea: building great software shouldn't require
              reinventing the wheel every time. We've taken years of experience building products
              and distilled it into a foundation that helps you ship faster.
            </p>
            <h2>What We Believe</h2>
            <ul>
              <li><strong>Security First:</strong> Every feature we build starts with security considerations.</li>
              <li><strong>Developer Experience:</strong> Great tools make great products. We optimize for developer happiness.</li>
              <li><strong>Production Ready:</strong> Everything we ship is ready for real users, not just demos.</li>
            </ul>
            <h2>Our Values</h2>
            <div className="not-prose mt-8 grid gap-4">
              {values.map((value) => (
                <div key={value} className="flex items-center gap-3">
                  <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-primary-600" />
                  <span className="text-gray-700">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary-600 py-16">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">Ready to Start?</h2>
          <p className="mt-4 text-lg text-primary-100">Join us and build something amazing.</p>
          <Link
            to="/register"
            className="mt-8 inline-block rounded-lg bg-white px-8 py-3 text-lg font-semibold text-primary-600 hover:bg-primary-50"
          >
            Get Started Free
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
