#!/usr/bin/env sh
# scripts/fetch-starter.sh: the generic-foods file the app ships with. Run before any build; CI runs it too.
set -e
url=$(curl -sf https://food.codejet.net/manifest.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).files.find(f=>f.country==="starter").url))')
curl -sfL "$url" -o /tmp/foods-starter.zip
mkdir -p assets && unzip -oq /tmp/foods-starter.zip -d assets && ls -la assets/foods-starter.db
