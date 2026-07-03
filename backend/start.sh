#!/bin/bash
# GlbTOKEN Backend — Production Start Script
set -e

cd "$(dirname "$0")"

echo "📦 Installing dependencies..."
pip3 install -r requirements.txt -q

echo "🚀 Starting GlbTOKEN API server..."
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${UVICORN_WORKERS:-4}
