; EEPROM test: write 0x2A to EEPROM address 0x05, then read it back into W.
; Run it: it stops at "done GOTO done" after about 4000 cycles (the write takes ~4 ms).
; Expected: EEPROM panel byte 05 = 2A, W = 2A, EECON1 bit EEIF (bit 4) = 1.

        LIST    P=16F84A
        #include <P16F84A.INC>
        __CONFIG _CP_OFF & _WDT_OFF & _XT_OSC   ; watchdog off: no CLRWDT in this program

        ORG     0
; ---- write ----
        BCF     STATUS, RP0     ; bank 0
        MOVLW   0x05
        MOVWF   EEADR           ; address
        MOVLW   0x2A
        MOVWF   EEDATA          ; data
        BSF     STATUS, RP0     ; bank 1 (EECON1, EECON2)
        BSF     EECON1, WREN    ; enable writes
        BCF     INTCON, GIE     ; no interrupts during the sequence
        MOVLW   0x55
        MOVWF   EECON2          ; unlock 1
        MOVLW   0xAA
        MOVWF   EECON2          ; unlock 2
        BSF     EECON1, WR      ; start the write
wait    BTFSC   EECON1, WR      ; WR = 1 while writing
        GOTO    wait
        BCF     EECON1, WREN    ; disable writes again

; ---- read back ----
        BCF     STATUS, RP0     ; bank 0
        MOVLW   0x05
        MOVWF   EEADR
        BSF     STATUS, RP0     ; bank 1
        BSF     EECON1, RD      ; read: EEDATA = EEPROM[EEADR]
        BCF     STATUS, RP0     ; bank 0
        MOVF    EEDATA, W       ; W = 0x2A

done    GOTO    done

        END
