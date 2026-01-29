// Shared calculation utilities that can run on both client and server
// These are pure functions with no server dependencies

// ============================================
// Unit Conversions (Client-safe)
// ============================================

export const unitConversions = {
  // Power
  kwToHp: (kw: number) => kw * 1.341,
  hpToKw: (hp: number) => hp * 0.7457,
  kvaToKw: (kva: number, pf: number = 0.8) => kva * pf,
  kwToKva: (kw: number, pf: number = 0.8) => kw / pf,
  
  // Current
  kvaToAmps: (kva: number, voltage: number, phases: 1 | 3 = 3) => {
    if (phases === 1) return (kva * 1000) / voltage;
    return (kva * 1000) / (voltage * Math.sqrt(3));
  },
  ampsToKva: (amps: number, voltage: number, phases: 1 | 3 = 3) => {
    if (phases === 1) return (amps * voltage) / 1000;
    return (amps * voltage * Math.sqrt(3)) / 1000;
  },
  
  // Fuel
  gallonsToLitres: (gallons: number) => gallons * 3.785,
  litresToGallons: (litres: number) => litres / 3.785,
  
  // Length
  feetToMeters: (feet: number) => feet * 0.3048,
  metersToFeet: (meters: number) => meters / 0.3048,
  
  // Temperature
  celsiusToFahrenheit: (c: number) => (c * 9/5) + 32,
  fahrenheitToCelsius: (f: number) => (f - 32) * 5/9,
};
