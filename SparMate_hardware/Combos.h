#ifndef COMBOS_H
#define COMBOS_H

#define JAB           (&jab)
#define CROSS         (&cross)
#define LEFTHOOK      (&leftHook)
#define RIGHTHOOK     (&rightHook)
#define LEFTUPPERCUT  (&leftUppercut)
#define RIGHTUPPERCUT (&rightUppercut)

//========FEINTS========//
// #define JABF (&jab)
// #define CROSSF (&cross)
// #define LEFTHOOKF (&leftHook)
// #define RIGHTHOOKF (&rightHook)
// #define LEFTUPPERCUTF (&leftUppercut)
// #define RIGHTUPPERCUTF (&rightUppercut)

#define EASY_PUNCH_TIMEOUT     3000
#define EASY_COMBO_TIMEOUT     5000

#define NORMAL_PUNCH_TIMEOUT   2000
#define NORMAL_COMBO_TIMEOUT   4000

#define ADVANCED_PUNCH_TIMEOUT 800
#define ADVANCED_COMBO_TIMEOUT 2500

#define PRO_PUNCH_TIMEOUT      450
#define PRO_COMBO_TIMEOUT      1250

#define MAX_MOVES 6
#define BLANK NULL

Servo* EASY_COMBOS[3][MAX_MOVES] = {
  { JAB,       CROSS,       LEFTHOOK,     BLANK, BLANK, BLANK },
  { JAB,       LEFTHOOK,    CROSS,        RIGHTHOOK, BLANK, BLANK },
  { JAB,       CROSS,       JAB,          LEFTHOOK,  CROSS, BLANK }
};

Servo* NORMAL_COMBOS[3][MAX_MOVES] = {
  { JAB,       CROSS,       LEFTHOOK,     BLANK, BLANK, BLANK },
  { JAB,       LEFTHOOK,    CROSS,        RIGHTHOOK, BLANK, BLANK },
  { JAB,       CROSS,       JAB,          LEFTHOOK,  CROSS, BLANK }
};

Servo* ADVANCED_COMBOS[3][MAX_MOVES] = {
  { JAB,       CROSS,       LEFTHOOK,     BLANK, BLANK, BLANK },
  { JAB,       LEFTHOOK,    CROSS,        RIGHTHOOK, BLANK, BLANK },
  { JAB,       CROSS,       JAB,          LEFTHOOK,  CROSS, BLANK }
};

Servo* PRO_COMBOS[3][MAX_MOVES] = {
  { JAB,       CROSS,       LEFTHOOK,     BLANK, BLANK, BLANK },
  { JAB,       LEFTHOOK,    CROSS,        RIGHTHOOK, BLANK, BLANK },
  { JAB,       CROSS,       JAB,          LEFTHOOK,  CROSS, BLANK }
};

#endif
