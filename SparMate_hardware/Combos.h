#ifndef COMBOS_H
#define COMBOS_H

// Macros for servo pointers. These assume that the Servo objects are declared in your main file.
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

// ----- Combo timing settings -----
#define EASY_PUNCH_TIMEOUT     3000
#define EASY_COMBO_TIMEOUT     5000

#define NORMAL_PUNCH_TIMEOUT   2000
#define NORMAL_COMBO_TIMEOUT   4000

#define ADVANCED_PUNCH_TIMEOUT 800
#define ADVANCED_COMBO_TIMEOUT 2500

#define PRO_PUNCH_TIMEOUT      450
#define PRO_COMBO_TIMEOUT      1250

// Maximum moves per combo.
#define MAX_MOVES 6
// Sentinel value indicating no valid move (now as a pointer type)
#define BLANK NULL

// IMPORTANT: Change the array type from int to Servo* because we're storing pointer values.
// Note that each combo row is now an array of Servo* values.

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

#endif  // COMBOS_H
