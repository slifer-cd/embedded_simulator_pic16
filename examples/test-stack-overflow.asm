; Stack overflow test: 9 nested CALLs, one more than the stack holds.
; The real chip gives no error: the 9th CALL silently overwrites the
; oldest return address (the one back to main). The simulator warns.
;
; 1. Assemble, then press Run: it stops with "Stack overflow" right
;    after "CALL level9" in level8. The Stack panel still shows 8 / 8.
; 2. Step on: the RETURNs go back up level8 ... level2 as usual.
; 3. level1's RETURN has no valid address left: Run stops again with
;    "Stack underflow" and the PC jumps to the leftover address, which
;    is the 9th one (back into level8 after "CALL level9"), not main.
;    From then on every RETURN is an underflow: the program goes round
;    level8 ... level1 on leftover addresses forever, and count
;    (RAM 0x0C) never goes up: main is never reached again.

        LIST    P=16F84A
        #include <P16F84A.INC>
        __CONFIG _CP_OFF & _WDT_OFF & _XT_OSC   ; watchdog off: no CLRWDT in this program

count   EQU     0x0C            ; round trips that made it back to main

        ORG     0
        CLRF    count
main    CALL    level1          ; stack: 1 address (this one gets lost)
        INCF    count, F
        GOTO    main

level1  CALL    level2          ; 2
        RETURN                  ; underflow: no address left for this one
level2  CALL    level3          ; 3
        RETURN
level3  CALL    level4          ; 4
        RETURN
level4  CALL    level5          ; 5
        RETURN
level5  CALL    level6          ; 6
        RETURN
level6  CALL    level7          ; 7
        RETURN
level7  CALL    level8          ; 8: the stack is full
        RETURN
level8  CALL    level9          ; 9: overflow, overwrites main's return address
        RETURN
level9  RETLW   0x09

        END
