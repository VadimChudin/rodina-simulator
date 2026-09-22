#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 -m pip install -r requirements.txt -q
exec python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
