# TODO

What is left to build, in planned order. See `ideas.md` for the full list of approved ideas.

## Done

- Assembler (MPASM syntax, two passes) with `.hex` / `.lst` / `.err` output
- CPU (all 35 instructions, pipeline cycle counts), data memory, stack, data EEPROM read/write, I/O pins
- Panels: Messages, Flash, Registers, Stack, RAM, EEPROM, Pins
- Editor: line numbers, Tab / Shift+Tab, current-line highlight that stays in view
- Open / Save `.asm`, tooltips that explain disabled buttons, up-to-date `CLAUDE.md`
- Timer0: internal clock with prescaler, external clock on RA4/T0CKI, T0IF on overflow, TMR0 write clears the prescaler and pauses 2 cycles
- Interrupts: mechanism (push PC, clear GIE, jump to `0x004`, 2 cycles); `GOTO $` ends Run only when no interrupt can come
- Interrupt sources: TMR0 overflow, RB0/INT edge (INTEDG), RB4–RB7 change (latched on PORTB reads), EEPROM write complete (EEIE)
- Watchdog (on by default, 18 ms x postscaler), SLEEP wake-up (WDT, INT, RB change, EEPROM), power-on / MCLR / WDT resets with TO / PD and WRERR, MCLR button
- Clock selector (32.768 kHz – 20 MHz) in the status bar; EEPROM write time and WDT period follow it; warning when the clock doesn't fit the `__CONFIG` oscillator mode
- UI: new panel layout (simulator panels on top), obsidian / ice grey colours with a blue accent

## Simulator features (in planned order)

- [ ] **7. Breakpoints** _(on hold)_: click a line number; later conditional and data breakpoints
- [ ] **8. Run speed + Step Over / Step Out**
- [ ] **9. Execution history / step back**

## Display and I/O

- [ ] **10. Chip SVG** (your idea #1; needs your image)
- [ ] **11. Virtual components**: LEDs, buttons, 7-segment display
- [ ] **12. Logic analyzer**: pin levels over time
- [ ] **13. Watch list**
- [ ] **14. Syntax highlighting** in the editor

## Assembler extras

- [ ] **15. Load a `.hex` file** into the simulator
- [ ] **16. More directives**: recognised but not supported yet: `MACRO`, `IF` / `ELSE`, `DT`, `BANKSEL`, `__IDLOCS`, `RES`, ...
- [ ] **17. Compare `.hex` / `.lst` with real MPLAB output**

## Tests (later)

Only the lexer, parser and expressions have tests so far. Still to cover:

- [ ] `symbols`, `encoder`, `assembler`
- [ ] Output writers: `hex`, `lst`, `err`
- [ ] `disassembler`
- [ ] Simulator: `memory`, `stack`, `cpu`, `eeprom`, `pins`

## Small loose ends

- [ ] **Esc** to leave the editor with the keyboard (Tab no longer does)
- [ ] Flash rows can be clicked but not reached with the keyboard
- [ ] Recreate the stack test programs in `examples/`
- [ ] `README.md` is still the Vite template
