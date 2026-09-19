#!/usr/bin/env bash
# Genera/actualiza todo el blog Noticias desde WordPress. Ver CLAUDE.md.
cd "$(dirname "$0")/.."
exec node scripts/generate-blog.mjs
