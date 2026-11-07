# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

A browser-based **PIC16F84A** assembler and simulator: a single-page app in TypeScript + React 19. Working today:

- **Assembler** (MPASM-compatible syntax): two-pass, with `.hex` (INHX8M), `.lst` and `.err` downloads.
- **Simulator**: all 35 instructions with pipeline-correct cycle counts, banked data memory, the 8-level stack, data EEPROM read/write, I/O pins, Timer0 (internal clock + prescaler, external clock on RA4/T0CKI), interrupts (TMR0, RB0/INT, RB4–RB7 change, EEPROM write complete), the watchdog, SLEEP wake-up and the power-on / MCLR / WDT reset types.
- **UI**: editor with line numbers and a Chip tab (live block diagram, `components/ChipView.tsx`, drawn after `public/system.png`), Assemble / Run (with a speed setting) / Step Back / Step / Step Over / Step Out / Reset (power-on) / MCLR, a clock selector in the status bar, and panels for Messages, History / Breakpoints (tabs), Flash, Registers, Stack, RAM, EEPROM and Pins.

Not built yet: a logic analyzer, a watch list, syntax highlighting (see `TODO.md`). `ideas.md` holds the approved feature list, the deferred EEPROM follow-ups and the planned order. `public/instructions.png` is the datasheet instruction table. `examples/` holds `.asm` programs for trying features by hand. `README.md` is still Vite template boilerplate.

## Working agreement (set by the user)

- The user writes the code. Write code only when asked, scoped to exactly what was asked.
- Don't write tests unless asked.
- Don't create branches, commit or push unless asked.
- Build step by step: propose the next small step, never the whole feature at once.

## Toolchain

The project uses **Vite+** (`vp` global CLI), not plain Vite/npm. `AGENTS.md` holds the full toolchain rules. The points that matter most:

- `vp install`: install deps (pnpm 12, pinned via `devEngines`). `vite` and `vite-plus` versions come from the `catalog:` in `pnpm-workspace.yaml`, with `vite` aliased to `@voidzero-dev/vite-plus-core`.
- `vp dev`: dev server. `vp run build`: runs the `build` script (`tsc -b && vp build`). Plain `vp build` skips the type check.
- `vp check`: format (Oxfmt) + lint (Oxlint, type-aware with type checking) in one pass. `vp check --fix` autofixes. A pre-commit hook (`staged` in `vite.config.ts`, installed into `.vite-hooks/` by the `prepare` script) runs `vp check --fix` on staged files.
- `vp test`: Vitest (built-in, no `test` script needed). Tests live in `test/` and import from `vite-plus/test`. Single file: `vp test test/parser.test.ts`; single test by name: `vp test -t "name"`. `tsc -b` only covers `src/`, but `vp check` also type-checks `test/`.
- `vp <name>` runs a built-in command; `vp run <name>` runs a `package.json` script. They can differ (e.g. `vp build` vs `vp run build`).
- Run TS scripts with `vpx <file>`; don't add `tsx`/`ts-node`.

## Architecture

```
src/chip/        facts about the PIC16F84A, shared by assembler and simulator (no logic beyond lookups)
src/assembler/   source text -> AssemblyResult           (pure TS, no React)
src/simulator/   AssemblyResult.program/eeprom -> running chip   (pure TS, no React)
src/components/  React panels; App.tsx owns all state and wires everything together
```

### `chip/`

- `instructions.ts`: each instruction has `opcode` (operand and `x` bits = 0) and `mask`. A word belongs to an instruction when `(word & mask) === opcode`. The masks don't overlap, so `decodeInstruction` is a plain `find`.
- `registers.ts`: SFRs with full 8-bit addresses (bank 1 = `0x8x`), `mirrored`, `resetValue` and bit names (bit 7 first, `NOT_TO` / `NOT_RBPU` style, as in `P16F84A.INC`).
- `config.ts`: `MEMORY` constants and the `__CONFIG` symbols.

### Assembler pipeline (`assembler/assembler.ts` runs it)

`lexer` (split lines, MPASM column-1 label rules) → `parser` (statements, operand counts, supported directives) → `symbols` (**pass 1**: address counter, symbol table, `addresses[i]` per statement) → `encoder` (**pass 2**: words with range checks) → `AssemblyResult` (stage outputs, `program` / `eeprom` / `config` images, messages sorted by line). Every stage runs even after errors so all problems show at once. `expressions.ts` evaluates operands for both passes. `output/` writers take the result and return strings.

MPASM behaviours that are easy to trip over:

- **Plain numbers are hex** (`20` = `0x20`). Use `.20` or `D'20'` for decimal. Test programs must write `0x` literals.
- Symbols are case-sensitive. Mnemonics and directives are compared uppercase.
- Built-in names (registers, bits, `W`/`F`, config symbols) are always preloaded, even without `#include`. So `C`, `Z`, `DC`, `W`, `F` can't be user labels.
- Message codes follow MPASM where known (`AssemblerMessage.code` is optional): 108, 113, 115, 118, 122, 128, 129, 202, 203, 205, 207, 302, 305.

### Simulator

- **`memory.ts`**: data memory is `file[256]` indexed by a **canonical address**. A table maps all 256 addresses, so mirrored registers and the 68 GPR bytes are stored once, and unimplemented addresses map to `null`. `read`/`write` take an instruction's 7-bit `f` (RP0 banking, INDF → FSR) and apply the read-only and implemented-bit masks. `peek`/`poke` take a full address and skip those rules (used by the CPU for flags and by the UI). Writes to EECON1/EECON2 go to `peripherals/eeprom.ts`.
- **PORTA/PORTB:** `file[]` holds the **output latches**, while `peek`/`read` return **pin levels** computed by `pins.ts` from TRIS, the latches, OPTION (weak pull-ups) and the external drives the user sets. RA4 is open-drain.
- **`cpu.ts`:** `step()` advances the PC **before** executing (so `ADDWF PCL, F` tables work), adds +1 cycle for taken skips and PCL writes, and sets flags **after** storing the result (so `CLRF STATUS` gives Z = 1). Then `passTime()` ticks the EEPROM controller, Timer0, the PORTB interrupts and the watchdog. Then it checks for an interrupt (`interruptPending()`: GIE + enable bit + flag), which pushes the PC, clears GIE and jumps to `0x0004` (2 cycles). A WDT timeout gives `reset("wdt")`. `StepResult` has warnings (stack over/underflow, invalid opcode), `interrupt`, `watchdogReset`, `wakeUp` and `endlessLoop` (a `GOTO $` while no interrupt is enabled).
- **SLEEP:** while `sleeping`, one step lets up to 1000 cycles pass (never past a WDT timeout or the end of an EEPROM write). Timer0 stops; the EEPROM, the watchdog and the PORTB pins keep working. A WDT timeout wakes it (TO = 0, PD = 0); INT / RB change / EEPROM wake it when the enable bit and flag are set, whatever GIE is. It then runs the instruction after SLEEP (and jumps to `0x0004` if GIE = 1).
- **Resets:** `Cpu.reset(kind)` / `Memory.reset(kind)` with `ResetKind = "power-on" | "mclr" | "wdt"`. Power-on clears RAM and W and the cycle count; MCLR / WDT keep RAM, the port latches, TMR0, W and the cycle count, follow datasheet Table 6-4, set TO / PD, and set WRERR if they cut off an EEPROM write. `load()` takes the config word (WDTE turns the watchdog on; on by default).
- **`peripherals/timer0.ts`:** `tick()` runs **after** the instruction, so the 2-cycle pause after a TMR0 write (`written()`, called from `Memory.write`) includes the writing instruction's own cycle; that matches datasheet Figure 5-2. The external clock checks the RA4 pin level once per instruction.
- **`peripherals/portbInterrupts.ts`:** RB0/INT edges set INTF; RB7:RB4 input pins that differ from the levels stored at the last PORTB read set RBIF. `Memory.read` (instructions only, not `peek`) stores those levels.
- **`peripherals/watchdog.ts`:** 18,000-cycle periods (18 ms at 4 MHz) times the postscaler when PSA = 1. After reset OPTION = 0xFF (1:128), so the default timeout is ~2.3 s. CLRWDT, SLEEP and resets clear it. The examples use `__CONFIG _WDT_OFF` because they never run CLRWDT.
- **Clock:** `Memory.clockHz` (set with `Cpu.setClock`, not a property assignment: the React Compiler skips App if a `useState` value is mutated). Cycle counts don't depend on it; `cyclesFor(ms)` turns times fixed in ms (EEPROM write 4 ms, WDT period 18 ms) into cycles. `chip/config.ts` `clockProblem()` checks the clock against the `__CONFIG` oscillator mode.
- **`saveState()` / `restoreState()`:** the complete chip state (`CpuState`), including hidden counters (prescaler, WDT, EEPROM write in progress, PORTB latched levels) and the pin drives, so restoring and running on gives exactly the same result. Each part has its own `save(into?)` / `restore()`; with `into` it fills an existing object (no allocation). **A new piece of hidden state must be added to its class's save/restore**, or step back breaks.
- **`history.ts`:** ring buffer of `CpuState` slots (created once, then reused). `record()` before each step, `noteStep()` after it (event bits for the History panel), `back(cpu, n)`, `entries(limit)`. Recording costs ~20% of Run speed.
- **Board** (`utils/board.ts`, `components/BoardView.tsx`, a tab next to Pins): LEDs read the pin levels of the snapshot; buttons drive their pin through `handleDrive` (released level = the resistor, held = the active level), so they work like the Pins panel (interrupts, Step Back).
- **Chip diagram:** `components/ChipView.tsx` draws the datasheet block diagram with live values; `utils/chipPaths.ts` `activeBuses()` works out which buses the last step used (from the newest History entry; `f` resolved through RP0 / FSR) and they are drawn in the accent colour.
- **`snapshot()`:** copies the state for React. The `Cpu` object itself keeps changing.

### `App.tsx` state model

- `result` + `assembledCode`: `outdated` (code edited since the last assemble) disables downloads and simulation.
- **The CPU:** one `Cpu`, created once with `useState(() => new Cpu())` and changed in event handlers.
- **Snapshots:** the UI only renders snapshots, kept as `{ now, before }`, so panels can highlight what the last step changed. Load and Reset set `before: null`.
- **Run:** a `useEffect` + `setInterval` (16 ms). Each tick runs what the speed (`utils/runSpeed.ts`: fixed instr/s, Real time = clock / 4 cycles per second, Max) allows for the time since the last tick, with at most 12 ms of work per tick; it measures the actual speed (`runRate`, shown as "×N real time"). Loop state lives in a local object (`pace`): the React Compiler rejects reassigning effect variables from the interval callback. It stops on any `noteFor()` result (a warning, a WDT reset, `GOTO $`, or SLEEP when `cpu.canWake` is false). `stepInfo()` notes (interrupt, wake-up, sleeping) are shown after a single Step only, so they don't stop Run. MCLR (`handleMclr`) does not stop Run.
- **Breakpoints:** `breakpoints` state = source line -> `BreakCondition | null` (null = always stop) (gutter click or F9 in `CodeEditor`). The Run loop maps them to program addresses (first word of each line) and stops when the PC reaches one **after** a step, so a run that starts on a breakpoint moves on; not checked while sleeping. Lines without an instruction get a hollow mark (`codeLines`). The Breakpoints tab (`TabbedPanel` with History) lists them. Data breakpoints (`utils/dataBreakpoints.ts`: W / register / RAM byte changes or becomes a value) are checked after every step in the Run loop (values read before the step into a reused array). Edits move line breakpoints with their lines (`utils/moveBreakpoints.ts`, a line-level prefix/suffix diff in `handleCodeChange`); Open clears them.
- **Step Over / Step Out:** set a `runTarget` (`{ pc | null, depth }`) and start the Run loop at Max; it stops when `stack.depth` (and the PC, if given) reach the target. Step Over targets the address after a CALL at the current depth (so recursion works); Step Out targets depth − 1. Stop, Reset, Assemble and MCLR clear the target.

## Conventions enforced by config

- Lint rule `vite-plus/prefer-vite-plus-imports` is an error: import `defineConfig` etc. from `vite-plus`, not `vite`/`vitest`.
- React lint: `react/rules-of-hooks` is an error; `react/only-export-components` warns (keeps Fast Refresh working, so keep non-component exports out of component files except constants and types).
- The React Compiler is enabled (Babel preset via `@rolldown/plugin-babel` in `vite.config.ts`), so manual `useMemo`/`useCallback`/`memo` is usually unnecessary. Components must follow the Rules of React for it to optimize them. After editing several components, `vp dev` hot reload can mix old and new modules; reload the page if a prop seems missing.
- TypeScript uses project references: `tsconfig.app.json` covers `src/`, `tsconfig.node.json` covers `vite.config.ts`.
- `verbatimModuleSyntax` and `erasableSyntaxOnly`: use `import type` for type-only imports, and no `enum`, `namespace`, or constructor parameter properties (use `as const` objects / union types instead, and assign class fields in the constructor body).
- Relative imports include the extension (`./App.tsx`, `./foo.ts`), per `allowImportingTsExtensions` with bundler resolution.
- `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` are on. The last one matters for opcode `switch` statements: every non-empty case needs a `break`/`return`.
- Colours are CSS custom properties in `src/index.css` (light + dark), including `--accent`, `--current-line`, `--error`, `--warning` and `--success`. Panel bodies scroll (`min-height: 0; overflow: auto`), and the main row has a fixed height.
