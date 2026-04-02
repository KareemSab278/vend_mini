import time
import sys

try:
    import RPi.GPIO as GPIO
except ImportError:
    raise SystemExit("RPi.GPIO module not found. Install with: sudo apt install python3-rpi.gpio")

GPIO.setmode(GPIO.BOARD)
PIR_PIN = 26 # the pin not the gpio. 

GPIO.setup(PIR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

print(f"PIR motion sensor test started on pin {PIR_PIN} (mode={GPIO.getmode()})")
print("Press Ctrl+C to exit")

try:
    initial_value = GPIO.input(PIR_PIN)
except RuntimeError as e:
    print("Error: Failed to read PIR pin. Check pin number and wiring.")
    print(e)
    raise SystemExit(1)

if initial_value not in (0, 1):
    print("Error: Unexpected PIR input value. Check sensor and wiring.")
    raise SystemExit(1)

print(f"Initial PIR read: {initial_value} (0=No motion, 1=Motion)")

print("Warming up sensor for 2s...")
time.sleep(2)

print("Monitoring for activity for 5s (wave in front of the sensor now if testing)...")
start = time.time()
found_edge = False
prev = GPIO.input(PIR_PIN)
while time.time() - start < 5:
    v = GPIO.input(PIR_PIN)
    if v != prev:
        found_edge = True
        break
    prev = v
    time.sleep(0.2)

if not found_edge and initial_value == 0:
    print("No activity seen. Performing wiring check by briefly enabling internal pull-up...")
    GPIO.setup(PIR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    time.sleep(0.1)
    probe = GPIO.input(PIR_PIN)
    if probe == 1:
        print("Wiring check: pin reads HIGH with pull-up enabled → line appears floating or sensor not driving it.\nCheck VCC/GND/OUT and module jumpers.")
        GPIO.cleanup()
        sys.exit(1)
    else:
        print("Wiring check: pin still LOW with pull-up → sensor is present and driving LOW at idle. Continuing test.")
    GPIO.setup(PIR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

try:
    while True:
        motion = GPIO.input(PIR_PIN)
        if motion:
            print("Motion detected!")
        else:
            print("No motion")
        time.sleep(0.5)
except KeyboardInterrupt:
    print("\nExiting test")
finally:
    GPIO.cleanup()
import time
