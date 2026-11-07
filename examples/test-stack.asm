; Stack test: 8 nested CALLs, the most the hardware stack can hold.
; main calls level1, level1 calls level2, ... level8 is the deepest.
;
; 1. Assemble, then Step: each CALL adds a return address to the Stack
;    panel. In level8 the stack is full (8 / 8) and there is no warning.
; 2. Keep stepping: each RETURN takes the newest address off again,
;    back to main, which counts the round trips in count (RAM 0x0C).
; 3. Step Over on "CALL level1" in main runs all 8 levels at once and
;    stops at INCF. Step Out inside a level stops in the level above it.
; 4. See test-stack-overflow.asm for what a 9th CALL does.

        LIST    P=16F84A
        #include <P16F84A.INC>
        __CONFIG _CP_OFF & _WDT_OFF & _XT_OSC   ; watchdog off: no CLRWDT in this program

count   EQU     0x0C            ; round trips through all 8 levels

        ORG     0
        CLRF    count
main    CALL    level1          ; stack: 1 address
        INCF    count, F
        GOTO    main

level1  CALL    level2          ; 2
        RETURN
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
level8  RETLW   0x08            ; W = 8, back to level7

        END
