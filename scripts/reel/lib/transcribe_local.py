"""Local word-level transcription for the Fan Economy reel editor.

faster-whisper with word_timestamps=True, writing EVERY word with its own start/end.
(C:\\Users\\Josh\\Tools\\build_region_transcript_fast.py requests word timing too but then
collapses it into one "word" per region, which is fine for silence chopping and useless
for captions or retake detection. This script keeps the words.)

condition_on_previous_text=False and no VAD filter on purpose: both make Whisper smooth
over repeated phrases, and a repeated phrase is exactly what a retake looks like.

Usage (Windows Python, which has faster-whisper and the cached models):
  python -X utf8 -u transcribe_local.py <audio.wav> <out.json> [--model small.en] [--hotwords "Money Man, EMPIRE"]
"""
import argparse
import json
import sys
import time


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--hotwords", default=None)
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args()

    from faster_whisper import WhisperModel

    t0 = time.time()
    model = WhisperModel(a.model, device="cpu", compute_type="int8", cpu_threads=a.threads)
    kwargs = dict(
        word_timestamps=True,
        language="en",
        beam_size=5,
        condition_on_previous_text=False,
        vad_filter=False,
    )
    if a.hotwords:
        kwargs["hotwords"] = a.hotwords
    segments, info = model.transcribe(a.audio, **kwargs)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({
                "text": w.word.strip(),
                "start": round(float(w.start), 3),
                "end": round(float(w.end), 3),
                "prob": round(float(w.probability), 3),
            })
    out = {
        "provider": "local",
        "model": a.model,
        "language": info.language,
        "duration": round(float(info.duration), 3),
        "elapsedSec": round(time.time() - t0, 1),
        "words": words,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f)
    print(f"words={len(words)} duration={out['duration']} elapsed={out['elapsedSec']}s", flush=True)


if __name__ == "__main__":
    sys.exit(main())
