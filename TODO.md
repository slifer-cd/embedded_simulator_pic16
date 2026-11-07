# TODO

What is left to build, in planned order. See `ideas.md` for the full list of approved ideas.

## Done

- Assembler (MPASM syntax, two passes) with `.hex` / `.lst` / `.err` output
- CPU (all 35 instructions, pipeline cycle counts), data memory, stack, data EEPROM read/write, I/O pins
- Panels: Messages, Flash, Registers, Stack, RAM, EEPROM, Pins
- Editor: line numbers, Tab / Shift+Tab, current-line highlight that stays in view
- Open / Save `.asm`, tooltips that explain disabled buttons, up-to-date `CLAUDE.md`

## Simulator features (in planned order)

- [ ] **1. Timer0, internal clock**: TMR0, prescaler (PSA, PS2:0), T0IF on overflow; a write clears the prescaler and pauses counting 2 cycles; stops in SLEEP
- [ ] **2. Timer0, external clock**: count edges on RA4/T0CKI (T0SE picks rising / falling)
- [ ] **3. Interrupt mechanism + TMR0 interrupt**: GIE / enable bit / flag → push PC, clear GIE, jump to `0x004`; RETFIE. Run should stop at `GOTO $` only when GIE = 0
- [ ] **4. The other interrupt sources**: RB0/INT (INTEDG), RB4–RB7 change, EEPROM write complete (EEIE)
- [ ] **5. Watchdog + SLEEP wake-up + reset types**: WDT is on by default in the config word; MCLR / WDT resets; TO / PD bits; WRERR; an MCLR button
- [ ] **6. Clock selector**: replaces the fixed 4 MHz; the EEPROM write time follows it
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
- [ ] The Messages panel is narrow; long messages wrap
