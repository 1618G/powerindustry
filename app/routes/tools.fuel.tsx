// Fuel & Cost Calculator
import { json, type ActionFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faGasPump,
  faCalculator,
  faArrowLeft,
  faDownload,
  faSpinner,
  faLeaf,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { calculateFuel, type FuelCalculationOutputs } from "~/services/calculations.server";
import { Footer } from "~/components";

export const meta: MetaFunction = () => {
  return [
    { title: "Fuel & Cost Calculator | Power Industry Calculator" },
    { name: "description", content: "Estimate fuel consumption, costs, and CO₂ emissions for generators." },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  
  const generatorSizeKva = parseFloat(formData.get("generatorSizeKva") as string) || 100;
  const loadPercent = parseFloat(formData.get("loadPercent") as string) || 75;
  const runtimeHours = parseFloat(formData.get("runtimeHours") as string) || 24;
  const fuelType = (formData.get("fuelType") as string) || "diesel";
  const fuelCostPerLitre = parseFloat(formData.get("fuelCostPerLitre") as string) || 1.50;

  try {
    const result = calculateFuel({
      generatorSizeKva,
      loadPercent,
      runtimeHours,
      fuelType: fuelType as "diesel" | "petrol" | "gas",
      fuelCostPerLitre,
    });

    return json({ result, inputs: { generatorSizeKva, loadPercent, runtimeHours, fuelType, fuelCostPerLitre } });
  } catch (error) {
    console.error("Calculation error:", error);
    return json({ error: "Invalid input data" }, { status: 400 });
  }
}

const standardSizes = [20, 30, 40, 50, 60, 80, 100, 125, 150, 200, 250, 300, 400, 500, 600, 750, 800, 1000];

export default function FuelCalculator() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isCalculating = navigation.state === "submitting";

  const [generatorSizeKva, setGeneratorSizeKva] = useState(100);
  const [loadPercent, setLoadPercent] = useState(75);
  const [runtimeHours, setRuntimeHours] = useState(24);
  const [fuelType, setFuelType] = useState("diesel");
  const [fuelCostPerLitre, setFuelCostPerLitre] = useState(1.50);

  const result = actionData && "result" in actionData ? actionData.result as FuelCalculationOutputs : null;
  const error = actionData && "error" in actionData ? actionData.error : null;

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

      <main className="py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Link to="/tools" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6">
            <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
            Back to Tools
          </Link>

          <div className="mb-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/20">
                <FontAwesomeIcon icon={faGasPump} className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Fuel & Cost Calculator</h1>
                <p className="text-gray-400">Estimate fuel consumption, costs, and CO₂ emissions</p>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Input Form */}
            <Form method="post" className="space-y-6">
              <div className="rounded-xl bg-gray-900 p-6 ring-1 ring-gray-800 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Generator Size (kVA)</label>
                  <select
                    name="generatorSizeKva"
                    value={generatorSizeKva}
                    onChange={(e) => setGeneratorSizeKva(parseFloat(e.target.value))}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white focus:ring-2 focus:ring-red-500"
                  >
                    {standardSizes.map((size) => (
                      <option key={size} value={size}>{size} kVA</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Load Percentage</label>
                  <div className="flex gap-2">
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setLoadPercent(pct)}
                        className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                          loadPercent === pct
                            ? "bg-red-500 text-white"
                            : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="loadPercent" value={loadPercent} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Runtime (hours)</label>
                  <input
                    type="number"
                    name="runtimeHours"
                    min="1"
                    value={runtimeHours}
                    onChange={(e) => setRuntimeHours(parseFloat(e.target.value) || 24)}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Fuel Type</label>
                  <div className="flex gap-2">
                    {["diesel", "petrol", "gas"].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFuelType(type)}
                        className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium capitalize transition-colors ${
                          fuelType === type
                            ? "bg-red-500 text-white"
                            : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="fuelType" value={fuelType} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Fuel Cost (£/litre)</label>
                  <input
                    type="number"
                    name="fuelCostPerLitre"
                    step="0.01"
                    min="0"
                    value={fuelCostPerLitre}
                    onChange={(e) => setFuelCostPerLitre(parseFloat(e.target.value) || 1.50)}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isCalculating}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:shadow-red-500/40 disabled:opacity-50"
              >
                {isCalculating ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} className="h-5 w-5 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCalculator} className="h-5 w-5" />
                    Calculate Fuel
                  </>
                )}
              </button>
            </Form>

            {/* Results */}
            <div className="space-y-6">
              {error && (
                <div className="rounded-xl bg-red-500/10 p-4 ring-1 ring-red-500/20 text-red-400">
                  {error}
                </div>
              )}

              {result && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-gradient-to-br from-red-500/10 to-orange-500/10 p-6 ring-1 ring-red-500/20 text-center">
                      <p className="text-sm text-gray-400 mb-1">Total Fuel</p>
                      <p className="text-3xl font-bold text-red-500">{result.totalLitres.toFixed(0)}</p>
                      <p className="text-gray-300">litres</p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 p-6 ring-1 ring-green-500/20 text-center">
                      <p className="text-sm text-gray-400 mb-1">Total Cost</p>
                      <p className="text-3xl font-bold text-green-500">£{result.totalCost.toFixed(0)}</p>
                      <p className="text-gray-300">estimated</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-900 p-6 ring-1 ring-gray-800">
                    <h3 className="font-medium text-white mb-4">Consumption Details</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Consumption Rate</span>
                        <span className="text-white font-medium">{result.consumptionLitresPerHour.toFixed(1)} L/hour</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Tank Refills (1000L)</span>
                        <span className="text-white font-medium">{result.tankRefillsNeeded} refills</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-800 pt-3">
                        <span className="text-gray-400 flex items-center gap-2">
                          <FontAwesomeIcon icon={faLeaf} className="h-4 w-4 text-green-500" />
                          CO₂ Emissions
                        </span>
                        <span className="text-white font-medium">{result.co2EmissionsKg.toFixed(0)} kg</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800">
                    <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faInfoCircle} className="h-4 w-4 text-blue-400" />
                      Assumptions
                    </h3>
                    <ul className="space-y-1 text-sm text-gray-400">
                      {result.assumptions.map((a, i) => <li key={i}>• {a}</li>)}
                    </ul>
                  </div>

                  <Link
                    to="/tools/hybrid"
                    className="flex items-center justify-center gap-2 w-full rounded-lg bg-green-500/20 px-4 py-3 text-sm font-medium text-green-400 hover:bg-green-500/30 transition-colors ring-1 ring-green-500/30"
                  >
                    See Hybrid Savings →
                  </Link>
                </>
              )}

              {!result && !error && (
                <div className="rounded-xl bg-gray-900 p-8 ring-1 ring-gray-800 text-center">
                  <FontAwesomeIcon icon={faGasPump} className="h-12 w-12 text-gray-700 mb-4" />
                  <p className="text-gray-400">Enter generator details to calculate fuel consumption</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
