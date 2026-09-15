#!/usr/bin/env sh
set -e
T=$(mktemp)
trap 'rm -f "$T"' EXIT
curl -sSf https://raw.githubusercontent.com/codejetnet/food-data/main/nutrients.json -o "$T"
diff -q "$T" src/nutrients.json || { echo "src/nutrients.json drifted from food-data; copy it over"; exit 1; }
