// Servo_code.ino
#include <ESP32Servo.h>

Servo jab;
Servo cross;
Servo leftHook;
Servo rightHook;
Servo leftUppercut;
Servo rightUppercut;

#include "Combos.h"

#define START_BUTTON_PIN    4
#define EASY_BUTTON_PIN     32
#define NORMAL_BUTTON_PIN   33
#define ADVANCED_BUTTON_PIN 34
#define PRO_BUTTON_PIN      35

// Global variables
Servo* (*DIFFICULTY_COMBOS_LIST)[MAX_MOVES];
bool running = true;
int  DIFFICULTY = 0;
int  PUNCH_TIMEOUT;
int  COMBO_TIMEOUT;

void setup() {
  Serial.begin(115200);

  pinMode(START_BUTTON_PIN,    INPUT_PULLUP);

  pinMode(EASY_BUTTON_PIN,     INPUT_PULLUP);
  pinMode(NORMAL_BUTTON_PIN,   INPUT_PULLUP);
  pinMode(ADVANCED_BUTTON_PIN, INPUT_PULLUP);
  pinMode(PRO_BUTTON_PIN,      INPUT_PULLUP);

  jab.setPeriodHertz(50);
  cross.setPeriodHertz(50);
  leftHook.setPeriodHertz(50);
  rightHook.setPeriodHertz(50);
  leftUppercut.setPeriodHertz(50);
  rightUppercut.setPeriodHertz(50);

  jab.attach(12);
  leftHook.attach(13);
  leftUppercut.attach(14);
  rightUppercut.attach(16);
  rightHook.attach(17);
  cross.attach(18);

  jab.write(170);
  rightHook.write(170);
  rightUppercut.write(170);
  cross.write(10);
  leftHook.write(10);
  leftUppercut.write(10);
}

//======== EXECUTE A PUNCH ========//
void punch(Servo* punch) {
  if (punch == JAB || punch == RIGHTHOOK || punch == RIGHTUPPERCUT) {
    punch->write(90);
    delay(300);
    punch->write(170);
  }
  if (punch == CROSS || punch == LEFTHOOK || punch == LEFTUPPERCUT) {
    punch->write(90);
    delay(300);
    punch->write(10);
  }
}

//======== EXECUTE COMBO ========//
void fight(int DIFFICULTY) {
  int combo = random(0, 3);  // Changed to 0-2 range for array indices

  switch (DIFFICULTY) {
    case 1: DIFFICULTY_COMBOS_LIST = EASY_COMBOS;     break;
    case 2: DIFFICULTY_COMBOS_LIST = NORMAL_COMBOS;   break;
    case 3: DIFFICULTY_COMBOS_LIST = ADVANCED_COMBOS; break;
    case 4: DIFFICULTY_COMBOS_LIST = PRO_COMBOS;      break;
    default: return;  // Invalid difficulty, exit function
  }

  for (int j = 0; j < MAX_MOVES; j++) {
    Servo* mv = DIFFICULTY_COMBOS_LIST[combo][j];
    if (mv == BLANK) return;
    punch(mv);
    delay(PUNCH_TIMEOUT);
  }
}

//======== START/STOP BUTTON ========//
void startstop() {
  int STARTSTOP_BUTTON = digitalRead(START_BUTTON_PIN);
  if (STARTSTOP_BUTTON == LOW) {
    running = !running;
    delay(200);  // Debounce
  }
}

//======== DIFFICULTY ========// `      // here is the problem BROOOOOOO ITS T+RUGHT HER BECAUSE IT SOMEHOW READS AS LOW BECAUSE WHEN I SET THEM TO ZERO they didnt run which means when its normal to difficulty to become one of the numbers  it somehow writes the difficulty to another value and thast hy it starts
void selectDifficulty() {  // Changed return type to void
  int EASY_BUTTON     = digitalRead(EASY_BUTTON_PIN);
  int NORMAL_BUTTON   = digitalRead(NORMAL_BUTTON_PIN);
  int ADVANCED_BUTTON = digitalRead(ADVANCED_BUTTON_PIN);
  int PRO_BUTTON      = digitalRead(PRO_BUTTON_PIN);

  if (EASY_BUTTON == LOW) {
    DIFFICULTY = 1;
    PUNCH_TIMEOUT = EASY_PUNCH_TIMEOUT;
    COMBO_TIMEOUT = EASY_COMBO_TIMEOUT;
    delay(200);  // Debounce
  }
  else if (NORMAL_BUTTON == LOW) {
    DIFFICULTY = 2;
    PUNCH_TIMEOUT = NORMAL_PUNCH_TIMEOUT;
    COMBO_TIMEOUT = NORMAL_COMBO_TIMEOUT;
    delay(200);  // Debounce
  }
  else if (ADVANCED_BUTTON == LOW) {
    DIFFICULTY = 3;
    PUNCH_TIMEOUT = ADVANCED_PUNCH_TIMEOUT;
    COMBO_TIMEOUT = ADVANCED_COMBO_TIMEOUT;
    delay(200);  // Debounce
  }
  else if (PRO_BUTTON == LOW) {
    DIFFICULTY = 4;
    PUNCH_TIMEOUT = PRO_PUNCH_TIMEOUT;
    COMBO_TIMEOUT = PRO_COMBO_TIMEOUT;
    delay(200);  // Debounce
  }
}

void loop() {
  startstop();
  if (running) {
    selectDifficulty();  // Check for difficulty selection every loop
    if (DIFFICULTY != 0) {
      fight(DIFFICULTY);
      delay(COMBO_TIMEOUT);
    }
  }
}