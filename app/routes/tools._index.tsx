// Power Industry Calculator - Tools Overview
import { json, type MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faGasPump,
  faBatteryThreeQuarters,
  faPlug,
  faLayerGroup,
  faExchangeAlt,
  faArrowRight,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import { Footer } from "~/components";

export const meta: MetaFunction = () => {
  return [
    { title: "All Tools | Power Industry Calculator" },
    { name: "description", content: "Professional power calculation tools for generators, fuel, voltage drop, and more." },
  ];
};

export async function loader() {
  return json({});
}

const tools = [
  {
    id: "power",
    name: "Power Requirement Finder",
    description: "Calculate the right generator size from your load list. Includes diversity factors, motor starting currents, and altitude/temperature derating.",
    icon: faBolt,
    color: "yellow",
    href: "/tools/power",
  },
  {
    id: "fuel",
    name: "Fuel & Cost Calculator",
    description: "Estimate fuel consumption and costs for diesel, petrol, or gas generators. Includes CO₂ emissions and tank refill planning.",
    icon: faGasPump,
    color: "red",
    href: "/tools/fuel",
  },
  {
    id: "hybrid",
    name: "Hybrid Savings Estimator",
    description: "Compare baseline generator-only operations with battery-hybrid configurations. Calculate potential fuel and emissions savings.",
    icon: faBatteryThreeQuarters,
    color: "green",
    href: "/tools/hybrid",
  },
  {
    id: "cables",
    name: "Voltage Drop Calculator",
    description: "Check if your cable run will meet voltage drop requirements. Supports single and three-phase, copper and aluminium cables.",
    icon: faPlug,
    color: "blue",
    href: "/tools/cables",
  },
  {
    id: "load-sets",
    name: "Load-on-Demand Planner",
    description: "Configure optimal multi-generator setups with N+1 redundancy. Find the most efficient generator combination for your load profile.",
    icon: faLayerGroup,
    color: "purple",
    href: "/tools/load-sets",
  },
  {
    id: "conversions",
    name: "Unit Conversions",
    description: "Quick reference conversions between kW, HP, kVA, Amps, and more. Essential formulas at your fingertips.",
    icon: faExchangeAlt,
    color: "cyan",
    href: "/tools/conversions",
  },
];

export default function ToolsIndex() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800">
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
                to="/#contact"
                className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-yellow-400 transition-colors"
              >
                Speak to an Expert
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-8">
            <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
            Back to Home
          </Link>

          <div className="mb-12">
            <h1 className="text-3xl font-bold text-white">All Calculation Tools</h1>
            <p className="mt-2 text-lg text-gray-400">
              Select a tool to get started. All calculations are free to use, no account required.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <Link
                key={tool.id}
                to={tool.href}
                className="group relative overflow-hidden rounded-2xl bg-gray-900 p-6 ring-1 ring-gray-800 transition-all hover:ring-2 hover:ring-yellow-500/50"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative">
                  <div
                    className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl ${
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
                    <FontAwesomeIcon icon={tool.icon} className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-semibold text-white group-hover:text-yellow-500 transition-colors">
                    {tool.name}
                  </h3>
                  <p className="mt-2 text-sm text-gray-400 leading-relaxed">{tool.description}</p>
                  <div className="mt-6 flex items-center gap-2 text-sm font-medium text-yellow-500">
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
      </main>

      <Footer />
    </div>
  );
}
