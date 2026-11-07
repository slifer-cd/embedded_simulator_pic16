; Timer0 external clock test: TMR0 counts rising edges on RA4/T0CKI (pin 3).
; The program copies TMR0 to PORTB forever, so RB0-RB7 show the count in binary.
;
; 1. Assemble, then press Run (it keeps running: there is no GOTO $).
; 2. In the Pins panel, click the RA4/T0CKI button: open -> high -> low -> open.
;    Every change to high is a rising edge: TMR0 goes up by 1 and RB0-RB7 follow.
;    (While stepping instead of running: Step once after each click, or the
;    simulator never sees the pin change.)
; 3. Try T0SE = 1 (count falling edges) or PSA = 0 with PS2:0 = 000 (1:2: every
;    second edge counts) in the OPTION_REG value below.

        LIST    P=16F84A
        #include <P16F84A.INC>
        __CONFIG _CP_OFF & _WDT_OFF & _XT_OSC   ; watchdog off: no CLRWDT in this program

        ORG     0
        BSF     STATUS, RP0     ; bank 1
        MOVLW   B'11101000'     ; T0CS = 1 (RA4 clock), T0SE = 0 (rising), PSA = 1 (1:1)
        MOVWF   OPTION_REG
        CLRF    TRISB           ; PORTB = outputs (the count)
        BCF     STATUS, RP0     ; bank 0
        CLRF    TMR0

loop    MOVF    TMR0, W         ; copy the count to the LEDs
        MOVWF   PORTB
        GOTO    loop

; The assembler shows message 302 for OPTION_REG and TRISB: normal, bank 1 is selected.

        END
