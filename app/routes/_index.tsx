// Power Industry Calculator - Landing Page
import { json, type MetaFunction, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faGasPump,
  faBatteryThreeQuarters,
  faPlug,
  faLayerGroup,
  faExchangeAlt,
  faArrowRight,
  faCalculator,
  faFileDownload,
  faCheckCircle,
  faIndustry,
  faHardHat,
  faBuilding,
  faCalendarAlt,
  faCogs,
} from "@fortawesome/free-solid-svg-icons";
import { Footer } from "~/components";

export const meta: MetaFunction = () => {
  return [
    { title: "Power Industry Calculator | Professional Power Sizing Tools" },
    {
      name: "description",
      content:
        "Professional-grade calculation tools for power generation and temporary energy. Size generators, calculate fuel consumption, voltage drop, and hybrid savings.",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const leadSuccess = url.searchParams.get("lead") === "success";
  return json({ leadSuccess });
}

const tools = [
  {
    id: "power",
    name: "Power Requirement Finder",
    description: "Calculate generator size from your load list with diversity factors and motor starting",
    icon: faBolt,
    color: "yellow",
    href: "/tools/power",
    features: ["kW to kVA conversion", "Diversity factors", "Motor start multipliers", "Altitude derating"],
  },
  {
    id: "fuel",
    name: "Fuel & Cost Calculator",
    description: "Estimate fuel consumption, costs, and CO₂ emissions based on runtime and load",
    icon: faGasPump,
    color: "red",
    href: "/tools/fuel",
    features: ["Diesel/Petrol/Gas", "Cost estimation", "CO₂ emissions", "Tank refill planning"],
  },
  {
    id: "hybrid",
    name: "Hybrid Savings Estimator",
    description: "Compare traditional vs battery-hybrid configurations for fuel and emissions savings",
    icon: faBatteryThreeQuarters,
    color: "green",
    href: "/tools/hybrid",
    features: ["Fuel savings", "CO₂ reduction", "Peak shaving", "Cost comparison"],
  },
  {
    id: "cables",
    name: "Voltage Drop Calculator",
    description: "Check cable sizing to ensure voltage drop is within acceptable limits",
    icon: faPlug,
    color: "blue",
    href: "/tools/cables",
    features: ["Single & 3-phase", "Copper & aluminium", "Cable sizing", "Power loss"],
  },
  {
    id: "load-sets",
    name: "Load-on-Demand Planner",
    description: "Configure optimal multi-generator setups with N+1 redundancy",
    icon: faLayerGroup,
    color: "purple",
    href: "/tools/load-sets",
    features: ["Multi-gen config", "N+1 redundancy", "Load profiling", "Efficiency rating"],
  },
  {
    id: "conversions",
    name: "Unit Conversions",
    description: "Quick conversions between kW, HP, kVA, Amps, and more",
    icon: faExchangeAlt,
    color: "cyan",
    href: "/tools/conversions",
    features: ["kW ↔ HP", "kVA ↔ kW", "Amps ↔ kVA", "°C ↔ °F"],
  },
];

const industries = [
  { icon: faBuilding, name: "Construction Sites" },
  { icon: faCalendarAlt, name: "Events & Festivals" },
  { icon: faIndustry, name: "Industrial Shutdowns" },
  { icon: faHardHat, name: "Utilities & Infrastructure" },
  { icon: faCogs, name: "Film & Production" },
];

export default function Index() {
  const { leadSuccess } = useLoaderData<typeof loader>();
  
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-red-500/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800/50 via-gray-900/50 to-gray-950" />
        
        <nav className="relative z-10 border-b border-gray-800/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <Link to="/" className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500 to-red-500">
                  <FontAwesomeIcon icon={faBolt} className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">Power Industry</span>
              </Link>
              <div className="flex items-center gap-4">
                <Link
                  to="/tools"
                  className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
                >
                  All Tools
                </Link>
                <a
                  href="#contact"
                  className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-yellow-400 transition-colors"
                >
                  Speak to an Expert
                </a>
              </div>
            </div>
          </div>
        </nav>

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-500 ring-1 ring-inset ring-yellow-500/20">
              <FontAwesomeIcon icon={faCalculator} className="h-4 w-4" />
              Professional Power Sizing Tools
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Size Generators with
              <span className="block bg-gradient-to-r from-yellow-500 to-red-500 bg-clip-text text-transparent">
                Engineering Precision
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">
              Stop guessing generator sizes. Use industry-standard calculations to size 
              temporary power, estimate fuel costs, check voltage drop, and optimise 
              hybrid configurations.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/tools/power"
                className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-yellow-500/25 transition-all hover:shadow-yellow-500/40 hover:scale-105"
              >
                Start Power Calculator
                <FontAwesomeIcon
                  icon={faArrowRight}
                  className="h-4 w-4 transition-transform group-hover:translate-x-1"
                />
              </Link>
              <Link
                to="/tools"
                className="flex items-center gap-2 rounded-xl bg-gray-800 px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-gray-700"
              >
                View All Tools
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Tools Grid */}
      <section className="relative py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white">Professional Calculation Tools</h2>
            <p className="mt-4 text-lg text-gray-400">
              Everything you need to size and plan temporary power installations
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <Link
                key={tool.id}
                to={tool.href}
                className="group relative overflow-hidden rounded-2xl bg-gray-900 p-6 ring-1 ring-gray-800 transition-all hover:ring-2 hover:ring-yellow-500/50"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative">
                  <div
                    className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${
                      tool.color === "yellow"
                        ? "bg-yellow-500/20 text-yellow-500"
                        : tool.color === "red"
                        ? "bg-red-500/20 text-red-500"
                        : tool.color === "green"
                        ? "bg-green-500/20 text-green-500"
                        : tool.color === "blue"
                        ? "bg-blue-500/20 text-blue-500"
                        : tool.color === "purple"
                        ? "bg-purple-500/20 text-purple-500"
                        : "bg-cyan-500/20 text-cyan-500"
                    }`}
                  >
                    <FontAwesomeIcon icon={tool.icon} className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-yellow-500 transition-colors">
                    {tool.name}
                  </h3>
                  <p className="mt-2 text-sm text-gray-400">{tool.description}</p>
                  <ul className="mt-4 space-y-1">
                    {tool.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-xs text-gray-500">
                        <FontAwesomeIcon icon={faCheckCircle} className="h-3 w-3 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-center gap-2 text-sm font-medium text-yellow-500">
                    Open Tool
                    <FontAwesomeIcon
                      icon={faArrowRight}
                      className="h-3 w-3 transition-transform group-hover:translate-x-1"
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Industries Section */}
      <section className="border-y border-gray-800 bg-gray-900/50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium uppercase tracking-wider text-gray-500">
            Trusted by professionals across industries
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-8">
            {industries.map((industry) => (
              <div
                key={industry.name}
                className="flex items-center gap-3 text-gray-400"
              >
                <FontAwesomeIcon icon={industry.icon} className="h-5 w-5" />
                <span className="text-sm font-medium">{industry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold text-white">
                Professional Reports,
                <span className="block text-yellow-500">Ready for Clients</span>
              </h2>
              <p className="mt-4 text-lg text-gray-400">
                Generate polished PDF reports with your calculations, assumptions, 
                and recommendations. Perfect for client proposals and site documentation.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  "Transparent assumptions in every calculation",
                  "Downloadable PDF reports with your branding",
                  "Save and reuse calculations",
                  "Industry-standard formulas and safety factors",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <FontAwesomeIcon
                      icon={faCheckCircle}
                      className="mt-1 h-5 w-5 text-green-500"
                    />
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-6 py-3 font-semibold text-gray-900 hover:bg-yellow-400 transition-colors"
              >
                <FontAwesomeIcon icon={faFileDownload} className="h-4 w-4" />
                Speak to an Expert
              </a>
            </div>
            <div className="rounded-2xl bg-gray-900 p-8 ring-1 ring-gray-800">
              <div className="space-y-4">
                <div className="flex items-center gap-4 rounded-lg bg-gray-800 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/20">
                    <FontAwesomeIcon icon={faBolt} className="h-5 w-5 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Generator Sizing Report</p>
                    <p className="text-xs text-gray-400">250 kVA recommended for site loads</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-lg bg-gray-800 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/20">
                    <FontAwesomeIcon icon={faGasPump} className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Fuel Consumption Estimate</p>
                    <p className="text-xs text-gray-400">1,240L diesel over 72 hours</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-lg bg-gray-800 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
                    <FontAwesomeIcon icon={faBatteryThreeQuarters} className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Hybrid Savings</p>
                    <p className="text-xs text-gray-400">Save 35% fuel with 100kWh battery</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lead Capture Section */}
      <section id="contact" className="py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-yellow-500/10 to-red-500/10 p-8 md:p-12 ring-1 ring-yellow-500/20">
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              {/* Expert Info */}
              <div className="text-center md:text-left">
                <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 ring-1 ring-inset ring-green-500/20 mb-4">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Available Now
                </div>
                <h2 className="text-3xl font-bold text-white">
                  Need Help Sizing Your Project?
                </h2>
                <p className="mt-4 text-lg text-gray-400">
                  Speak directly with a power industry professional who can help you get the right equipment for your job.
                </p>
                <div className="mt-6 flex items-center gap-4 justify-center md:justify-start">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-yellow-500 to-red-500 flex items-center justify-center text-2xl font-bold text-white">
                    JP
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-semibold text-white">Jordan Prescott</p>
                    <p className="text-sm text-gray-400">Power Industry Specialist</p>
                    <p className="text-xs text-gray-500">15+ years experience in temporary power</p>
                  </div>
                </div>
              </div>

              {/* Contact Form */}
              <div className="rounded-2xl bg-gray-900/80 p-6 ring-1 ring-gray-800">
                {leadSuccess ? (
                  <div className="text-center py-8">
                    <div className="mx-auto h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                      <FontAwesomeIcon icon={faCheckCircle} className="h-8 w-8 text-green-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Thank You!</h3>
                    <p className="text-gray-400 mb-4">
                      Your enquiry has been received. Jordan will be in touch shortly.
                    </p>
                    <p className="text-sm text-gray-500">
                      Typical response time: within 2 hours during business hours
                    </p>
                  </div>
                ) : (
                <form action="/api/leads" method="POST" className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Your Name</label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      placeholder="John Smith"
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      placeholder="john@company.com"
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      placeholder="+44 7700 900000"
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-1">How Can We Help?</label>
                    <textarea
                      id="message"
                      name="message"
                      rows={3}
                      placeholder="Tell us about your project..."
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-gradient-to-r from-yellow-500 to-red-500 px-6 py-4 text-lg font-semibold text-white shadow-lg shadow-yellow-500/25 transition-all hover:shadow-yellow-500/40"
                  >
                    Request a Callback
                  </button>
                  <p className="text-xs text-gray-500 text-center">
                    We typically respond within 2 hours during business hours
                  </p>
                </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick CTA */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-gray-400 mb-4">Or try our free calculators - no account required</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/tools/power"
              className="rounded-xl bg-gray-800 px-8 py-4 text-lg font-semibold text-white hover:bg-gray-700 transition-colors"
            >
              Open Power Calculator
            </Link>
            <Link
              to="/tools"
              className="rounded-xl bg-gray-800 px-8 py-4 text-lg font-semibold text-white hover:bg-gray-700 transition-colors"
            >
              Browse All Tools
            </Link>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-gray-800 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-gray-500">
            <strong>Disclaimer:</strong> These calculators provide estimates based on 
            industry-standard formulas and typical assumptions. Actual requirements may 
            vary based on site conditions, equipment specifications, and local regulations. 
            Always consult with a qualified electrical engineer for critical installations.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
