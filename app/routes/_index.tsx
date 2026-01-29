import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRocket,
  faShield,
  faBolt,
  faCheck,
  faArrowRight,
  faCheckCircle,
} from "@fortawesome/free-solid-svg-icons";

// ============================================================
// CUSTOMIZE THIS FILE FOR YOUR PLATFORM
// ============================================================
// 
// This is your landing page template. Update the following:
// 
// 1. PLATFORM_CONFIG - Your platform name, tagline, and description
// 2. FEATURES - Your platform's key features (update icons, titles, descriptions)
// 3. PRICING_PLANS - Your pricing tiers
// 4. Colors - Update the gradient and accent colors in the JSX
// 5. Meta tags - Update the meta function below
// 
// ============================================================

const PLATFORM_CONFIG = {
  name: "Your Platform",
  tagline: "Your Compelling Tagline Here",
  description: "A brief description of what your platform does and the value it provides to users.",
  heroSubtext: "Everything you need to [achieve X]. Built for [target audience].",
};

const FEATURES = [
  {
    icon: faRocket,
    title: "Feature One",
    description: "Describe what this feature does and why users will love it.",
  },
  {
    icon: faShield,
    title: "Feature Two", 
    description: "Describe what this feature does and why users will love it.",
  },
  {
    icon: faBolt,
    title: "Feature Three",
    description: "Describe what this feature does and why users will love it.",
  },
];

const BENEFITS = [
  "Benefit statement one - what users get",
  "Benefit statement two - another value prop",
  "Benefit statement three - key advantage",
  "Benefit statement four - differentiator",
];

const PRICING_PLANS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Perfect for getting started",
    features: ["Feature A", "Feature B", "Feature C"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For growing teams",
    features: ["Everything in Starter", "Feature D", "Feature E", "Feature F"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations",
    features: ["Everything in Pro", "Feature G", "Feature H", "Dedicated support"],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export const meta: MetaFunction = () => [
  { title: `${PLATFORM_CONFIG.name} - ${PLATFORM_CONFIG.tagline}` },
  {
    name: "description",
    content: PLATFORM_CONFIG.description,
  },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
              <span className="text-lg font-bold text-white">
                {PLATFORM_CONFIG.name.charAt(0)}
              </span>
            </div>
            <span className="text-xl font-semibold text-white">
              {PLATFORM_CONFIG.name}
            </span>
          </div>
          <div className="hidden items-center gap-6 md:flex">
            <a
              href="#features"
              className="text-slate-300 transition-colors hover:text-white"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-slate-300 transition-colors hover:text-white"
            >
              Pricing
            </a>
            <Link
              to="/about"
              className="text-slate-300 transition-colors hover:text-white"
            >
              About
            </Link>
            <Link
              to="/contact"
              className="text-slate-300 transition-colors hover:text-white"
            >
              Contact
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="text-slate-300 transition-colors hover:text-white"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="px-6 pb-20 pt-32">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-5xl font-bold leading-tight text-white md:text-6xl">
            {PLATFORM_CONFIG.tagline}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400 md:text-xl">
            {PLATFORM_CONFIG.heroSubtext}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/register"
              className="group flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/25"
            >
              Get Started Free
              <FontAwesomeIcon
                icon={faArrowRight}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
            <Link
              to="/about"
              className="flex items-center gap-2 rounded-xl border border-slate-700 px-8 py-4 text-lg font-semibold text-white transition-all hover:border-slate-500 hover:bg-slate-800/50"
            >
              Learn More
            </Link>
          </div>

          {/* Benefits List */}
          <div className="mx-auto mt-12 max-w-xl">
            <div className="grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
              {BENEFITS.map((benefit, index) => (
                <div key={index} className="flex items-center gap-2 text-slate-300">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-500" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="border-t border-slate-800 bg-slate-900/50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Everything You Need
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
              {PLATFORM_CONFIG.description}
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 transition-all hover:border-slate-600"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10">
                  <FontAwesomeIcon
                    icon={feature.icon}
                    className="text-xl text-indigo-400"
                  />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="text-sm text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Simple, Transparent Pricing
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
              Choose the plan that&apos;s right for you.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {PRICING_PLANS.map((plan, index) => (
              <div
                key={index}
                className={`rounded-2xl border p-6 ${
                  plan.highlighted
                    ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500"
                    : "border-slate-700 bg-slate-800/50"
                }`}
              >
                {plan.highlighted && (
                  <div className="mb-4 inline-block rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{plan.description}</p>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-slate-400">{plan.period}</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-2 text-slate-300">
                      <FontAwesomeIcon icon={faCheck} className="text-emerald-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className={`mt-6 block w-full rounded-lg py-3 text-center font-semibold transition-colors ${
                    plan.highlighted
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "border border-slate-600 text-white hover:bg-slate-700"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-slate-800 bg-gradient-to-b from-slate-900 to-indigo-950/30 px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Ready to Get Started?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            Join thousands of users who trust {PLATFORM_CONFIG.name}.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/register"
              className="group flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/25"
            >
              Start Free Trial
              <FontAwesomeIcon
                icon={faArrowRight}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
            <Link
              to="/contact"
              className="flex items-center gap-2 rounded-xl border border-slate-700 px-8 py-4 text-lg font-semibold text-white transition-all hover:border-slate-500 hover:bg-slate-800/50"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900 px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
                <span className="text-lg font-bold text-white">
                  {PLATFORM_CONFIG.name.charAt(0)}
                </span>
              </div>
              <span className="text-xl font-semibold text-white">
                {PLATFORM_CONFIG.name}
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400">
              <Link to="/about" className="hover:text-white">
                About
              </Link>
              <Link to="/contact" className="hover:text-white">
                Contact
              </Link>
              <Link to="/privacy" className="hover:text-white">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-white">
                Terms
              </Link>
            </div>
          </div>
          <div className="mt-8 text-center text-sm text-slate-500">
            © {new Date().getFullYear()} {PLATFORM_CONFIG.name}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
