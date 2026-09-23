#!/usr/bin/env bash
# End-to-end check of step 6 through the real server, without touching the real SSD folders.
# A scratch COPY of studio/ runs on port 4718 with its SSD root pointed at a scratch folder on C:
# (a real mount, so the write guard is exercised for real). Only the folder constants differ.
#   bash studio/test/e2e-step6.sh          (from WSL; transcription takes a few minutes)
set -euo pipefail
REPO=/home/merce/workspace-crwn
E=/mnt/c/Users/Josh/AppData/Local/Temp/crwn-studio-e2e
HHI_REL="Users/Josh/AppData/Local/Temp/crwn-studio-e2e/ssd/HHI"
SRC="/mnt/e/Videos/2026/CRWN/Reels TikTok Shorts/Hip Hop Industry/Unmixed/New Recording 819 joyce wrice.wav"
B=http://127.0.0.1:4718
NUM=6   # 6-joyce-wrice-fans-pick-the-feature; recording 819 is Joyce Wrice

rm -rf "$E"; mkdir -p "$E/ssd/HHI/Fan Economy" "$E/app"
cp -r "$REPO/studio/." "$E/app/"; rm -f "$E/app/state.json"
sed -i "s#^export const HHI = .*#export const HHI = \"$HHI_REL\";#; s#^export const REPO = .*#export const REPO = \"$REPO\";#" "$E/app/lib/config.mjs"
grep -q "crwn-studio-e2e" "$E/app/lib/config.mjs" || { echo "config patch did not apply"; exit 1; }
echo '{ "port": 4718, "ssdLetter": "C" }' > "$E/app/config.json"
cp "$SRC" "$E/ssd/HHI/Fan Economy/New Recording 999.wav"

node "$E/app/server.mjs" > "$E/server.log" 2>&1 &
PID=$!; trap 'kill $PID 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null $B/ && break; sleep 0.5; done

j() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const v=JSON.parse(d);console.log(eval(process.argv[1]))})' "$1"; }
post() { curl -s -X POST -H "Origin: $B" -H "content-type: application/json" -d "${2:-{\}}" "$B/api/videos/$NUM/$1"; }
s6='v.error ? "REFUSED: "+v.error : v.steps[5].status+" / "+v.steps[5].stage+" / "+v.steps[5].summary'
wait_job() { while curl -s $B/api/activity | j 'v.job && v.job.status' | grep -q running; do sleep 5; done; curl -s $B/api/activity | j '"  job: "+v.job.status+" after "+v.job.elapsedSec+"s: "+v.job.result.summary+"\n  "+v.job.result.checks.map(c=>(c.ok?"ok   ":"FAIL ")+c.label).join("\n  ")'; }

echo "1. unassigned:";   curl -s $B/api/videos | j 'JSON.stringify(v.unassigned)'
echo "2. link:";         post link "{\"rel\":\"$HHI_REL/Fan Economy/New Recording 999.wav\"}" | j "$s6"
echo "3. split early:";  post split | j "$s6"
echo "4. rename:";       post rename | j '"  "+v.recording.wav'
echo "5. transcribe:";   post transcribe | j "$s6"; wait_job
curl -s $B/api/videos/$NUM | j "$s6"
echo "6. split:";        post split | j "$s6"; wait_job
curl -s $B/api/videos/$NUM | j "$s6"
echo "7. place (panel simulated):"
post place | j "$s6"
echo "  web page can't take the job: $(curl -s -o /dev/null -w %{http_code} $B/api/bridge/next)"
curl -s -H "x-crwn-bridge: 1" $B/api/bridge/next | j '"  panel got: "+v.jsx'
ID=$(curl -s $B/api/activity | j 'v.bridge.pending.id')
curl -s -X POST -H "x-crwn-bridge: 1" -H "content-type: application/json" \
  -d "{\"id\":$ID,\"message\":\"overlap_phrases.jsx complete.\\nPlaced: 46 of 46 on A3/A4\\nFailed: 0\\n\"}" $B/api/bridge/result | j '"  saved: "+v.saved'
curl -s $B/api/videos/$NUM | j "$s6"
echo "8. re-split moves the old JSX aside:"
curl -s -X POST -H "Origin: $B" -H "content-type: application/json" -d '{}' $B/api/videos/$NUM/split > /dev/null; wait_job
ls "$E/ssd/HHI/Fan Economy/_replaced/"
curl -s $B/api/videos/$NUM | j "$s6"
echo "9. a wav outside the known folders can't be linked:"
NUM=1; post link "{\"rel\":\"Videos/x.wav\"}" | j "$s6"
echo "Fan Economy now holds:"; ls "$E/ssd/HHI/Fan Economy/"
