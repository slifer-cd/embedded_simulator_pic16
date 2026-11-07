# PIC16F84A Assembler & Simulator

A browser-based assembler and simulator for the Microchip **PIC16F84A**. Write MPASM-style
assembly, assemble it, then step through it while watching registers, memory, pins and a live
block diagram of the chip.

**Live:** https://slifer-cd.github.io/embedded_simulator_pic16/

## Features

**Assembler** (MPASM-compatible syntax)

- Two passes, with errors and warnings that point at the line (MPASM message codes where known)
- Directives: `ORG`, `EQU`, `CBLOCK` / `ENDC`, `__CONFIG`, `DE`, `LIST`, `PROCESSOR`,
  `#include`, `END` (`MACRO`, `IF`, `DT`, `BANKSEL`, ... are not supported yet)
- Downloads: `.hex` (INHX8M), `.lst` (listing + symbol table) and `.err`

**Simulator**

- All 35 instructions with correct cycle counts, banked data memory, the 8-level stack
  (with overflow / underflow warnings), data EEPROM read / write
- Timer0 (internal clock with prescaler, or external clock on RA4/T0CKI)
- Interrupts: TMR0 overflow, RB0/INT, RB4–RB7 change, EEPROM write complete
- Watchdog, SLEEP and wake-up, power-on / MCLR / WDT resets with the TO / PD bits
- Selectable clock (32.768 kHz – 20 MHz), so timings follow the chosen oscillator

**Debugging**

- Run (fixed speed, real time or max), Step, Step Over, Step Out, Step Back (last 1000 steps)
- Line breakpoints (with conditions) and data breakpoints (a register or RAM byte changes / becomes a value)
- Panels: Registers, Watch list, Stack, RAM, EEPROM, Flash, Pins, History, Messages
- Board: LEDs, push buttons and a 7-segment display wired to the pins
- Logic analyzer: RA0–RA4 / RB0–RB7 waveforms over time
- Chip view: the datasheet block diagram with live values and the buses each instruction uses

## Writing code

The assembler follows MPASM, so a few rules may surprise you:

- **Plain numbers are hex:** `20` means `0x20`. Write `.20` or `D'20'` for decimal.
- Labels start in column 1; instructions and directives are indented.
- Register and bit names (`STATUS`, `RP0`, `PORTB`, ...) are always known, even without `#include`.

The [`examples/`](examples) folder has short programs for each feature (pins, Timer0,
interrupts, EEPROM, SLEEP / watchdog, the stack, the 7-segment display). Each one starts
with a comment that says what to try. Load one from the **Examples…** list in the toolbar.

## Development

The project uses [Vite+](https://viteplus.dev) (the `vp` CLI), React 19 and TypeScript.

```sh
vp install        # install dependencies
vp dev            # start the dev server
vp run build      # type check + production build into dist/
vp check          # format, lint and type check
vp test           # run the tests
```

Every push to `main` is built and deployed to GitHub Pages by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Project layout

```
src/chip/         facts about the PIC16F84A (instructions, registers, config bits)
src/assembler/    source text -> program / EEPROM / config images, plus the output writers
src/simulator/    the running chip: CPU, memory, stack, pins, peripherals, history
src/components/   React panels; App.tsx holds the state and wires them together
test/             Vitest tests
examples/         .asm programs to try by hand
```
