#!/usr/bin/env bash
# Usage: ./seed-admin.sh admin admin123
USER=${1:-admin}
PASS=${2:-admin123}
export SEED_ADMIN_USER="$USER"
export SEED_ADMIN_PASS="$PASS"
node seed-admin.js
