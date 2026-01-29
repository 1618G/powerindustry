// Power Requirement Finder - Main Calculator Tool
import { json, type ActionFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faPlus,
  faTrash,
  faCalculator,
  faArrowLeft,
  faSpinner,
  faCheckCircle,
  faExclamationTriangle,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { calculatePower, type PowerLoad, type PowerCalculationOutputs } from "~/services/calculations.server";
import { Footer } from "~/components";

export const meta: MetaFunction = () => {
  return [
    { title: "Power Requirement Finder | Power Industry Calculator" },
    { name: "description", content: "Calculate generator size from your load list with diversity factors and motor starting." },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  
  // Parse loads from form data
  const loadsJson = formData.get("loads") as string;
  const headroomPercent = parseFloat(formData.get("headroomPercent") as string) || 20;
  const altitudeMeters = parseFloat(formData.get("altitudeMeters") as string) || 0;
  const ambientTempC = parseFloat(formData.get("ambientTempC") as string) || 25;

  try {
    const loads: PowerLoad[] = JSON.parse(loadsJson);
    
    if (loads.length === 0) {
      return json({ error: "Please add at least one load" }, { status: 400 });
    }

    const result = calculatePower({
      loads,
      headroomPercent,
      altitudeMeters,
      ambientTempC,
    });

    return json({ result, inputs: { loads, headroomPercent, altitudeMeters, ambientTempC } });
  } catch (error) {
    console.error("Calculation error:", error);
    return json({ error: "Invalid input data" }, { status: 400 });
  }
}

const defaultLoad: PowerLoad = {
  name: "",
  quantity: 1,
  ratingKw: 0,
  powerFactor: 0.8,
  startMultiplier: 1.0,
  diversityFactor: 1.0,
};

const commonLoads = [
  { name: "Lighting Tower (LED)", kw: 6, pf: 0.9, start: 1.0, diversity: 1.0 },
  { name: "Welfare Unit", kw: 15, pf: 0.85, start: 1.2, diversity: 0.8 },
  { name: "Small Compressor", kw: 7.5, pf: 0.75, start: 3.0, diversity: 0.7 },
  { name: "Welder (MIG)", kw: 8, pf: 0.7, start: 1.0, diversity: 0.6 },
  { name: "Concrete Pump", kw: 22, pf: 0.8, start: 4.0, diversity: 0.5 },
  { name: "Tower Crane", kw: 45, pf: 0.75, start: 3.5, diversity: 0.7 },
  { name: "Office Cabin (AC)", kw: 10, pf: 0.85, start: 2.0, diversity: 0.8 },
  { name: "Electric Heater", kw: 3, pf: 1.0, start: 1.0, diversity: 0.9 },
];

export default function PowerCalculator() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isCalculating = navigation.state === "submitting";

  const [loads, setLoads] = useState<PowerLoad[]>([{ ...defaultLoad }]);
  const [headroomPercent, setHeadroomPercent] = useState(20);
  const [altitudeMeters, setAltitudeMeters] = useState(0);
  const [ambientTempC, setAmbientTempC] = useState(25);

  const addLoad = () => {
    setLoads([...loads, { ...defaultLoad }]);
  };

  const removeLoad = (index: number) => {
    setLoads(loads.filter((_, i) => i !== index));
  };

  const updateLoad = (index: number, field: keyof PowerLoad, value: string | number) => {
    const updated = [...loads];
    (updated[index] as Record<string, unknown>)[field] = typeof value === "string" && field !== "name" ? parseFloat(value) || 0 : value;
    setLoads(updated);
  };

  const addCommonLoad = (common: typeof commonLoads[0]) => {
    setLoads([...loads, {
      name: common.name,
      quantity: 1,
      ratingKw: common.kw,
      powerFactor: common.pf,
      startMultiplier: common.start,
      diversityFactor: common.diversity,
    }]);
  };

  const result = actionData && "result" in actionData ? actionData.result as PowerCalculationOutputs : null;
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
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Link to="/tools" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6">
            <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
            Back to Tools
          </Link>

          <div className="mb-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-500/20">
                <FontAwesomeIcon icon={faBolt} className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Power Requirement Finder</h1>
                <p className="text-gray-400">Calculate the right generator size from your load list</p>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            {/* Input Section */}
            <div className="lg:col-span-2 space-y-6">
              {/* Quick Add */}
              <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800">
                <h3 className="text-sm font-medium text-gray-400 mb-3">Quick Add Common Loads</h3>
                <div className="flex flex-wrap gap-2">
                  {commonLoads.map((common) => (
                    <button
                      key={common.name}
                      type="button"
                      onClick={() => addCommonLoad(common)}
                      className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      {common.name} ({common.kw}kW)
                    </button>
                  ))}
                </div>
              </div>

              {/* Load List */}
              <Form method="post" className="space-y-4">
                <input type="hidden" name="loads" value={JSON.stringify(loads)} />
                <input type="hidden" name="headroomPercent" value={headroomPercent} />
                <input type="hidden" name="altitudeMeters" value={altitudeMeters} />
                <input type="hidden" name="ambientTempC" value={ambientTempC} />

                <div className="rounded-xl bg-gray-900 ring-1 ring-gray-800 overflow-hidden">
                  <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-800">
                    <h3 className="font-medium text-white">Load List</h3>
                  </div>
                  
                  <div className="divide-y divide-gray-800">
                    {loads.map((load, index) => (
                      <div key={index} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-400">Load {index + 1}</span>
                          {loads.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLoad(index)}
                              className="text-red-400 hover:text-red-300 transition-colors"
                            >
                              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="sm:col-span-2 lg:col-span-1">
                            <label className="block text-xs text-gray-500 mb-1">Description</label>
                            <input
                              type="text"
                              value={load.name}
                              onChange={(e) => updateLoad(index, "name", e.target.value)}
                              placeholder="e.g., Lighting Tower"
                              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={load.quantity}
                              onChange={(e) => updateLoad(index, "quantity", e.target.value)}
                              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Rating (kW)</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={load.ratingKw}
                              onChange={(e) => updateLoad(index, "ratingKw", e.target.value)}
                              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Power Factor</label>
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max="1"
                              value={load.powerFactor}
                              onChange={(e) => updateLoad(index, "powerFactor", e.target.value)}
                              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Start Multiplier</label>
                            <input
                              type="number"
                              step="0.5"
                              min="1"
                              value={load.startMultiplier}
                              onChange={(e) => updateLoad(index, "startMultiplier", e.target.value)}
                              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Diversity Factor</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="1"
                              value={load.diversityFactor}
                              onChange={(e) => updateLoad(index, "diversityFactor", e.target.value)}
                              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="p-4 border-t border-gray-800">
                    <button
                      type="button"
                      onClick={addLoad}
                      className="flex items-center gap-2 text-sm font-medium text-yellow-500 hover:text-yellow-400 transition-colors"
                    >
                      <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
                      Add Another Load
                    </button>
                  </div>
                </div>

                {/* Settings */}
                <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800">
                  <h3 className="font-medium text-white mb-4">Calculation Settings</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Headroom (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={headroomPercent}
                        onChange={(e) => setHeadroomPercent(parseFloat(e.target.value) || 20)}
                        className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Altitude (m)</label>
                      <input
                        type="number"
                        min="0"
                        value={altitudeMeters}
                        onChange={(e) => setAltitudeMeters(parseFloat(e.target.value) || 0)}
                        className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ambient Temp (°C)</label>
                      <input
                        type="number"
                        value={ambientTempC}
                        onChange={(e) => setAmbientTempC(parseFloat(e.target.value) || 25)}
                        className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCalculating}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500 px-6 py-4 text-lg font-semibold text-white shadow-lg shadow-yellow-500/25 transition-all hover:shadow-yellow-500/40 disabled:opacity-50"
                >
                  {isCalculating ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} className="h-5 w-5 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faCalculator} className="h-5 w-5" />
                      Calculate Generator Size
                    </>
                  )}
                </button>
              </Form>
            </div>

            {/* Results Section */}
            <div className="space-y-6">
              {error && (
                <div className="rounded-xl bg-red-500/10 p-4 ring-1 ring-red-500/20">
                  <div className="flex items-center gap-2 text-red-400">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="h-4 w-4" />
                    <span className="font-medium">{error}</span>
                  </div>
                </div>
              )}

              {result && (
                <>
                  {/* Main Result */}
                  <div className="rounded-xl bg-gradient-to-br from-yellow-500/10 to-red-500/10 p-6 ring-1 ring-yellow-500/20">
                    <div className="text-center">
                      <p className="text-sm text-gray-400 mb-2">Recommended Generator Size</p>
                      <p className="text-5xl font-bold text-yellow-500">{result.recommendedGeneratorKva}</p>
                      <p className="text-xl text-gray-300 mt-1">kVA</p>
                    </div>
                  </div>

                  {/* Size Options */}
                  <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800">
                    <h3 className="font-medium text-white mb-3">Generator Size Options</h3>
                    <div className="space-y-2">
                      {result.generatorSizeOptions.map((option, i) => (
                        <div
                          key={option.kva}
                          className={`flex items-center justify-between rounded-lg p-3 ${
                            i === 0 ? "bg-yellow-500/20 ring-1 ring-yellow-500/30" : "bg-gray-800"
                          }`}
                        >
                          <span className="font-medium text-white">{option.kva} kVA</span>
                          <span className={`text-sm ${i === 0 ? "text-yellow-500" : "text-gray-400"}`}>
                            {i === 0 ? (
                              <span className="flex items-center gap-1">
                                <FontAwesomeIcon icon={faCheckCircle} className="h-3 w-3" />
                                Recommended
                              </span>
                            ) : (
                              "Alternative"
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800">
                    <h3 className="font-medium text-white mb-3">Load Breakdown</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Running Load</span>
                        <span className="text-white font-medium">{result.totalRunningKw.toFixed(1)} kW</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Diversified Load</span>
                        <span className="text-white font-medium">{result.totalDiversifiedKw.toFixed(1)} kW</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Peak Demand (with starts)</span>
                        <span className="text-white font-medium">{result.peakDemandKw.toFixed(1)} kW</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Peak Demand (kVA)</span>
                        <span className="text-white font-medium">{result.peakDemandKva.toFixed(1)} kVA</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Average Power Factor</span>
                        <span className="text-white font-medium">{result.averagePowerFactor.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Assumptions */}
                  <div className="rounded-xl bg-gray-900 p-4 ring-1 ring-gray-800">
                    <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faInfoCircle} className="h-4 w-4 text-blue-400" />
                      Assumptions
                    </h3>
                    <ul className="space-y-1 text-sm text-gray-400">
                      {result.assumptions.map((assumption, i) => (
                        <li key={i}>• {assumption}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <Link
                      to="/tools/fuel"
                      className="flex items-center justify-center gap-2 w-full rounded-lg bg-gray-800 px-4 py-3 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
                    >
                      Calculate Fuel Requirements →
                    </Link>
                    <Link
                      to="/#contact"
                      className="flex items-center justify-center gap-2 w-full rounded-lg bg-yellow-500/20 px-4 py-3 text-sm font-medium text-yellow-400 hover:bg-yellow-500/30 transition-colors ring-1 ring-yellow-500/30"
                    >
                      Need Help? Speak to Jordan →
                    </Link>
                  </div>
                </>
              )}

              {!result && !error && (
                <div className="rounded-xl bg-gray-900 p-8 ring-1 ring-gray-800 text-center">
                  <FontAwesomeIcon icon={faCalculator} className="h-12 w-12 text-gray-700 mb-4" />
                  <p className="text-gray-400">Add your loads and click calculate to see results</p>
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
