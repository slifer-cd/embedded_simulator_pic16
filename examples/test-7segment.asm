; 7-segment test: every press of the button on RA0 counts 0 -> 9 -> 0 on a
; 7-segment display on PORTB (segments a-g on RB0-RB6, dp on RB7).
;
; 1. In the Board tab (next to Pins), add:
;      - a 7-segment display (common cathode)
;      - a Button on RA0, active low (pull-up: reads 0 while held)
; 2. Assemble, Run (any speed works: the program waits for the button).
; 3. Hold and release the button: the digit goes up by one each time.
;
; The digit pattern comes from a table: ADDWF PCL, F jumps to RETLW n (a "computed
; goto"). It works because the table is in the first 256 words and PCLATH = 0.

        LIST    P=16F84A
        #include <P16F84A.INC>
        __CONFIG _CP_OFF & _WDT_OFF & _XT_OSC   ; watchdog off: no CLRWDT in this program

count   EQU     0x0C            ; the digit shown, 0-9

        ORG     0
        BSF     STATUS, RP0     ; bank 1
        CLRF    TRISB           ; PORTB = outputs (the segments); TRISA stays 1F: RA0 input
        BCF     STATUS, RP0     ; bank 0
        CLRF    count

show    MOVF    count, W
        CALL    digit           ; W = segment pattern of the digit
        MOVWF   PORTB

press   BTFSC   PORTA, 0        ; wait until the button is held (RA0 = 0)
        GOTO    press
release BTFSS   PORTA, 0        ; ... and released again (RA0 = 1)
        GOTO    release

        INCF    count, F        ; next digit, 9 -> 0
        MOVLW   .10
        SUBWF   count, W        ; Z = 1 when count = 10
        BTFSC   STATUS, Z
        CLRF    count
        GOTO    show

; Segment patterns: bit 0 = a ... bit 6 = g (1 = lit, common cathode)
digit   ADDWF   PCL, F
        RETLW   B'00111111'     ; 0: a b c d e f
        RETLW   B'00000110'     ; 1: b c
        RETLW   B'01011011'     ; 2: a b d e g
        RETLW   B'01001111'     ; 3: a b c d g
        RETLW   B'01100110'     ; 4: b c f g
        RETLW   B'01101101'     ; 5: a c d f g
        RETLW   B'01111101'     ; 6: a c d e f g
        RETLW   B'00000111'     ; 7: a b c
        RETLW   B'01111111'     ; 8: all
        RETLW   B'01101111'     ; 9: a b c d f g

; The assembler shows message 302 for TRISB: normal, bank 1 is selected.

        END
