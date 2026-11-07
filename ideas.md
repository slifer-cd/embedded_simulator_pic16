# Ideas: PIC16F84A Assembler & Simulator

All ideas below (both parts) are approved.

## Assembler output files (on request)

When the user asks, the assembler generates these MPASM-style files:

- **`.hex`**: Intel HEX (INHX8M) with the program words, little-endian byte pairs, config word at address `0x2007` (byte address `0x400E`).
- **`.lst`**: listing file: address, machine code, line number and source text for each line, followed by the symbol table.
- **`.err`**: error/warning file: one entry per problem, with severity, file, line number and message.

## Part 1: Your ideas

1. **Memory & register visualization through an animated SVG** (based on your chip image)
   - RAM (file registers, Bank 0 / Bank 1)
   - Stack (8 levels)
   - Flash / program memory (1K words × 14-bit)
   - Special registers (W, PC, STATUS, FSR, PORTA/PORTB, TRISA/TRISB, ...)
   - The SVG updates as the program runs.
2. **Breakpoints**: click a source line to pause execution there.
3. **Pin output inspection**: see the state of every pin (RA0–RA4, RB0–RB7) at any moment.

## Part 2: Claude's ideas

### Assembler

1. **Clear error reporting**: line number, column and message (unknown mnemonic, bad operand, undefined label, value out of range).
2. **Symbol table view**: every label and `EQU` constant with its resolved address or value.
3. **Listing output**: each source line next to its address and 14-bit machine code.
4. **Intel HEX export/import**: the file format real programmers use, so you can load `.hex` files built with MPLAB.
5. **Config word (`__CONFIG`) support**: oscillator type, WDTE, PWRTE, CP.

### Execution control

6. **Step / Step Over / Step Out / Run / Pause / Reset**, with adjustable run speed.
7. **Cycle counter & elapsed time**: based on the oscillator frequency (e.g. 4 MHz gives 1 µs per instruction cycle; `GOTO`/`CALL`/skips take 2 cycles).
8. **Conditional & data breakpoints**: break when a register is written or when a condition holds (e.g. `PORTB == 0xFF`).
9. **Execution history / step back**: undo the last N instructions to see how a state was reached.
10. **Current-line highlighting** in the code editor, plus syntax highlighting.

### Hardware accuracy

11. **Timer0** with prescaler (OPTION_REG), including T0CKI external clock.
12. **Interrupts**: RB0/INT, RB4–RB7 change, TMR0 overflow, EEPROM write complete (INTCON, GIE, the vector at 0x004).
13. **Data EEPROM (64 bytes)**: view and edit, with the EECON1/EECON2 write sequence.
14. **Watchdog Timer** and the different reset causes (POR, MCLR, WDT), reflected in the STATUS TO/PD bits.
15. **Stack overflow/underflow warning**: the real chip silently wraps after 8 levels, so the simulator should flag it.

### I/O & peripherals

16. **Input stimulus**: click a pin to toggle it high/low, or attach a virtual button/switch.
17. **Virtual components**: LEDs, a 7-segment display, push buttons, maybe a character LCD, wired to pins.
18. **Logic analyzer / waveform view**: plot pin states over time (cycles), useful for checking timing and PWM done in software.

### Usability

19. **Watch list**: pin chosen registers or variables (by label) to watch.
20. **Example programs**: blink an LED, button input, Timer0 interrupt, EEPROM write.
21. **Save/load projects** in the browser.
