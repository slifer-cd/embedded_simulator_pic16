; Pins test: RB0 is an input (a "button"), RB1 is an output (an "LED").
; The program copies RB0 to RB1 forever.
;
; 1. Assemble, then press Run (it keeps running: there is no GOTO $).
; 2. In the Pins panel, click the RB0/INT button: open -> high -> low.
;    RB1 follows RB0: high -> LED on, low/open -> LED off.
; 3. Try RA0-RA3 / RB2-RB7 too: they are inputs (TRIS reset value),
;    so they show "open" and read as 0 until you drive them.

        LIST    P=16F84A
        #include <P16F84A.INC>
        __CONFIG _CP_OFF & _WDT_OFF & _XT_OSC   ; watchdog off: no CLRWDT in this program

        ORG     0
        BSF     STATUS, RP0     ; bank 1
        BCF     TRISB, 1        ; RB1 = output (RB0 stays input)
        BCF     STATUS, RP0     ; bank 0

loop    BTFSS   PORTB, 0        ; button (RB0) high?
        GOTO    off             ; no
        BSF     PORTB, 1        ; yes: LED on
        GOTO    loop
off     BCF     PORTB, 1        ; LED off
        GOTO    loop

        END
