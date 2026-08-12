#!/bin/bash
set -e

# Start cloudflared tunnel in background if TUNNEL_TOKEN is set
if [ -n "$TUNNEL_TOKEN" ]; then
  echo "Starting cloudflared tunnel..."
  cloudflared tunnel --no-autoupdate run --token "$TUNNEL_TOKEN" &
  echo "cloudflared started (PID $!)"
else
  echo "No TUNNEL_TOKEN set, skipping cloudflared"
fi

# Start the main app
exec python main.py
