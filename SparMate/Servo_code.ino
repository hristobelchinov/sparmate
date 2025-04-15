#include <ESP32Servo.h>

// Declare Servo objects
Servo jab;
Servo cross;
Servo leftHook;
Servo rightHook;
Servo leftUppercut;
Servo rightUppercut;

int easyCombos[6][10] = {
  {}



}

void setup() {

  // Set frequency
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

// punch function
void punch(Servo* punch) {
  if(punch == &jab){
    punch->write(100);
    delay(300);
    punch->write(180);
  }
  if (punch == &rightHook) {
    punch->write(90);
    delay(300);
    punch->write(170);
  }
  if (punch == &rightUppercut) {
    punch->write(90);
    delay(300);
    punch->write(170);
  }
  if (punch == &cross || punch == &leftHook || punch == &leftUppercut) {
    punch->write(90);
    delay(300);
    punch->write(10);
  }
}


void loop() {
  punch(&jab);
  delay(1000);

  punch(&cross);
  delay(1000);

  punch(&leftHook);
  delay(1000);

  punch(&rightHook);
  delay(1000);

  punch(&leftUppercut);
  delay(1000);

  punch(&rightUppercut);
  delay(1000);

  delay(4000); // After full combo
}