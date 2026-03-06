#!/bin/bash
# Simulator mode: runs frontend + worker on localhost and launches the EvenHub simulator
# Run from repo root: bash scripts/dev-sim.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Kill any existing processes on our ports
for port in 5173 8787; do
  pids=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Killing existing processes on port $port..."
    echo "$pids" | xargs kill -9 2>/dev/null
  fi
done
sleep 1

echo "Starting Wondereye in simulator mode (localhost)"
echo ""
echo "Frontend: http://localhost:5173"
echo "Worker:   http://localhost:8787"
echo ""

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $FRONTEND_PID $WORKER_PID $SIM_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

echo "Starting frontend..."
(cd "$ROOT_DIR/packages/frontend" && VITE_DEV_IP=localhost npm run dev) &
FRONTEND_PID=$!

echo "Starting worker..."
(cd "$ROOT_DIR/packages/worker" && wrangler dev --port 8787) &
WORKER_PID=$!

sleep 3

echo "Launching simulator..."
npx evenhub-simulator http://localhost:5173/app.html &
SIM_PID=$!

echo ""
echo "Running. Press Ctrl+C to stop."
echo ""

wait $FRONTEND_PID $WORKER_PID $SIM_PID
