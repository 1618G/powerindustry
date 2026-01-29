// Hybrid Savings Estimator
import { json, type ActionFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faBatteryThreeQuarters,
  faCalculator,
  faArrowLeft,
  faSpinner,
  faLeaf,
  faInfoCircle,
  faArrowDown,
  faArrowUp,
} from "@fortawesome/free-solid-svg-icons";
import { calculateHybrid, type HybridCalculationOutputs } from "~/services/calculations.server";
import { Footer } from "~/components";

export const meta: MetaFunction = () => {
  return [
    { title: "Hybrid Savings Estimator | Power Industry Calculator" },
    { name: "description", content: "Compare baseline vs hybrid generator configurations for fuel and emissions savings." },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  
  const inputs = {
    baselineGeneratorKva: parseFloat(formData.get("baselineGeneratorKva") as string) || 200,
    baselineLoadPercent: parseFloat(formData.get("baselineLoadPercent") as string) || 75,
    baselineRuntimeHours: parseFloat(formData.get("baselineRuntimeHours") as string) || 168,
    batteryCapacityKwh: parseFloat(formData.get("batteryCapacityKwh") as string) || 100,
    hybridLoadPercent: parseFloat(formData.get("hybridLoadPercent") as string) || 50,
    peakShavingEnabled: formData.get("peakShavingEnabled") === "true",
    fuelCostPerLitre: parseFloat(formData.get("fuelCostPerLitre") as string) || 1.50,
  };

  try {
    const result = calculateHybrid(inputs);
    return json({ result, inputs });
  } catch (error) {
    console.error("Calculation error:", error);
    return json({ error: "Invalid input data" }, { status: 400 });
  }
}

const standardSizes = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
const batterySizes = [30, 50, 100, 150, 200, 300, 500];

export default function HybridCalculator() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isCalculating = navigation.state === "submitting";

  const [baselineGeneratorKva, setBaselineGeneratorKva] = useState(200);
  const [baselineLoadPercent, setBaselineLoadPercent] = useState(75);
  const [baselineRuntimeHours, setBaselineRuntimeHours] = useState(168);
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState(100);
  const [hybridLoadPercent, setHybridLoadPercent] = useState(50);
  const [peakShavingEnabled, setPeakShavingEnabled] = useState(true);
  const [fuelCostPerLitre, setFuelCostPerLitre] = useState(1.50);

  const result = actionData && "result" in actionData ? actionData.result as HybridCalculationOutputs : null;
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
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/20">
                <FontAwesomeIcon icon={faBatteryThreeQuarters} className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Hybrid Savings Estimator</h1>
                <p className="text-gray-400">Compare traditional vs battery-hybrid configurations</p>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <Form method="post" className="space-y-6">
              {/* Baseline Configuration */}
              <div className="rounded-xl bg-gray-900 p-6 ring-1 ring-gray-800 space-y-4">
                <h3 className="font-medium text-white flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Baseline (Generator Only)
                </h3>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Generator Size (kVA)</label>
                  <select
                    name="baselineGeneratorKva"
                    value={baselineGeneratorKva}
                    onChange={(e) => setBaselineGeneratorKva(parseFloat(e.target.value))}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                  >
                    {standardSizes.map((size) => (
                      <option key={size} value={size}>{size} kVA</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Average Load (%)</label>
                  <input
                    type="range"
                    name="baselineLoadPercent"
                    min="25"
                    max="100"
                    step="5"
                    value={baselineLoadPercent}
                    onChange={(e) => setBaselineLoadPercent(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>25%</span>
                    <span className="text-white font-medium">{baselineLoadPercent}%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Runtime (hours)</label>
                  <input
                    type="number"
                    name="baselineRuntimeHours"
                    min="1"
                    value={baselineRuntimeHours}
                    onChange={(e) => setBaselineRuntimeHours(parseFloat(e.target.value))}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">168 hours = 1 week</p>
                </div>
              </div>

              {/* Hybrid Configuration */}
              <div className="rounded-xl bg-gray-900 p-6 ring-1 ring-gray-800 space-y-4">
                <h3 className="font-medium text-white flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Hybrid Configuration
                </h3>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Battery Capacity (kWh)</label>
                  <select
                    name="batteryCapacityKwh"
                    value={batteryCapacityKwh}
                    onChange={(e) => setBatteryCapacityKwh(parseFloat(e.target.value))}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                  >
                    {batterySizes.map((size) => (
                      <option key={size} value={size}>{size} kWh</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Generator Load with Battery (%)</label>
                  <input
                    type="range"
                    name="hybridLoadPercent"
                    min="25"
                    max="100"
                    step="5"
                    value={hybridLoadPercent}
                    onChange={(e) => setHybridLoadPercent(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>25%</span>
                    <span className="text-white font-medium">{hybridLoadPercent}%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-400">Peak Shaving Enabled</label>
                  <button
                    type="button"
                    onClick={() => setPeakShavingEnabled(!peakShavingEnabled)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      peakShavingEnabled ? "bg-green-500" : "bg-gray-700"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      peakShavingEnabled ? "translate-x-5" : ""
                    }`} />
                  </button>
                  <input type="hidden" name="peakShavingEnabled" value={peakShavingEnabled.toString()} />
                </div>
              </div>

              {/* Fuel Cost */}
              <div className="rounded-xl bg-gray-900 p-6 ring-1 ring-gray-800">
                <label className="block text-sm text-gray-400 mb-1">Fuel Cost (£/litre)</label>
                <input
                  type="number"
                  name="fuelCostPerLitre"
                  step="0.01"
                  min="0"
                  value={fuelCostPerLitre}
                  onChange={(e) => setFuelCostPerLitre(parseFloat(e.target.value))}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                />
              </div>

              <button
                type="submit"
                disabled={isCalculating}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:shadow-green-500/40 disabled:opacity-50"
              >
                {isCalculating ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} className="h-5 w-5 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCalculator} className="h-5 w-5" />
                    Compare Savings
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
                  {/* Savings Summary */}
                  <div className="rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 p-6 ring-1 ring-green-500/20 text-center">
                    <p className="text-sm text-gray-400 mb-1">Potential Fuel Savings</p>
                    <p className="text-4xl font-bold text-green-500">{result.savingsPercent.toFixed(0)}%</p>
                    <p className="text-lg text-white mt-2">£{result.costSavings.toFixed(0)} saved</p>
                  </div>

                  {/* Comparison */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800">
                      <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        Baseline
                      </p>
                      <p className="text-2xl font-bold text-white">{result.baselineFuelLitres.toFixed(0)}L</p>
                      <p className="text-sm text-gray-400">£{result.baselineCost.toFixed(0)}</p>
                    </div>
                    <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800">
                      <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Hybrid
                      </p>
                      <p className="text-2xl font-bold text-green-400">{result.hybridFuelLitres.toFixed(0)}L</p>
                      <p className="text-sm text-gray-400">£{result.hybridCost.toFixed(0)}</p>
                    </div>
                  </div>

                  {/* Environmental */}
                  <div className="rounded-xl bg-gray-900 p-6 ring-1 ring-gray-800">
                    <h3 className="font-medium text-white mb-4 flex items-center gap-2">
                      <FontAwesomeIcon icon={faLeaf} className="h-4 w-4 text-green-500" />
                      Environmental Impact
                    </h3>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">CO₂ Reduction</span>
                      <span className="text-xl font-bold text-green-400 flex items-center gap-1">
                        <FontAwesomeIcon icon={faArrowDown} className="h-4 w-4" />
                        {result.co2ReductionKg.toFixed(0)} kg
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
                    Discuss Hybrid Options with Jordan →
                  </Link>
                </>
              )}

              {!result && !error && (
                <div className="rounded-xl bg-gray-900 p-8 ring-1 ring-gray-800 text-center">
                  <FontAwesomeIcon icon={faBatteryThreeQuarters} className="h-12 w-12 text-gray-700 mb-4" />
                  <p className="text-gray-400">Configure your baseline and hybrid setup to see potential savings</p>
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
