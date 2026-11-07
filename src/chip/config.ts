// PIC16F84A configuration word and memory map constants.

// ---------- Memory map ----------

export const MEMORY = {
  PROGRAM_SIZE: 1024, // flash words, 0x000-0x3FF
  WORD_MASK: 0x3fff, // 14-bit instruction word
  RESET_VECTOR: 0x000,
  INTERRUPT_VECTOR: 0x004,
  ID_START: 0x2000, // 4 user ID words, 0x2000-0x2003 (__IDLOCS)
  ID_COUNT: 4,
  EEPROM_SIZE: 64, // data EEPROM bytes
  EEPROM_START: 0x2100, // where DE data goes (ORG 0x2100)
  STACK_DEPTH: 8,
} as const;

// ---------- Configuration word (__CONFIG) ----------
//
// 14-bit word at 0x2007:
//   bits 13-4  CP     code protection (all 1 = off, all 0 = on)
//   bit  3     PWRTE  power-up timer, active low (0 = enabled)
//   bit  2     WDTE   watchdog timer (1 = enabled)
//   bits 1-0   FOSC   oscillator: 00 LP, 01 XT, 10 HS, 11 RC

export const CONFIG_ADDRESS = 0x2007;
export const CONFIG_DEFAULT = 0x3fff; // unprogrammed: RC, WDT on, PWRT off, CP off

// Same values as P16F84A.INC. Combine with &, e.g. _XT_OSC & _WDT_OFF
export const CONFIG_SYMBOLS = new Map<string, number>([
  ["_CP_ON", 0x000f],
  ["_CP_OFF", 0x3fff],
  ["_PWRTE_ON", 0x3ff7],
  ["_PWRTE_OFF", 0x3fff],
  ["_WDT_ON", 0x3fff],
  ["_WDT_OFF", 0x3ffb],
  ["_LP_OSC", 0x3ffc],
  ["_XT_OSC", 0x3ffd],
  ["_HS_OSC", 0x3ffe],
  ["_RC_OSC", 0x3fff],
]);

export type Oscillator = "LP" | "XT" | "HS" | "RC";

export type ConfigSettings = {
  oscillator: Oscillator;
  watchdog: boolean;
  powerUpTimer: boolean;
  codeProtect: boolean;
};

const OSCILLATORS: Oscillator[] = ["LP", "XT", "HS", "RC"]; // index = FOSC bits

export function decodeConfig(word: number): ConfigSettings {
  return {
    oscillator: OSCILLATORS[word & 0b11],
    watchdog: (word & 0x0004) !== 0,
    powerUpTimer: (word & 0x0008) === 0, // active low
    codeProtect: (word & 0x3ff0) !== 0x3ff0,
  };
}

// ---------- Oscillator modes and clock ranges ----------
//
// The FOSC bits set up the oscillator circuit for a range of frequencies
// (datasheet section 6.2 and the electrical characteristics, PIC16F84A-20):
//   LP  low-power crystal     up to 200 kHz (e.g. 32.768 kHz watch crystals)
//   XT  crystal / resonator   100 kHz - 4 MHz
//   HS  high-speed crystal    4 MHz - 20 MHz
//   RC  resistor + capacitor  up to 4 MHz
// Outside its range the oscillator may not start or run reliably on a real chip.

const OSCILLATOR_RANGES: Record<Oscillator, { min: number; max: number }> = {
  LP: { min: 0, max: 200_000 },
  XT: { min: 100_000, max: 4_000_000 },
  HS: { min: 4_000_000, max: 20_000_000 },
  RC: { min: 0, max: 4_000_000 },
};

function formatHz(hz: number): string {
  return hz >= 1_000_000 ? `${hz / 1_000_000} MHz` : `${hz / 1000} kHz`;
}

// Why the clock doesn't fit the configured oscillator mode, or null when it fits
export function clockProblem(oscillator: Oscillator, hz: number): string | null {
  const { min, max } = OSCILLATOR_RANGES[oscillator];
  if (hz >= min && hz <= max) return null;
  const fits = hz <= 200_000 ? "LP" : hz <= 4_000_000 ? "XT" : "HS";
  const range = min === 0 ? `up to ${formatHz(max)}` : `${formatHz(min)} - ${formatHz(max)}`;
  return `${oscillator} mode is for ${range}: use _${fits}_OSC in __CONFIG for ${formatHz(hz)}.`;
}
