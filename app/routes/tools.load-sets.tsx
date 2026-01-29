// Load-on-Demand Planner
import { json, type ActionFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faLayerGroup,
  faCalculator,
  faArrowLeft,
  faSpinner,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { calculateLoadSet, type LoadSetCalculationOutputs } from "~/services/calculations.server";
import { Footer } from "~/components";

export const meta: MetaFunction = () => {
  return [
    { title: "Load-on-Demand Planner | Power Industry Calculator" },
    { name: "description", content: "Configure optimal multi-generator setups with N+1 redundancy." },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  
  const inputs = {
    totalLoadKva: parseFloat(formData.get("totalLoadKva") as string) || 500,
    generatorSizes: (formData.get("generatorSizes") as string).split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n)),
    nPlusRedundancy: parseInt(formData.get("nPlusRedundancy") as string) || 1,
    loadProfileType: (formData.get("loadProfileType") as string) || "variable",
    peakLoadPercent: parseFloat(formData.get("peakLoadPercent") as string) || 100,
    averageLoadPercent: parseFloat(formData.get("averageLoadPercent") as string) || 60,
  };

  if (inputs.generatorSizes.length === 0) {
    inputs.generatorSizes = [100, 200, 300];
  }

  try {
    const result = calculateLoadSet(inputs as Parameters<typeof calculateLoadSet>[0]);
    return json({ result, inputs });
  } catch (error) {
    console.error("Calculation error:", error);
    return json({ error: "Invalid input data" }, { status: 400 });
  }
}

export default function LoadSetCalculator() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isCalculating = navigation.state === "submitting";

  const [totalLoadKva, setTotalLoadKva] = useState(500);
  const [generatorSizes, setGeneratorSizes] = useState("100, 200, 300");
  const [nPlusRedundancy, setNPlusRedundancy] = useState(1);
  const [loadProfileType, setLoadProfileType] = useState("variable");
  const [peakLoadPercent, setPeakLoadPercent] = useState(100);
  const [averageLoadPercent, setAverageLoadPercent] = useState(60);

  const result = actionData && "result" in actionData ? actionData.result as LoadSetCalculationOutputs : null;
  const error = actionData && "error" in actionData ? actionData.error : null;

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
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20">
                <FontAwesomeIcon icon={faLayerGroup} className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Load-on-Demand Planner</h1>
                <p className="text-gray-400">Configure optimal multi-generator setups with redundancy</p>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <Form method="post" className="space-y-6">
              <div className="rounded-xl bg-gray-900 p-6 ring-1 ring-gray-800 space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Total Load Required (kVA)</label>
                  <input
                    type="number"
                    name="totalLoadKva"
                    min="1"
                    value={totalLoadKva}
                    onChange={(e) => setTotalLoadKva(parseFloat(e.target.value))}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Available Generator Sizes (kVA)</label>
                  <input
                    type="text"
                    name="generatorSizes"
                    value={generatorSizes}
                    onChange={(e) => setGeneratorSizes(e.target.value)}
                    placeholder="100, 200, 300"
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">Comma-separated list of available sizes</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Redundancy Level</label>
                  <div className="flex gap-2">
                    {[0, 1, 2].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNPlusRedundancy(n)}
                        className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                          nPlusRedundancy === n ? "bg-purple-500 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        N+{n}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="nPlusRedundancy" value={nPlusRedundancy} />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Load Profile Type</label>
                  <div className="flex gap-2">
                    {["constant", "variable", "stepped"].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setLoadProfileType(type)}
                        className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium capitalize transition-colors ${
                          loadProfileType === type ? "bg-purple-500 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="loadProfileType" value={loadProfileType} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Peak Load (%)</label>
                    <input
                      type="number"
                      name="peakLoadPercent"
                      min="1"
                      max="100"
                      value={peakLoadPercent}
                      onChange={(e) => setPeakLoadPercent(parseFloat(e.target.value))}
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Average Load (%)</label>
                    <input
                      type="number"
                      name="averageLoadPercent"
                      min="1"
                      max="100"
                      value={averageLoadPercent}
                      onChange={(e) => setAverageLoadPercent(parseFloat(e.target.value))}
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isCalculating}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:shadow-purple-500/40 disabled:opacity-50"
              >
                {isCalculating ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} className="h-5 w-5 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCalculator} className="h-5 w-5" />
                    Find Optimal Configuration
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
                  {/* Configuration */}
                  <div className="rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-6 ring-1 ring-purple-500/20">
                    <h3 className="font-medium text-white mb-4">Optimal Configuration</h3>
                    <div className="space-y-2">
                      {result.optimalConfiguration.map((config, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-gray-900/50 p-3">
                          <span className="text-gray-300">{config.count}× Generator</span>
                          <span className="text-xl font-bold text-purple-400">{config.sizeKva} kVA</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Total Installed</span>
                        <span className="text-white font-medium">{result.totalInstalledKva} kVA</span>
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800 text-center">
                      <p className="text-xs text-gray-500 mb-1">Redundancy</p>
                      <p className="text-2xl font-bold text-purple-400">{result.redundancyPercent.toFixed(0)}%</p>
                    </div>
                    <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800 text-center">
                      <p className="text-xs text-gray-500 mb-1">Utilization</p>
                      <p className="text-2xl font-bold text-white">{result.utilizationPercent.toFixed(0)}%</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Fuel Efficiency Rating</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        result.fuelEfficiencyRating === "Excellent" ? "bg-green-500/20 text-green-400" :
                        result.fuelEfficiencyRating === "Good" ? "bg-blue-500/20 text-blue-400" :
                        result.fuelEfficiencyRating === "Moderate" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>
                        {result.fuelEfficiencyRating}
                      </span>
                    </div>
                  </div>

                  {/* Assumptions */}
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
                    to="/#contact"
                    className="flex items-center justify-center gap-2 w-full rounded-lg bg-yellow-500/20 px-4 py-3 text-sm font-medium text-yellow-400 hover:bg-yellow-500/30 transition-colors ring-1 ring-yellow-500/30"
                  >
                    Discuss Setup with Jordan →
                  </Link>
                </>
              )}

              {!result && !error && (
                <div className="rounded-xl bg-gray-900 p-8 ring-1 ring-gray-800 text-center">
                  <FontAwesomeIcon icon={faLayerGroup} className="h-12 w-12 text-gray-700 mb-4" />
                  <p className="text-gray-400">Enter your load requirements to find the optimal generator configuration</p>
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
