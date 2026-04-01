# this was made to fix the screen when the resolution and orientation randomly resets.
# its annoying and theres no fix for even even when editing the config file and rebooting. 

import subprocess

OUTPUT = "HDMI-A-2"
RESOLUTION = "832x624"
ROTATION = "right"

subprocess.run([
    "xrandr",
    "--output", OUTPUT,
    "--mode", RESOLUTION,
    "--rotate", ROTATION
])

# to run directly into terminal instead of python: xrandr --output HDMI-A-2 --mode 832x624 --rotate right
