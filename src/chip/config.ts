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
