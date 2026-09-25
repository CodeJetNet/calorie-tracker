#!/usr/bin/env sh
# scripts/fetch-starter.sh: the generic-foods file the app ships with. Run before any build; CI runs it too.
set -e
url=$(curl -sfL https://github.com/codejetnet/food-data/releases/latest/download/manifest.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).files.find(f=>f.country==="starter").url))')
curl -sfL "$url" -o /tmp/foods-starter.zip
mkdir -p assets && unzip -oq /tmp/foods-starter.zip -d assets && ls -la assets/foods-starter.db
