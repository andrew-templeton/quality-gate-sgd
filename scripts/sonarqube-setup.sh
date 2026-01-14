#!/bin/bash
# SonarQube Local Setup Script
# Usage: ./scripts/sonarqube-setup.sh [start|stop|scan|status|token]
#
# PORTABILITY:
# - SONARQUBE_URL: Override SonarQube server URL (default: http://localhost:9000)
# - SONARQUBE_PROJECT_KEY: Override project key for dashboard URL
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.sonarqube.yml"
SONAR_URL="${SONARQUBE_URL:-http://localhost:9000}"

# Auto-detect project key from sonar-project.properties
detect_project_key() {
  if [ -n "$SONARQUBE_PROJECT_KEY" ]; then
    echo "$SONARQUBE_PROJECT_KEY"
  elif [ -f "$PROJECT_DIR/sonar-project.properties" ]; then
    grep "^sonar.projectKey=" "$PROJECT_DIR/sonar-project.properties" | cut -d= -f2 | tr -d ' '
  else
    echo "my-project"
  fi
}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

wait_for_sonarqube() {
    log_info "Waiting for SonarQube to start (this may take 1-2 minutes)..."
    local max_attempts=60
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s "$SONAR_URL/api/system/status" | grep -q '"status":"UP"'; then
            log_info "SonarQube is ready!"
            return 0
        fi
        echo -n "."
        sleep 5
        ((attempt++))
    done

    log_error "SonarQube failed to start after $((max_attempts * 5)) seconds"
    return 1
}

start_sonarqube() {
    log_step "Starting SonarQube..."

    # Check if already running
    if curl -s "$SONAR_URL/api/system/status" 2>/dev/null | grep -q '"status":"UP"'; then
        log_info "SonarQube is already running at $SONAR_URL"
        return 0
    fi

    docker compose -f "$COMPOSE_FILE" up -d
    wait_for_sonarqube

    echo ""
    log_info "SonarQube is running!"
    echo ""
    echo "  URL: $SONAR_URL"
    echo "  Default credentials: admin / admin"
    echo ""
    echo "  Next steps:"
    echo "  1. Open $SONAR_URL in your browser"
    echo "  2. Change the admin password when prompted"
    echo "  3. Generate a token: $0 token"
    echo "  4. Run a scan: $0 scan"
}

stop_sonarqube() {
    log_step "Stopping SonarQube..."
    docker compose -f "$COMPOSE_FILE" down
    log_info "SonarQube stopped"
}

status_sonarqube() {
    if curl -s "$SONAR_URL/api/system/status" 2>/dev/null | grep -q '"status":"UP"'; then
        log_info "SonarQube is running at $SONAR_URL"
        docker compose -f "$COMPOSE_FILE" ps
    else
        log_warn "SonarQube is not running"
    fi
}

generate_token() {
    echo ""
    log_info "To generate a SonarQube token:"
    echo ""
    echo "  1. Open $SONAR_URL in your browser"
    echo "  2. Log in (default: admin/admin)"
    echo "  3. Go to: My Account > Security > Generate Tokens"
    echo "  4. Create a token named 'quality-gate'"
    echo "  5. Save the token to .sonarqube-token:"
    echo ""
    echo "     echo 'your-token-here' > .sonarqube-token"
    echo ""
}

open_browser() {
    local url="$1"
    if [[ "$(uname)" == "Darwin" ]]; then
        open "$url"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$url"
    else
        log_info "Open in browser: $url"
    fi
}

run_scan() {
    log_step "Running SonarQube scan..."

    # Check if SonarQube is running
    if ! curl -s "$SONAR_URL/api/system/status" 2>/dev/null | grep -q '"status":"UP"'; then
        log_error "SonarQube is not running. Start it with: $0 start"
        exit 1
    fi

    cd "$PROJECT_DIR"

    # Get token from env or file
    local token="${SONAR_TOKEN:-}"
    if [ -z "$token" ] && [ -f ".sonarqube-token" ]; then
        token=$(cat .sonarqube-token)
        log_info "Using token from .sonarqube-token file"
    fi

    if [ -z "$token" ]; then
        log_error "No SonarQube token found. Set SONAR_TOKEN or run: $0 token"
        exit 1
    fi

    # Generate coverage first
    log_info "Generating test coverage..."
    npm run test -- --coverage --passWithNoTests || true

    # Use Docker-based sonar-scanner (no Java required)
    log_info "Running SonarQube scan via Docker..."

    # On macOS, use host.docker.internal instead of localhost
    local docker_sonar_url="http://host.docker.internal:9000"
    if [[ "$(uname)" == "Linux" ]]; then
        docker_sonar_url="$SONAR_URL"
    fi

    docker run --rm \
        --add-host=host.docker.internal:host-gateway \
        -e SONAR_HOST_URL="$docker_sonar_url" \
        -e SONAR_TOKEN="$token" \
        -v "$PROJECT_DIR:/usr/src" \
        sonarsource/sonar-scanner-cli \
        -Dsonar.projectBaseDir=/usr/src

    local project_key
    project_key=$(detect_project_key)
    echo ""
    log_info "Scan complete! View results at: $SONAR_URL/dashboard?id=$project_key"
}

auto_run() {
    log_step "SonarQube Auto Mode - Starting complete analysis..."

    cd "$PROJECT_DIR"

    # Step 1: Check token exists
    local token="${SONAR_TOKEN:-}"
    if [ -z "$token" ] && [ -f ".sonarqube-token" ]; then
        token=$(cat .sonarqube-token)
    fi

    if [ -z "$token" ]; then
        log_error "No SonarQube token found!"
        echo ""
        echo "  First-time setup required:"
        echo "  1. Run: $0 start"
        echo "  2. Open $SONAR_URL and log in (admin/admin)"
        echo "  3. Generate a token at: My Account > Security > Generate Tokens"
        echo "  4. Save token: echo 'your-token' > .sonarqube-token"
        echo "  5. Run: $0 auto"
        exit 1
    fi

    log_info "Token found"

    # Step 2: Start SonarQube if not running
    if ! curl -s "$SONAR_URL/api/system/status" 2>/dev/null | grep -q '"status":"UP"'; then
        log_info "Starting SonarQube..."
        docker compose -f "$COMPOSE_FILE" up -d
        wait_for_sonarqube
    else
        log_info "SonarQube already running"
    fi

    # Step 3: Generate coverage
    log_info "Generating test coverage..."
    npm run test -- --coverage --passWithNoTests 2>/dev/null || true

    # Step 4: Run scan
    log_info "Running SonarQube scan via Docker..."

    local docker_sonar_url="http://host.docker.internal:9000"
    if [[ "$(uname)" == "Linux" ]]; then
        docker_sonar_url="$SONAR_URL"
    fi

    docker run --rm \
        --add-host=host.docker.internal:host-gateway \
        -e SONAR_HOST_URL="$docker_sonar_url" \
        -e SONAR_TOKEN="$token" \
        -v "$PROJECT_DIR:/usr/src" \
        sonarsource/sonar-scanner-cli \
        -Dsonar.projectBaseDir=/usr/src

    # Step 5: Wait for analysis to complete and get results
    log_info "Waiting for analysis to complete..."
    sleep 5

    # Step 6: Open browser to results
    local project_key
    project_key=$(detect_project_key)
    local dashboard_url="$SONAR_URL/dashboard?id=$project_key"
    echo ""
    log_info "Scan complete!"
    echo ""
    echo "  Dashboard: $dashboard_url"
    echo ""

    open_browser "$dashboard_url"
}

case "${1:-help}" in
    auto)
        auto_run
        ;;
    start)
        start_sonarqube
        ;;
    stop)
        stop_sonarqube
        ;;
    status)
        status_sonarqube
        ;;
    scan)
        run_scan
        ;;
    token)
        generate_token
        ;;
    *)
        echo "SonarQube Local Setup"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  auto    - One-command analysis (recommended)"
        echo "  start   - Start SonarQube server (Docker)"
        echo "  stop    - Stop SonarQube server"
        echo "  status  - Check if SonarQube is running"
        echo "  scan    - Run code analysis"
        echo "  token   - Instructions to generate auth token"
        echo ""
        echo "Quick start:"
        echo "  npx quality-gate-sgd sonar auto"
        echo ""
        echo "Environment variables:"
        echo "  SONAR_TOKEN - Auth token for scanning (or use .sonarqube-token file)"
        ;;
esac
