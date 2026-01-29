// Unit Conversions Tool
import { json, type MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faExchangeAlt,
  faArrowLeft,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { unitConversions } from "~/services/calculations.shared";
import { Footer } from "~/components";

export const meta: MetaFunction = () => {
  return [
    { title: "Unit Conversions | Power Industry Calculator" },
    { name: "description", content: "Quick conversions between kW, HP, kVA, Amps, and more." },
  ];
};

export async function loader() {
  return json({});
}

type ConversionType = 
  | "kwToHp" | "hpToKw" 
  | "kvaToKw" | "kwToKva" 
  | "kvaToAmps" | "ampsToKva"
  | "gallonsToLitres" | "litresToGallons"
  | "feetToMeters" | "metersToFeet"
  | "celsiusToFahrenheit" | "fahrenheitToCelsius";

const conversionCategories = [
  {
    name: "Power",
    conversions: [
      { id: "kwToHp" as const, label: "kW → HP", from: "kW", to: "HP" },
      { id: "hpToKw" as const, label: "HP → kW", from: "HP", to: "kW" },
      { id: "kvaToKw" as const, label: "kVA → kW", from: "kVA", to: "kW", hasPF: true },
      { id: "kwToKva" as const, label: "kW → kVA", from: "kW", to: "kVA", hasPF: true },
    ],
  },
  {
    name: "Current",
    conversions: [
      { id: "kvaToAmps" as const, label: "kVA → Amps", from: "kVA", to: "A", hasVoltage: true, hasPhases: true },
      { id: "ampsToKva" as const, label: "Amps → kVA", from: "A", to: "kVA", hasVoltage: true, hasPhases: true },
    ],
  },
  {
    name: "Fuel",
    conversions: [
      { id: "gallonsToLitres" as const, label: "Gallons → Litres", from: "gal", to: "L" },
      { id: "litresToGallons" as const, label: "Litres → Gallons", from: "L", to: "gal" },
    ],
  },
  {
    name: "Length",
    conversions: [
      { id: "feetToMeters" as const, label: "Feet → Meters", from: "ft", to: "m" },
      { id: "metersToFeet" as const, label: "Meters → Feet", from: "m", to: "ft" },
    ],
  },
  {
    name: "Temperature",
    conversions: [
      { id: "celsiusToFahrenheit" as const, label: "°C → °F", from: "°C", to: "°F" },
      { id: "fahrenheitToCelsius" as const, label: "°F → °C", from: "°F", to: "°C" },
    ],
  },
];

export default function ConversionsPage() {
  const [values, setValues] = useState<Record<string, number>>({});
  const [powerFactor, setPowerFactor] = useState(0.8);
  const [voltage, setVoltage] = useState(400);
  const [phases, setPhases] = useState<1 | 3>(3);

  const handleConvert = (id: ConversionType, inputValue: number): number => {
    switch (id) {
      case "kwToHp":
        return unitConversions.kwToHp(inputValue);
      case "hpToKw":
        return unitConversions.hpToKw(inputValue);
      case "kvaToKw":
        return unitConversions.kvaToKw(inputValue, powerFactor);
      case "kwToKva":
        return unitConversions.kwToKva(inputValue, powerFactor);
      case "kvaToAmps":
        return unitConversions.kvaToAmps(inputValue, voltage, phases);
      case "ampsToKva":
        return unitConversions.ampsToKva(inputValue, voltage, phases);
      case "gallonsToLitres":
        return unitConversions.gallonsToLitres(inputValue);
      case "litresToGallons":
        return unitConversions.litresToGallons(inputValue);
      case "feetToMeters":
        return unitConversions.feetToMeters(inputValue);
      case "metersToFeet":
        return unitConversions.metersToFeet(inputValue);
      case "celsiusToFahrenheit":
        return unitConversions.celsiusToFahrenheit(inputValue);
      case "fahrenheitToCelsius":
        return unitConversions.fahrenheitToCelsius(inputValue);
      default:
        return 0;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500 to-red-500">
                <FontAwesomeIcon icon={faBolt} className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">Power Industry</span>
            </Link>
            <Link to="/#contact" className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-yellow-400">
              Speak to an Expert
            </Link>
          </div>
        </div>
      </header>

      <main className="py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Link to="/tools" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6">
            <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
            Back to Tools
          </Link>

          <div className="mb-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/20">
                <FontAwesomeIcon icon={faExchangeAlt} className="h-6 w-6 text-cyan-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Unit Conversions</h1>
                <p className="text-gray-400">Quick reference conversions for power industry calculations</p>
              </div>
            </div>
          </div>

          {/* Common Settings */}
          <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800 mb-8">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Common Settings</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Power Factor</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={powerFactor}
                  onChange={(e) => setPowerFactor(parseFloat(e.target.value) || 0.8)}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Voltage (V)</label>
                <select
                  value={voltage}
                  onChange={(e) => setVoltage(parseFloat(e.target.value))}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white"
                >
                  <option value={230}>230V</option>
                  <option value={400}>400V</option>
                  <option value={415}>415V</option>
                  <option value={480}>480V</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phases</label>
                <div className="flex gap-1">
                  {[1, 3].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPhases(p as 1 | 3)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        phases === p ? "bg-cyan-500 text-white" : "bg-gray-800 text-gray-300"
                      }`}
                    >
                      {p}φ
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Conversion Categories */}
          <div className="space-y-6">
            {conversionCategories.map((category) => (
              <div key={category.name} className="rounded-xl bg-gray-900 ring-1 ring-gray-800 overflow-hidden">
                <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-800">
                  <h3 className="font-medium text-white">{category.name}</h3>
                </div>
                <div className="divide-y divide-gray-800">
                  {category.conversions.map((conv) => {
                    const inputValue = values[conv.id] ?? 0;
                    const outputValue = handleConvert(conv.id, inputValue);

                    return (
                      <div key={conv.id} className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <label className="block text-xs text-gray-500 mb-1">{conv.from}</label>
                            <input
                              type="number"
                              step="any"
                              value={inputValue || ""}
                              onChange={(e) => setValues({ ...values, [conv.id]: parseFloat(e.target.value) || 0 })}
                              placeholder="0"
                              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white"
                            />
                          </div>
                          <div className="flex h-10 w-10 items-center justify-center text-cyan-500">
                            <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs text-gray-500 mb-1">{conv.to}</label>
                            <div className="w-full rounded-lg bg-gray-800/50 border border-gray-700 px-3 py-2 text-cyan-400 font-medium">
                              {inputValue ? outputValue.toFixed(2) : "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Reference */}
          <div className="mt-8 rounded-xl bg-gray-900 p-6 ring-1 ring-gray-800">
            <h3 className="font-medium text-white mb-4">Quick Reference Formulas</h3>
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div className="rounded-lg bg-gray-800 p-3">
                <p className="text-cyan-400 font-mono">kW = kVA × PF</p>
                <p className="text-xs text-gray-500 mt-1">Power Factor conversion</p>
              </div>
              <div className="rounded-lg bg-gray-800 p-3">
                <p className="text-cyan-400 font-mono">HP = kW × 1.341</p>
                <p className="text-xs text-gray-500 mt-1">Horsepower conversion</p>
              </div>
              <div className="rounded-lg bg-gray-800 p-3">
                <p className="text-cyan-400 font-mono">I = kVA × 1000 / (V × √3)</p>
                <p className="text-xs text-gray-500 mt-1">3-phase current</p>
              </div>
              <div className="rounded-lg bg-gray-800 p-3">
                <p className="text-cyan-400 font-mono">I = kVA × 1000 / V</p>
                <p className="text-xs text-gray-500 mt-1">Single-phase current</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-8 text-center">
            <Link
              to="/#contact"
              className="inline-flex items-center gap-2 rounded-lg bg-yellow-500/20 px-6 py-3 text-sm font-medium text-yellow-400 hover:bg-yellow-500/30 transition-colors ring-1 ring-yellow-500/30"
            >
              Need help with calculations? Speak to Jordan →
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
