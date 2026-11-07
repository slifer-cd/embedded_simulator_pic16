; Timer0 test: internal clock (T0CS = 0), prescaler 1:4 assigned to Timer0.
; The program waits for 3 Timer0 overflows (T0IF), then stops at GOTO $.
;
; One overflow = 256 increments x 4 cycles = 1024 cycles.
;
; 1. Assemble, then Step: after MOVWF OPTION_REG, TMR0 (Registers panel)
;    goes up by 1 every 4 cycles. Right after CLRF TMR0 it stays 0x00
;    for 2 cycles (a write to TMR0 pauses Timer0).
; 2. Press Run: it stops at GOTO $ with count = 3 (RAM 0x0C) and the
;    cycle counter at 3091 (see the cycle math at the end of this file).
; 3. Try other prescaler values (PS2:0) or PSA = 1 (1:1) and check the cycles.

        LIST    P=16F84A
        #include <P16F84A.INC>

count   EQU     0x0C            ; number of overflows seen

        ORG     0
        BSF     STATUS, RP0     ; bank 1
        MOVLW   B'11010001'     ; T0CS = 0 (internal clock), PSA = 0, PS2:0 = 001 (1:4)
        MOVWF   OPTION_REG
        BCF     STATUS, RP0     ; bank 0
        CLRF    count
        CLRF    TMR0            ; start from 0 (also clears the prescaler)

wait    BTFSS   INTCON, T0IF    ; overflow?
        GOTO    wait            ; no: keep waiting
        BCF     INTCON, T0IF    ; yes: clear the flag (the hardware never does)
        INCF    count, F
        MOVLW   .3
        SUBWF   count, W        ; Z = 1 when count == 3
        BTFSS   STATUS, Z
        GOTO    wait

        GOTO    $               ; done

; Cycle math (CLRF TMR0 ends at cycle 6):
;   first overflow:  CLRF's own cycle + 1 more paused cycle, then 1024 counted
;                    -> T0IF is set at cycle 6 + 1 + 1024 = 1031
;                    (Step shows 1032: the GOTO that overflow happens in takes 2 cycles)
;   then every 1024 cycles: 2055, 3079
;   the wait loop and the code after it add a few cycles each time, but Timer0
;   keeps counting during them, so the overflows stay 1024 cycles apart.
;   After the 3rd, the wait loop notices the flag, the count check runs, and
;   GOTO $ ends at cycle 3091.
;
; The assembler shows message 302 for MOVWF OPTION_REG: normal, we did select bank 1.

        END
