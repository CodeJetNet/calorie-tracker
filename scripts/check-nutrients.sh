#!/usr/bin/env sh
set -e
curl -sf https://raw.githubusercontent.com/codejetnet/food-data/main/nutrients.json | diff -q - src/nutrients.json \
  || { echo "src/nutrients.json drifted from food-data; copy it over"; exit 1; }
