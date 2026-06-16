import subprocess
import re

out = subprocess.check_output("netstat -aon", shell=True).decode('utf-8', errors='ignore')
pids_to_kill = set()

for line in out.splitlines():
    if ":8000" in line and "LISTENING" in line:
        parts = line.strip().split()
        if len(parts) >= 5:
            pid = parts[-1]
            if pid.isdigit() and int(pid) > 0:
                pids_to_kill.add(pid)

for pid in pids_to_kill:
    print(f"Killing PID {pid}")
    subprocess.call(f"taskkill /F /PID {pid}", shell=True)

if not pids_to_kill:
    print("No process found on port 8000")
