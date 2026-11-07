; RB0/INT and RB4-RB7 change interrupt test. The pins act like buttons you click
; in the Pins panel; the main program only waits in GOTO $.
;
;   RB0/INT   rising edge  -> INTF -> int_count + 1, RA0 toggles
;   RB4-RB7   any change   -> RBIF -> rb_count + 1, RA1 toggles, rb_last = PORTB
;
; 1. Assemble, then press Run (it keeps running: interrupts are on).
; 2. Click RB0/INT: open -> high is a rising edge (one INT). high -> low and
;    low -> open are not (open reads 0: no pull-ups here).
; 3. Click any of RB4-RB7: every level change is one RB-change interrupt
;    (open -> high, then high -> low: two interrupts).
; 4. Watch int_count, rb_count and rb_last in the RAM panel, and RA0 / RA1 in Pins.
;    Stop and Step to see the routine pick the source (BTFSC INTCON, INTF / RBIF).
;
; Try: remove MOVF PORTB, W in on_rb. RBIF then comes back right after it is
; cleared (the mismatch is still there), and rb_count keeps running.

        LIST    P=16F84A
        #include <P16F84A.INC>

W_TEMP      EQU 0x0C            ; context saving
STATUS_TEMP EQU 0x0D
int_count   EQU 0x0E            ; RB0/INT interrupts
rb_count    EQU 0x0F            ; RB4-RB7 change interrupts
rb_last     EQU 0x10            ; PORTB as read by the last RB-change interrupt

        ORG     0x000
        GOTO    main

        ORG     0x004           ; interrupt vector
isr     MOVWF   W_TEMP          ; save W and STATUS
        SWAPF   STATUS, W
        MOVWF   STATUS_TEMP

        BTFSC   INTCON, INTF    ; which source? (both can be set: the other one
        GOTO    on_int          ; interrupts again right after RETFIE)
        BTFSC   INTCON, RBIF
        GOTO    on_rb
        GOTO    done

on_int  BCF     INTCON, INTF
        INCF    int_count, F
        MOVLW   B'00000001'
        XORWF   PORTA, F        ; toggle RA0
        GOTO    done

on_rb   MOVF    PORTB, W        ; read PORTB FIRST: this ends the mismatch
        MOVWF   rb_last
        BCF     INTCON, RBIF    ; then clear the flag
        INCF    rb_count, F
        MOVLW   B'00000010'
        XORWF   PORTA, F        ; toggle RA1

done    SWAPF   STATUS_TEMP, W  ; restore STATUS and W
        MOVWF   STATUS
        SWAPF   W_TEMP, F
        SWAPF   W_TEMP, W
        RETFIE

main    BSF     STATUS, RP0     ; bank 1
        MOVLW   B'11111100'     ; RA0, RA1 = outputs
        MOVWF   TRISA           ; (TRISB stays 0xFF: all PORTB pins are inputs;
        BCF     STATUS, RP0     ;  OPTION_REG stays 0xFF: INTEDG = 1, rising edge)
        CLRF    PORTA
        CLRF    int_count
        CLRF    rb_count
        MOVF    PORTB, W        ; store the current RB7:RB4 levels: no false start
        MOVWF   rb_last
        MOVLW   B'10011000'     ; GIE, INTE, RBIE
        MOVWF   INTCON

        GOTO    $               ; wait for interrupts

; The assembler shows message 302 for TRISA: normal, bank 1 is selected.

        END
