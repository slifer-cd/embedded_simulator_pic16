; Watchdog, SLEEP and reset types. At start the program reads STATUS.TO / PD to
; find out WHY it (re)started, and shows it on PORTB:
;
;   TO PD   reason                                      PORTB
;   1  1    power-on (or MCLR while running, see below) RB0 on
;   0  1    watchdog reset                              RB1 on, then SLEEP loop
;   1  0    MCLR during SLEEP                           RB2 on
;   (0  0   watchdog wake-up from SLEEP: no restart, the program goes on after SLEEP)
;
; The WDT postscaler is 1:1 here, so the watchdog times out after 18 ms.
;
; 1. Assemble, Run. The "wait" loop never runs CLRWDT: after 18 ms the WDT resets
;    the chip. Run stops with "Watchdog reset".
; 2. Run again: RB1 is on, and the program sleeps. Every 18 ms the WDT wakes it up
;    (TO = 0, PD = 0): RB7 toggles and wakeups counts (RAM 0x0D). Run skips SLEEP
;    time quickly, so the count goes up fast. Step to see one wake-up at a time.
; 3. Press MCLR while it sleeps: RB2 on (MCLR during SLEEP). After 18 ms of
;    "wait" the WDT resets it again.
;
; RAM is not cleared by MCLR / WDT resets, so the counters keep counting.
; MCLR while running leaves TO / PD as they were, so it reports the same reason as
; the reset before it (that's how the real chip works).

        LIST    P=16F84A
        #include <P16F84A.INC>
        __CONFIG _CP_OFF & _WDT_ON & _XT_OSC    ; watchdog ON

wdt_resets  EQU 0x0C            ; watchdog resets seen
wakeups     EQU 0x0D            ; watchdog wake-ups from SLEEP
mclr_sleeps EQU 0x0E            ; MCLR resets during SLEEP

        ORG     0x000
start   BSF     STATUS, RP0     ; bank 1
        CLRF    TRISB           ; PORTB = outputs
        MOVLW   B'11111000'     ; PSA = 1 (prescaler to the WDT), PS2:0 = 000: 1:1, 18 ms
        MOVWF   OPTION_REG
        BCF     STATUS, RP0     ; bank 0

        BTFSS   STATUS, NOT_TO  ; TO = 0: the watchdog reset the chip
        GOTO    wdt_reset
        BTFSS   STATUS, NOT_PD  ; TO = 1, PD = 0: MCLR during SLEEP
        GOTO    mclr_in_sleep

power_on                        ; TO = 1, PD = 1
        MOVLW   B'00000001'     ; RB0
        MOVWF   PORTB
wait    NOP                     ; no CLRWDT here: the WDT resets the chip after 18 ms
        GOTO    wait            ; (not GOTO $: Run would stop there)

wdt_reset
        INCF    wdt_resets, F
        MOVLW   B'00000010'     ; RB1
        MOVWF   PORTB
sleep_loop
        SLEEP                   ; the WDT wakes it up after 18 ms
        INCF    wakeups, F      ; runs right after the wake-up
        MOVLW   B'10000000'
        XORWF   PORTB, F        ; toggle RB7
        GOTO    sleep_loop

mclr_in_sleep
        INCF    mclr_sleeps, F
        MOVLW   B'00000100'     ; RB2
        MOVWF   PORTB
        GOTO    wait

; The assembler shows message 302 for TRISB and OPTION_REG: normal, bank 1 is selected.

        END
