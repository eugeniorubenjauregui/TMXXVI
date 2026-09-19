#!/usr/bin/env bash
# Sirve el sitio en local. No requiere instalar nada (usa python3).
cd "$(dirname "$0")"
PORT="${PORT:-5173}"
echo "Tita Media — local: http://localhost:${PORT}/index.html"
exec python3 -m http.server "$PORT"
