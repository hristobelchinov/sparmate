#include <ESP32Servo.h>

Servo jab;
Servo cross;
Servo leftHook;
Servo rightHook;
Servo leftUppercut;
Servo rightUppercut;

#include "Combos.h"

#define START_BUTTON_PIN     4

#define EASY_BUTTON_PIN     32
#define NORMAL_BUTTON_PIN   33
#define ADVANCED_BUTTON_PIN 34
#define PRO_BUTTON_PIN      35

void setup() {
  Serial.begin(115200);

  pinMode(START_BUTTON_PIN, INPUT_PULLUP);

  pinMode(EASY_BUTTON_PIN, INPUT_PULLUP);
  pinMode(NORMAL_BUTTON_PIN, INPUT_PULLUP);
  pinMode(ADVANCED_BUTTON_PIN, INPUT_PULLUP);
  pinMode(PRO_BUTTON_PIN, INPUT_PULLUP);

  // Set working frequency
  jab.setPeriodHertz(50);
  cross.setPeriodHertz(50);
  leftHook.setPeriodHertz(50);
  rightHook.setPeriodHertz(50);
  leftUppercut.setPeriodHertz(50);
  rightUppercut.setPeriodHertz(50);

  // Attach to pins
  jab.attach(12);
  leftHook.attach(13);
  leftUppercut.attach(14);
  rightUppercut.attach(16);
  rightHook.attach(17);
  cross.attach(18);

  // Initial positions
  jab.write(170);
  rightHook.write(170);
  rightUppercut.write(170);
  cross.write(10);
  leftHook.write(10);
  leftUppercut.write(10);
}

//======== EXECUTE A PUNCH ========//
void punch(Servo* punch) {
  if(punch == JAB || punch == RIGHTHOOK || punch == RIGHTUPPERCUT){
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
void fight(int DIFFICULTY){
  int combo = random(0,2);
  switch(DIFFICULTY){
    case 1: DIFFICULTY_COMBOS_LIST = EASY_COMBOS
            PUNCH_TIMEOUT = EASY_PUNCH_TIMEOUT
            COMBO_TIMEOUT = EASY_COMBO_TIMEOUT
  }
  for (int j; j < MAX_MOVES; j++){
    punch(EASYCOMBOS[combo][j]);
    if(punch == BLANK){
      return;
    }
  }
}

//======== START/STOP BUTTON ========//
bool running = true; //////////////////////////////////////////////////////////////////CHNAGE THAT YOU STUPID JEW
void startstop(){
  int STARTSTOP_BUTTON = digitalRead(START_BUTTON_PIN);
  if(STARTSTOP_BUTTON == LOW){
    running = !running;
    delay(200);
  }
}

//======== DIFFICULTY ========//
int DIFFICULTY = 0;
int PUNCH_TIMEOUT;
int COMBO_TIMEOUT;

int selectDifficulty(){

  int EASY_BUTTON = digitalRead(EASY_BUTTON_PIN);
  int NORMAL_BUTTON = digitalRead(NORMAL_BUTTON_PIN);
  int ADVANCED_BUTTON = digitalRead(ADVANCED_BUTTON_PIN);
  int PRO_BUTTON = digitalRead(PRO_BUTTON_PIN);

  if(EASY_BUTTON == LOW){
    DIFFICULTY = 1;
    PUNCH_TIMEOUT = EASY_PUNCH_TIMEOUT;
    COMBO_TIMEOUT = EASY_COMBO_TIMEOUT;
  }
  if(NORMAL_BUTTON == LOW){
    DIFFICULTY = 2;
    PUNCH_TIMEOUT = NORMAL_PUNCH_TIMEOUT;
    COMBO_TIMEOUT = NORMAL_COMBO_TIMEOUT;
  }
  if(ADVANCED_BUTTON == LOW){
    DIFFICULTY = 3;
    PUNCH_TIMEOUT = ADVANCED_PUNCH_TIMEOUT;
    COMBO_TIMEOUT = ADVANCED_COMBO_TIMEOUT;
  }
  if(PRO_BUTTON == LOW){
    DIFFICULTY = 4;
    PUNCH_TIMEOUT = PRO_PUNCH_TIMEOUT;
    COMBO_TIMEOUT = PRO_COMBO_TIMEOUT;
  }

  } // while difficulty mode is 0 (not chosen)
Servo* (*CHOSEN_COMBOS_DIFF)[MAX_MOVES];
}

void loop() {
  startstop();
  if(running){
    selectDifficulty();
    fight();
  }
  
}
