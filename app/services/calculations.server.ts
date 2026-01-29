// Power Industry Calculator - Calculation Services
// Business logic for power, fuel, hybrid, cable, and load calculations

import { db } from "~/lib/prisma";
import type { CalculationType, Prisma } from "@prisma/client";

// ============================================
// Types
// ============================================

export interface PowerLoad {
  name: string;
  quantity: number;
  ratingKw: number;
  powerFactor: number;
  startMultiplier: number; // Motor start multiplier (1.0 for resistive, 3-6 for motors)
  diversityFactor: number; // 0-1, how likely all loads run simultaneously
}

export interface PowerCalculationInputs {
  loads: PowerLoad[];
  headroomPercent: number; // Safety margin (typically 10-25%)
  altitudeMeters?: number;
  ambientTempC?: number;
}

export interface PowerCalculationOutputs {
  totalRunningKw: number;
  totalDiversifiedKw: number;
  peakDemandKw: number;
  peakDemandKva: number;
  averagePowerFactor: number;
  recommendedGeneratorKva: number;
  generatorSizeOptions: { kva: number; label: string }[];
  assumptions: string[];
}

export interface FuelCalculationInputs {
  generatorSizeKva: number;
  loadPercent: number; // 25, 50, 75, 100
  runtimeHours: number;
  fuelType: "diesel" | "petrol" | "gas";
  fuelCostPerLitre: number;
}

export interface FuelCalculationOutputs {
  consumptionLitresPerHour: number;
  totalLitres: number;
  totalCost: number;
  co2EmissionsKg: number;
  tankRefillsNeeded: number; // Assuming 1000L tank
  assumptions: string[];
}

export interface HybridCalculationInputs {
  baselineGeneratorKva: number;
  baselineLoadPercent: number;
  baselineRuntimeHours: number;
  batteryCapacityKwh: number;
  hybridLoadPercent: number; // Typically lower due to battery assist
  peakShavingEnabled: boolean;
  fuelCostPerLitre: number;
}

export interface HybridCalculationOutputs {
  baselineFuelLitres: number;
  baselineCost: number;
  hybridFuelLitres: number;
  hybridCost: number;
  fuelSavingsLitres: number;
  costSavings: number;
  savingsPercent: number;
  co2ReductionKg: number;
  assumptions: string[];
}

export interface CableCalculationInputs {
  currentAmps: number;
  lengthMeters: number;
  cableSizeMm2: number;
  cableType: "copper" | "aluminium";
  voltage: number;
  phases: 1 | 3;
  maxVoltageDrop: number; // Typically 3-5%
}

export interface CableCalculationOutputs {
  voltageDrop: number;
  voltageDropPercent: number;
  powerLossWatts: number;
  isAcceptable: boolean;
  recommendedCableSize: number;
  voltageAtLoad: number;
  assumptions: string[];
}

export interface LoadSetCalculationInputs {
  totalLoadKva: number;
  generatorSizes: number[]; // Available generator sizes
  nPlusRedundancy: number; // N+1, N+2, etc.
  loadProfileType: "constant" | "variable" | "stepped";
  peakLoadPercent: number;
  averageLoadPercent: number;
}

export interface LoadSetCalculationOutputs {
  optimalConfiguration: { count: number; sizeKva: number }[];
  totalInstalledKva: number;
  redundancyPercent: number;
  utilizationPercent: number;
  fuelEfficiencyRating: string;
  assumptions: string[];
}

// ============================================
// Calculation Functions
// ============================================

/**
 * Calculate power requirements from a list of loads
 */
export function calculatePower(inputs: PowerCalculationInputs): PowerCalculationOutputs {
  const { loads, headroomPercent, altitudeMeters = 0, ambientTempC = 25 } = inputs;

  // Calculate total running load (kW)
  let totalRunningKw = 0;
  let totalDiversifiedKw = 0;
  let weightedPfNumerator = 0;
  let peakDemandKw = 0;

  for (const load of loads) {
    const loadKw = load.quantity * load.ratingKw;
    totalRunningKw += loadKw;
    totalDiversifiedKw += loadKw * load.diversityFactor;
    weightedPfNumerator += loadKw * load.powerFactor;
    
    // Peak demand considers motor starting
    peakDemandKw += loadKw * load.startMultiplier;
  }

  const averagePowerFactor = totalRunningKw > 0 ? weightedPfNumerator / totalRunningKw : 0.8;

  // Apply altitude derating (3% per 300m above 1000m)
  let deratingFactor = 1.0;
  if (altitudeMeters > 1000) {
    deratingFactor -= ((altitudeMeters - 1000) / 300) * 0.03;
  }
  // Apply temperature derating (1% per 5°C above 40°C)
  if (ambientTempC > 40) {
    deratingFactor -= ((ambientTempC - 40) / 5) * 0.01;
  }

  // Convert to kVA
  const peakDemandKva = peakDemandKw / averagePowerFactor;

  // Add headroom
  const recommendedKva = (peakDemandKva / deratingFactor) * (1 + headroomPercent / 100);

  // Standard generator sizes
  const standardSizes = [20, 30, 40, 50, 60, 80, 100, 125, 150, 200, 250, 300, 400, 500, 600, 750, 800, 1000, 1250, 1500, 2000, 2500, 3000];
  
  const generatorSizeOptions = standardSizes
    .filter(size => size >= recommendedKva * 0.8)
    .slice(0, 4)
    .map(kva => ({
      kva,
      label: kva >= recommendedKva ? "Recommended" : "Minimum"
    }));

  const assumptions: string[] = [
    `Headroom factor: ${headroomPercent}%`,
    `Average power factor: ${averagePowerFactor.toFixed(2)}`,
    `Derating factor: ${(deratingFactor * 100).toFixed(1)}%`,
  ];
  if (altitudeMeters > 1000) {
    assumptions.push(`Altitude derating applied for ${altitudeMeters}m`);
  }
  if (ambientTempC > 40) {
    assumptions.push(`Temperature derating applied for ${ambientTempC}°C`);
  }

  return {
    totalRunningKw,
    totalDiversifiedKw,
    peakDemandKw,
    peakDemandKva,
    averagePowerFactor,
    recommendedGeneratorKva: Math.ceil(recommendedKva),
    generatorSizeOptions,
    assumptions,
  };
}

/**
 * Calculate fuel consumption and costs
 */
export function calculateFuel(inputs: FuelCalculationInputs): FuelCalculationOutputs {
  const { generatorSizeKva, loadPercent, runtimeHours, fuelType, fuelCostPerLitre } = inputs;

  // Base fuel consumption rates (litres per kVA per hour at various load %)
  // These are approximate values for typical diesel generators
  const consumptionRates: Record<string, Record<number, number>> = {
    diesel: { 25: 0.06, 50: 0.09, 75: 0.12, 100: 0.15 },
    petrol: { 25: 0.08, 50: 0.12, 75: 0.16, 100: 0.20 },
    gas: { 25: 0.10, 50: 0.15, 75: 0.20, 100: 0.25 },
  };

  // Get consumption rate (interpolate if needed)
  const rates = consumptionRates[fuelType];
  const loadKey = Math.round(loadPercent / 25) * 25;
  const clampedKey = Math.max(25, Math.min(100, loadKey)) as 25 | 50 | 75 | 100;
  const ratePerKvaHour = rates[clampedKey];

  const consumptionLitresPerHour = generatorSizeKva * ratePerKvaHour;
  const totalLitres = consumptionLitresPerHour * runtimeHours;
  const totalCost = totalLitres * fuelCostPerLitre;

  // CO2 emissions (kg per litre)
  const co2PerLitre: Record<string, number> = { diesel: 2.68, petrol: 2.31, gas: 1.96 };
  const co2EmissionsKg = totalLitres * co2PerLitre[fuelType];

  const tankRefillsNeeded = Math.ceil(totalLitres / 1000);

  return {
    consumptionLitresPerHour,
    totalLitres,
    totalCost,
    co2EmissionsKg,
    tankRefillsNeeded,
    assumptions: [
      `Generator size: ${generatorSizeKva} kVA`,
      `Load: ${loadPercent}%`,
      `Fuel type: ${fuelType}`,
      `Runtime: ${runtimeHours} hours`,
      `Fuel cost: £${fuelCostPerLitre.toFixed(2)}/litre`,
      `Based on typical ${fuelType} generator consumption curves`,
    ],
  };
}

/**
 * Calculate hybrid savings compared to baseline
 */
export function calculateHybrid(inputs: HybridCalculationInputs): HybridCalculationOutputs {
  const {
    baselineGeneratorKva,
    baselineLoadPercent,
    baselineRuntimeHours,
    batteryCapacityKwh,
    hybridLoadPercent,
    peakShavingEnabled,
    fuelCostPerLitre,
  } = inputs;

  // Baseline calculation
  const baseline = calculateFuel({
    generatorSizeKva: baselineGeneratorKva,
    loadPercent: baselineLoadPercent,
    runtimeHours: baselineRuntimeHours,
    fuelType: "diesel",
    fuelCostPerLitre,
  });

  // Hybrid calculation - battery assists during peaks, generator runs more efficiently
  let hybridRuntimeHours = baselineRuntimeHours;
  let effectiveLoadPercent = hybridLoadPercent;

  // Battery provides peak shaving, reducing runtime at high load
  if (peakShavingEnabled && batteryCapacityKwh > 0) {
    // Estimate hours that battery can cover peak loads
    const peakLoadKw = (baselineGeneratorKva * 0.8) * (baselineLoadPercent / 100);
    const batteryHours = batteryCapacityKwh / peakLoadKw;
    // Reduce effective generator runtime
    hybridRuntimeHours = Math.max(0, baselineRuntimeHours - batteryHours * 0.8);
    effectiveLoadPercent = Math.max(25, hybridLoadPercent - 10);
  }

  const hybrid = calculateFuel({
    generatorSizeKva: baselineGeneratorKva,
    loadPercent: effectiveLoadPercent,
    runtimeHours: hybridRuntimeHours,
    fuelType: "diesel",
    fuelCostPerLitre,
  });

  const fuelSavingsLitres = baseline.totalLitres - hybrid.totalLitres;
  const costSavings = baseline.totalCost - hybrid.totalCost;
  const savingsPercent = (fuelSavingsLitres / baseline.totalLitres) * 100;
  const co2ReductionKg = baseline.co2EmissionsKg - hybrid.co2EmissionsKg;

  return {
    baselineFuelLitres: baseline.totalLitres,
    baselineCost: baseline.totalCost,
    hybridFuelLitres: hybrid.totalLitres,
    hybridCost: hybrid.totalCost,
    fuelSavingsLitres,
    costSavings,
    savingsPercent,
    co2ReductionKg,
    assumptions: [
      `Baseline: ${baselineGeneratorKva} kVA at ${baselineLoadPercent}% load`,
      `Hybrid: ${baselineGeneratorKva} kVA + ${batteryCapacityKwh} kWh battery`,
      `Peak shaving: ${peakShavingEnabled ? "Enabled" : "Disabled"}`,
      `Runtime: ${baselineRuntimeHours} hours`,
      "Assumes optimal battery charging cycles",
      "Savings may vary based on load profile",
    ],
  };
}

/**
 * Calculate voltage drop in cables
 */
export function calculateCable(inputs: CableCalculationInputs): CableCalculationOutputs {
  const { currentAmps, lengthMeters, cableSizeMm2, cableType, voltage, phases, maxVoltageDrop } = inputs;

  // Resistivity (ohm·mm²/m) at 20°C
  const resistivity: Record<string, number> = {
    copper: 0.0172,
    aluminium: 0.0283,
  };

  // Calculate resistance
  const resistance = (resistivity[cableType] * lengthMeters) / cableSizeMm2;

  // Voltage drop calculation
  let voltageDrop: number;
  if (phases === 1) {
    // Single phase: Vd = 2 × I × R (go and return)
    voltageDrop = 2 * currentAmps * resistance;
  } else {
    // Three phase: Vd = √3 × I × R × cos(φ) - simplified assuming PF 0.8
    voltageDrop = Math.sqrt(3) * currentAmps * resistance * 0.8;
  }

  const voltageDropPercent = (voltageDrop / voltage) * 100;
  const voltageAtLoad = voltage - voltageDrop;
  const powerLossWatts = currentAmps * currentAmps * resistance * (phases === 1 ? 2 : 3);

  const isAcceptable = voltageDropPercent <= maxVoltageDrop;

  // Recommend cable size if not acceptable
  let recommendedCableSize = cableSizeMm2;
  if (!isAcceptable) {
    // Find minimum cable size to meet voltage drop requirement
    const standardSizes = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];
    for (const size of standardSizes) {
      const testResistance = (resistivity[cableType] * lengthMeters) / size;
      let testDrop: number;
      if (phases === 1) {
        testDrop = 2 * currentAmps * testResistance;
      } else {
        testDrop = Math.sqrt(3) * currentAmps * testResistance * 0.8;
      }
      if ((testDrop / voltage) * 100 <= maxVoltageDrop) {
        recommendedCableSize = size;
        break;
      }
    }
  }

  return {
    voltageDrop,
    voltageDropPercent,
    powerLossWatts,
    isAcceptable,
    recommendedCableSize,
    voltageAtLoad,
    assumptions: [
      `Cable type: ${cableType} ${cableSizeMm2}mm²`,
      `Length: ${lengthMeters}m`,
      `Current: ${currentAmps}A`,
      `Voltage: ${voltage}V ${phases}-phase`,
      `Max acceptable drop: ${maxVoltageDrop}%`,
      "Resistivity at 20°C ambient",
      phases === 3 ? "Power factor assumed 0.8" : "",
    ].filter(Boolean),
  };
}

/**
 * Calculate optimal load-on-demand generator configuration
 */
export function calculateLoadSet(inputs: LoadSetCalculationInputs): LoadSetCalculationOutputs {
  const {
    totalLoadKva,
    generatorSizes,
    nPlusRedundancy,
    loadProfileType,
    peakLoadPercent,
    averageLoadPercent,
  } = inputs;

  // Sort generator sizes ascending
  const sortedSizes = [...generatorSizes].sort((a, b) => a - b);

  // Find optimal configuration
  type Config = { count: number; sizeKva: number };
  let optimalConfiguration: Config[] = [];
  let minTotalKva = Infinity;

  // Try different combinations
  for (const size of sortedSizes) {
    const unitsNeeded = Math.ceil(totalLoadKva / (size * 0.8)); // 80% max loading
    const totalUnits = unitsNeeded + nPlusRedundancy;
    const totalKva = totalUnits * size;

    if (totalKva < minTotalKva && totalKva >= totalLoadKva * 1.1) {
      minTotalKva = totalKva;
      optimalConfiguration = [{ count: totalUnits, sizeKva: size }];
    }
  }

  // Also try mixed configurations for efficiency
  if (sortedSizes.length >= 2) {
    const large = sortedSizes[sortedSizes.length - 1];
    const small = sortedSizes[0];
    
    const largeUnits = Math.floor(totalLoadKva / (large * 0.8));
    const remainingKva = totalLoadKva - (largeUnits * large * 0.8);
    const smallUnits = Math.ceil(remainingKva / (small * 0.8)) + nPlusRedundancy;
    
    const mixedTotal = (largeUnits * large) + (smallUnits * small);
    if (mixedTotal < minTotalKva && mixedTotal >= totalLoadKva * 1.1) {
      optimalConfiguration = [
        { count: largeUnits, sizeKva: large },
        { count: smallUnits, sizeKva: small },
      ].filter(c => c.count > 0);
    }
  }

  const totalInstalledKva = optimalConfiguration.reduce((sum, c) => sum + c.count * c.sizeKva, 0);
  const redundancyPercent = ((totalInstalledKva - totalLoadKva) / totalLoadKva) * 100;
  const utilizationPercent = (totalLoadKva / totalInstalledKva) * 100;

  // Fuel efficiency rating based on load profile match
  let fuelEfficiencyRating: string;
  if (loadProfileType === "constant" && utilizationPercent > 70) {
    fuelEfficiencyRating = "Excellent";
  } else if (loadProfileType === "variable" && optimalConfiguration.length > 1) {
    fuelEfficiencyRating = "Good";
  } else if (utilizationPercent > 50) {
    fuelEfficiencyRating = "Moderate";
  } else {
    fuelEfficiencyRating = "Review sizing";
  }

  return {
    optimalConfiguration,
    totalInstalledKva,
    redundancyPercent,
    utilizationPercent,
    fuelEfficiencyRating,
    assumptions: [
      `Total load requirement: ${totalLoadKva} kVA`,
      `Redundancy: N+${nPlusRedundancy}`,
      `Load profile: ${loadProfileType}`,
      `Peak load: ${peakLoadPercent}%, Average: ${averageLoadPercent}%`,
      "Maximum 80% loading per unit for efficiency",
      "Minimum 10% headroom required",
    ],
  };
}

// ============================================
// Unit Conversions (re-exported from shared)
// ============================================

export { unitConversions } from "./calculations.shared";

// ============================================
// Database Operations
// ============================================

export async function saveCalculation(
  type: CalculationType,
  inputs: Record<string, unknown>,
  outputs: Record<string, unknown>,
  userId?: string,
  title?: string
) {
  return db.calculation.create({
    data: {
      type,
      title,
      inputs: inputs as Prisma.InputJsonValue,
      outputs: outputs as Prisma.InputJsonValue,
      userId,
    },
  });
}

export async function getCalculation(id: string) {
  return db.calculation.findUnique({
    where: { id },
    include: { user: { select: { email: true, name: true } } },
  });
}

export async function getUserCalculations(userId: string, type?: CalculationType) {
  return db.calculation.findMany({
    where: { userId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function deleteCalculation(id: string, userId: string) {
  return db.calculation.deleteMany({
    where: { id, userId },
  });
}
