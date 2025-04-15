#include <ESP32Servo.h>

Servo jab;
Servo cross;
Servo leftHook;
Servo rightHook;
Servo leftUppercut;
Servo rightUppercut;

#include "Combos.h"

#define START_BUTTON_PIN 4

void setup() {
  pinMode(START_BUTTON_PIN, INPUT_PULLUP);

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

// Punch function for executing a punch
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

void fight(int difficulty){
  int combo = random(0,2);
  
  for (int j; j < MAX_MOVES; j++){
    punch(EASYCOMBOS[combo][j]);
    if(punch == BLANK){
      return;
    }
  }
}
int start(){
  int START = digitalread(START_BUTTON_PIN);
  if(START == HIGH){
    return 0;
  }
  else{
    return -1;
  }

}
void loop() {
  if(start() == 0){
    Serial.println("Waiting for difficulty")
    // get difficulty
    // run fight code 
    fight();
    delay(4000); // difficulty delay
  }
  else{
    Serial.println("Waiting for start")
  }

}