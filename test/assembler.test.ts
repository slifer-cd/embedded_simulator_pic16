import { describe, expect, it } from "vite-plus/test";
import { assemble } from "../src/assembler/assembler.ts";

const PROGRAM = `        LIST    P=16F84A
        #include <P16F84A.INC>
        __CONFIG _CP_OFF & _WDT_OFF & _XT_OSC

count   EQU     0x0C

        ORG     0
start   MOVLW   0x05
        MOVWF   count
loop    DECFSZ  count, F
        GOTO    loop
        GOTO    $

        ORG     0x2100
        DE      0x11, 0x22
        END`;

describe("assembler: a whole program", () => {
  const result = assemble(PROGRAM);

  it("succeeds without messages", () => {
    expect(result.messages).toEqual([]);
    expect(result.success).toBe(true);
    expect([result.errorCount, result.warningCount, result.messageCount]).toEqual([0, 0, 0]);
  });

  it("builds the program memory image, unprogrammed words = 0x3FFF", () => {
    expect(result.program).toHaveLength(1024);
    expect(result.program.slice(0, 5)).toEqual([0x3005, 0x008c, 0x0b8c, 0x2802, 0x2804]);
    expect(result.program[5]).toBe(0x3fff);
    expect(result.program[1023]).toBe(0x3fff);
  });

  it("builds the EEPROM image, erased bytes = 0xFF", () => {
    expect(result.eeprom).toHaveLength(64);
    expect(result.eeprom.slice(0, 3)).toEqual([0x11, 0x22, 0xff]);
  });

  it("takes the configuration word from __CONFIG", () => {
    expect(result.config).toBe(0x3ff9);
  });

  it("keeps the stage outputs (for the listing and the UI)", () => {
    expect(result.symbols.get("loop")?.value).toBe(2);
    expect(result.words.find((w) => w.address === 0)?.line).toBe(8);
    expect(result.addresses).toHaveLength(result.statements.length);
  });
});

describe("assembler: defaults and messages", () => {
  it("uses the unprogrammed config word 0x3FFF without __CONFIG", () => {
    expect(assemble("        NOP\n        END").config).toBe(0x3fff);
  });

  it("reports every problem at once, sorted by line, and fails on errors", () => {
    const result = assemble(
      "        GOTO    nowhere\n        MOVLW   0x1FF\n        FOO     1\n        END",
    );
    expect(result.success).toBe(false);
    expect(result.messages.map((m) => [m.line, m.severity])).toEqual([
      [1, "error"],
      [2, "warning"],
      [3, "error"],
    ]);
    expect(result.errorCount).toBe(2);
    expect(result.warningCount).toBe(1);
  });

  it("still succeeds with only warnings and messages", () => {
    const result = assemble("        BSF     STATUS, RP0\n        CLRF    TRISB\n        END");
    expect(result.success).toBe(true);
    expect(result.messageCount).toBe(1); // 302
  });

  it("needs END (129)", () => {
    const result = assemble("        NOP");
    expect(result.success).toBe(false);
    expect(result.messages[0]).toMatchObject({ severity: "error", code: 129 });
  });

  it("ignores everything after END", () => {
    const result = assemble("        NOP\n        END\n        GOTO nowhere");
    expect(result.success).toBe(true);
    expect(result.words).toHaveLength(1);
  });
});
