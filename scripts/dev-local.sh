#!/bin/bash
# Development script for testing on local network (glasses, remote simulators)
# This runs frontend, worker, and QR scanner with proper IP configuration
# Run from the repo root: bash scripts/dev-local.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

DEV_IP=${VITE_DEV_IP:-192.168.86.100}

# Kill any existing processes on our ports
for port in 5173 8787; do
  pids=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Killing existing processes on port $port..."
    echo "$pids" | xargs kill -9 2>/dev/null
  fi
done
sleep 1

echo "Starting Wondereye dev servers on $DEV_IP"
echo ""
echo "Frontend: http://$DEV_IP:5173"
echo "Worker:   http://$DEV_IP:8787"
echo ""

# Cleanup function (set up before starting processes)
cleanup() {
  echo ""
  echo "Shutting down servers..."
  kill $FRONTEND_PID $WORKER_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Start frontend in background
echo "Starting frontend..."
(cd "$ROOT_DIR/packages/frontend" && npm run dev) &
FRONTEND_PID=$!

# Start worker in background
echo "Starting worker..."
(cd "$ROOT_DIR/packages/worker" && wrangler dev --ip $DEV_IP --port 8787) &
WORKER_PID=$!

# Wait for servers to be ready
sleep 3

# Show QR code using DEV_IP
echo "Generating QR code..."
npx evenhub qr --http --ip $DEV_IP --port 5173

echo ""
echo "Servers running. Press Ctrl+C to stop."
echo ""

# Wait until user presses Ctrl+C or servers exit
wait $FRONTEND_PID $WORKER_PID
