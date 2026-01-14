#!/bin/bash
# SonarQube Scanner with Locking
# Prevents concurrent scans and handles stale locks
#
# PORTABILITY:
# - SONARQUBE_URL: Override SonarQube server URL (default: http://localhost:9000)
# - SONARQUBE_PROJECT_KEY: Override project key (uses sonar-project.properties by default)
# - SONAR_NODEJS_EXECUTABLE: Override Node.js path (auto-detected if not set)
#
set -e
cd "$(dirname "$0")/.."

# Configuration (override via environment variables)
SONAR_URL="${SONARQUBE_URL:-http://localhost:9000}"

# Lock file for preventing concurrent scans
LOCK_FILE=".sonarqube-scan.lock"
LOCK_TIMEOUT=600 # 10 minutes - max time a scan should take

# Cleanup function
cleanup() {
  if [ -f "$LOCK_FILE" ] && [ "$(cat "$LOCK_FILE" 2>/dev/null)" = "$$" ]; then
    rm -f "$LOCK_FILE"
  fi
}
trap cleanup EXIT

# Check for stale lock and clean up
check_stale_lock() {
  if [ -f "$LOCK_FILE" ]; then
    local lock_pid
    lock_pid=$(cat "$LOCK_FILE" 2>/dev/null)
    local lock_age
    lock_age=$(($(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0)))

    # Check if process is still running
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
      if [ "$lock_age" -gt "$LOCK_TIMEOUT" ]; then
        echo "Warning: Stale lock detected (age: ${lock_age}s, pid: $lock_pid). Removing..."
        rm -f "$LOCK_FILE"
      else
        echo "Error: Another SonarQube scan is in progress (pid: $lock_pid, age: ${lock_age}s)"
        echo "If this is incorrect, remove $LOCK_FILE manually"
        exit 1
      fi
    else
      # Process not running, lock is stale
      echo "Removing stale lock file (process $lock_pid no longer running)"
      rm -f "$LOCK_FILE"
    fi
  fi
}

# Clean up any stale scanner work locks
clean_scanner_locks() {
  if [ -f ".scannerwork/.sonar_lock" ]; then
    echo "Cleaning up stale scanner lock..."
    rm -f ".scannerwork/.sonar_lock"
  fi
}

# Acquire lock
acquire_lock() {
  check_stale_lock
  clean_scanner_locks

  # Try to acquire lock
  if [ -f "$LOCK_FILE" ]; then
    echo "Error: Could not acquire lock - another scan may have started"
    exit 1
  fi

  echo $$ >"$LOCK_FILE"
  echo "Acquired scan lock (pid: $$)"
}

# Handle --start flag to start SonarQube first
if [[ "$1" == "--start" ]]; then
  echo "Starting SonarQube..."
  docker compose -f docker-compose.sonarqube.yml up -d sonarqube sonarqube-db
  echo "Waiting for SonarQube to be ready..."
  for i in {1..60}; do
    if curl -s "${SONAR_URL}/api/system/status" | grep -q '"status":"UP"'; then
      echo "SonarQube is ready"
      break
    fi
    if [ $i -eq 60 ]; then
      echo "Timeout waiting for SonarQube"
      exit 1
    fi
    sleep 2
  done
fi

TOKEN=$(cat .sonarqube-token 2>/dev/null | tr -d "[:space:]")
if [ -z "$TOKEN" ]; then
  echo "Error: .sonarqube-token file not found or empty"
  echo "Create a token at ${SONAR_URL}/account/security"
  exit 1
fi

# Auto-detect Node.js executable if not set
if [ -z "$SONAR_NODEJS_EXECUTABLE" ]; then
  SONAR_NODEJS_EXECUTABLE=$(which node 2>/dev/null || echo "")
fi
NODE_ARG=""
if [ -n "$SONAR_NODEJS_EXECUTABLE" ]; then
  NODE_ARG="-Dsonar.nodejs.executable=$SONAR_NODEJS_EXECUTABLE"
fi

# Build optional project key override
PROJECT_KEY_ARG=""
if [ -n "$SONARQUBE_PROJECT_KEY" ]; then
  PROJECT_KEY_ARG="-Dsonar.projectKey=$SONARQUBE_PROJECT_KEY"
fi

# Acquire lock before starting scan
acquire_lock

echo "Starting SonarQube scan..."
echo "  Server: $SONAR_URL"
sonar-scanner -Dsonar.host.url="$SONAR_URL" -Dsonar.token="$TOKEN" $NODE_ARG $PROJECT_KEY_ARG
echo "Scan complete."
