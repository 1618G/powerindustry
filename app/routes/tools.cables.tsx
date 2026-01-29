// Voltage Drop Calculator
import { json, type ActionFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faPlug,
  faCalculator,
  faArrowLeft,
  faSpinner,
  faCheckCircle,
  faExclamationTriangle,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { calculateCable, type CableCalculationOutputs } from "~/services/calculations.server";
import { Footer } from "~/components";

export const meta: MetaFunction = () => {
  return [
    { title: "Voltage Drop Calculator | Power Industry Calculator" },
    { name: "description", content: "Check cable sizing to ensure voltage drop is within acceptable limits." },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  
  const inputs = {
    currentAmps: parseFloat(formData.get("currentAmps") as string) || 100,
    lengthMeters: parseFloat(formData.get("lengthMeters") as string) || 50,
    cableSizeMm2: parseFloat(formData.get("cableSizeMm2") as string) || 25,
    cableType: (formData.get("cableType") as string) || "copper",
    voltage: parseFloat(formData.get("voltage") as string) || 400,
    phases: parseInt(formData.get("phases") as string) as 1 | 3 || 3,
    maxVoltageDrop: parseFloat(formData.get("maxVoltageDrop") as string) || 3,
  };

  try {
    const result = calculateCable(inputs as Parameters<typeof calculateCable>[0]);
    return json({ result, inputs });
  } catch (error) {
    console.error("Calculation error:", error);
    return json({ error: "Invalid input data" }, { status: 400 });
  }
}

const cableSizes = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];

export default function CableCalculator() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isCalculating = navigation.state === "submitting";

  const [currentAmps, setCurrentAmps] = useState(100);
  const [lengthMeters, setLengthMeters] = useState(50);
  const [cableSizeMm2, setCableSizeMm2] = useState(25);
  const [cableType, setCableType] = useState("copper");
  const [voltage, setVoltage] = useState(400);
  const [phases, setPhases] = useState<1 | 3>(3);
  const [maxVoltageDrop, setMaxVoltageDrop] = useState(3);

  const result = actionData && "result" in actionData ? actionData.result as CableCalculationOutputs : null;
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
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20">
                <FontAwesomeIcon icon={faPlug} className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Voltage Drop Calculator</h1>
                <p className="text-gray-400">Check cable sizing for acceptable voltage drop</p>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <Form method="post" className="space-y-6">
              <div className="rounded-xl bg-gray-900 p-6 ring-1 ring-gray-800 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Voltage (V)</label>
                    <select
                      name="voltage"
                      value={voltage}
                      onChange={(e) => setVoltage(parseFloat(e.target.value))}
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                    >
                      <option value={230}>230V</option>
                      <option value={400}>400V</option>
                      <option value={415}>415V</option>
                      <option value={480}>480V</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Phases</label>
                    <div className="flex gap-2">
                      {[1, 3].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPhases(p as 1 | 3)}
                          className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                            phases === p ? "bg-blue-500 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                          }`}
                        >
                          {p}φ
                        </button>
                      ))}
                    </div>
                    <input type="hidden" name="phases" value={phases} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Current (Amps)</label>
                  <input
                    type="number"
                    name="currentAmps"
                    min="1"
                    value={currentAmps}
                    onChange={(e) => setCurrentAmps(parseFloat(e.target.value))}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Cable Length (meters)</label>
                  <input
                    type="number"
                    name="lengthMeters"
                    min="1"
                    value={lengthMeters}
                    onChange={(e) => setLengthMeters(parseFloat(e.target.value))}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Cable Size (mm²)</label>
                  <select
                    name="cableSizeMm2"
                    value={cableSizeMm2}
                    onChange={(e) => setCableSizeMm2(parseFloat(e.target.value))}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white"
                  >
                    {cableSizes.map((size) => (
                      <option key={size} value={size}>{size} mm²</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Cable Type</label>
                  <div className="flex gap-2">
                    {["copper", "aluminium"].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setCableType(type)}
                        className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium capitalize transition-colors ${
                          cableType === type ? "bg-blue-500 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="cableType" value={cableType} />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Max Voltage Drop (%)</label>
                  <div className="flex gap-2">
                    {[3, 4, 5].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setMaxVoltageDrop(pct)}
                        className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                          maxVoltageDrop === pct ? "bg-blue-500 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="maxVoltageDrop" value={maxVoltageDrop} />
                </div>
              </div>

              <button
                type="submit"
                disabled={isCalculating}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:shadow-blue-500/40 disabled:opacity-50"
              >
                {isCalculating ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} className="h-5 w-5 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCalculator} className="h-5 w-5" />
                    Calculate Voltage Drop
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
                  {/* Pass/Fail */}
                  <div className={`rounded-xl p-6 ring-1 text-center ${
                    result.isAcceptable 
                      ? "bg-green-500/10 ring-green-500/20" 
                      : "bg-red-500/10 ring-red-500/20"
                  }`}>
                    <FontAwesomeIcon 
                      icon={result.isAcceptable ? faCheckCircle : faExclamationTriangle} 
                      className={`h-12 w-12 mb-3 ${result.isAcceptable ? "text-green-500" : "text-red-500"}`}
                    />
                    <p className={`text-xl font-bold ${result.isAcceptable ? "text-green-400" : "text-red-400"}`}>
                      {result.isAcceptable ? "Cable Size OK" : "Cable Too Small"}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      {result.voltageDropPercent.toFixed(2)}% voltage drop
                    </p>
                  </div>

                  {/* Details */}
                  <div className="rounded-xl bg-gray-900 p-6 ring-1 ring-gray-800 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Voltage Drop</span>
                      <span className="text-white font-medium">{result.voltageDrop.toFixed(2)} V</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Voltage Drop %</span>
                      <span className={`font-medium ${result.isAcceptable ? "text-green-400" : "text-red-400"}`}>
                        {result.voltageDropPercent.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Voltage at Load</span>
                      <span className="text-white font-medium">{result.voltageAtLoad.toFixed(1)} V</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Power Loss</span>
                      <span className="text-white font-medium">{result.powerLossWatts.toFixed(0)} W</span>
                    </div>
                    {!result.isAcceptable && (
                      <div className="flex justify-between border-t border-gray-800 pt-3">
                        <span className="text-gray-400">Recommended Size</span>
                        <span className="text-blue-400 font-medium">{result.recommendedCableSize} mm²</span>
                      </div>
                    )}
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
                    Need Help? Speak to Jordan →
                  </Link>
                </>
              )}

              {!result && !error && (
                <div className="rounded-xl bg-gray-900 p-8 ring-1 ring-gray-800 text-center">
                  <FontAwesomeIcon icon={faPlug} className="h-12 w-12 text-gray-700 mb-4" />
                  <p className="text-gray-400">Enter cable details to check voltage drop</p>
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
