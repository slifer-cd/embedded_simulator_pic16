; TMR0 interrupt test: Timer0 overflows every 65536 cycles (prescaler 1:256),
; the interrupt routine toggles RB0 (an "LED") and counts the interrupts.
; The main program only waits in GOTO $.
;
; 1. Assemble, then press Run: it keeps running (GOTO $ with interrupts on is a
;    "wait for interrupts" loop), and RB0 in the Pins panel blinks.
;    65536 cycles = 65.5 ms on the chip; Run is slower than real time, so on
;    screen RB0 changes about twice a second.
; 2. To Step through an interrupt, make it come sooner: set the OPTION_REG value
;    to B'11011000' (1:1) and replace CLRF TMR0 with MOVLW 0xF0 / MOVWF TMR0.
;    The first interrupt then comes on Step 20: the status bar says "Interrupt
;    after 0x....", the Stack panel shows the return address, and GIE in INTCON
;    stays 0 until RETFIE sets it again.
; 3. ticks (RAM 0x0E) counts the interrupts.

        LIST    P=16F84A
        #include <P16F84A.INC>

W_TEMP      EQU 0x0C            ; context saving (RAM 0x0C-0x4F is the same in both banks)
STATUS_TEMP EQU 0x0D
ticks       EQU 0x0E            ; number of interrupts

        ORG     0x000           ; reset vector
        GOTO    main

        ORG     0x004           ; interrupt vector: the CPU jumps here, with GIE = 0
isr     MOVWF   W_TEMP          ; save W (MOVWF doesn't change STATUS)
        SWAPF   STATUS, W       ; save STATUS (SWAPF doesn't change any flag)
        MOVWF   STATUS_TEMP

        BCF     INTCON, T0IF    ; clear the flag, or the interrupt comes back right away
        MOVLW   B'00000001'
        XORWF   PORTB, F        ; toggle RB0
        INCF    ticks, F

        SWAPF   STATUS_TEMP, W  ; restore STATUS
        MOVWF   STATUS
        SWAPF   W_TEMP, F       ; restore W without changing STATUS
        SWAPF   W_TEMP, W
        RETFIE                  ; return and set GIE again

main    BSF     STATUS, RP0     ; bank 1
        MOVLW   B'11010111'     ; T0CS = 0 (internal), PSA = 0, PS2:0 = 111 (1:256)
        MOVWF   OPTION_REG
        BCF     TRISB, 0        ; RB0 = output
        BCF     STATUS, RP0     ; bank 0
        CLRF    PORTB
        CLRF    ticks
        CLRF    TMR0
        MOVLW   B'10100000'     ; GIE = 1, T0IE = 1
        MOVWF   INTCON

        GOTO    $               ; wait for interrupts

; The assembler shows message 302 for OPTION_REG and TRISB: normal, bank 1 is selected.

        END
