import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeSlug, newJob, setState, pendingScenes, acceptedSceneImages, elementBoxesByScene } from "./lib/job.mjs";
import { fixtureStoryboard } from "./lib/fixtures.mjs";
import { generateSceneImage } from "./lib/imageGen.mjs";
import { forbiddenForScene, buildScenePrompt } from "./lib/imageGen.mjs";
import { newLedger } from "./lib/ledger.mjs";
import { generateStoryboard, normalizeStoryboard } from "./lib/storyboardGen.mjs";
import { fixtureSourceNumbers } from "./lib/fixtures.mjs";

describe("safeSlug", () => {
  it("accepts script-shaped slugs and refuses traversal/absolute paths", () => {
    expect(safeSlug("34-ryan-leslie-forty-thousand-numbers.md")).toBe("34-ryan-leslie-forty-thousand-numbers");
    expect(() => safeSlug("../etc/passwd")).toThrow(/unsafe/);
    expect(() => safeSlug("/absolute")).toThrow(/unsafe/);
    expect(() => safeSlug("a b")).toThrow(/unsafe/);
  });
});

describe("job state", () => {
  it("tracks states and rejects unknown ones", () => {
    const job = newJob("1-test-script", "/x/1-test-script.md");
    setState(job, "STORYBOARDED");
    expect(job.state).toBe("STORYBOARDED");
    expect(() => setState(job, "WAT")).toThrow(/unknown job state/);
  });

  it("pendingScenes resumes only what is missing", () => {
    const sb = fixtureStoryboard();
    const job = newJob("1-test-script", "/x.md");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crwn-video-"));
    const img = path.join(tmp, "scene-01.jpg");
    fs.writeFileSync(img, "x");
    job.scenes.push({ index: 0, status: "accepted", imageFile: img, boxes: { A: { x: 0, y: 0, w: 1, h: 1 } } });
    job.scenes.push({ index: 1, status: "failed", imageFile: null });
    const pending = pendingScenes(job, sb);
    expect(pending.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(acceptedSceneImages(job)).toEqual([{ index: 0, imageFile: img }]);
    expect(elementBoxesByScene(job)[0].A.w).toBe(1);
  });

  it("an accepted scene whose file was deleted becomes pending again", () => {
    const sb = fixtureStoryboard();
    const job = newJob("1-test-script", "/x.md");
    job.scenes.push({ index: 0, status: "accepted", imageFile: "/nonexistent/scene.jpg" });
    expect(pendingScenes(job, sb).map((s) => s.index)).toContain(0);
  });
});

describe("retry cap", () => {
  it("stops paid generation at the job-wide attempt cap without calling the provider", async () => {
    const sb = fixtureStoryboard();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crwn-video-"));
    let calls = 0;
    const client = {
      generateImage: async () => {
        calls++;
        throw new Error("should not be called");
      },
      callModel: async () => ({ text: "{}", inputTokens: 0, outputTokens: 0 }),
    };
    const result = await generateSceneImage({
      storyboard: sb,
      scene: sb.scenes[3], // TENSION scene: no person refs, so the test touches no files
      jobDir: tmp,
      client,
      ledger: newLedger(),
      opts: { attemptsSoFar: 24 },
    });
    expect(calls).toBe(0);
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("attempt cap");
  });
});

describe("withheld protection at generation time", () => {
  it("pre-reveal scenes carry the reveal strings as forbidden; reveal scenes do not", () => {
    const sb = fixtureStoryboard();
    expect(forbiddenForScene(sb, sb.scenes[1])).toContain("OVER $2,000,000");
    expect(forbiddenForScene(sb, sb.scenes[5])).toEqual([]);
    expect(forbiddenForScene(sb, sb.scenes[7])).toEqual([]);
  });

  it("scene prompts end with the standardized 9:16 sharpie tail", () => {
    const sb = fixtureStoryboard();
    const p = buildScenePrompt(sb.scenes[0], []);
    expect(p).toContain(sb.scenes[0].screenText[0]);
    expect(p).toContain("9:16 vertical frame edge to edge");
    expect(p).toContain("Never draw the word CRWN");
  });
});

describe("normalizeStoryboard", () => {
  it("coerces 0-100 and 0-1000 scale regions and array regions to normalized rects", () => {
    const sb = fixtureStoryboard();
    sb.scenes[0].elements[0].region = { x: 5, y: 4, w: 90, h: 18 };
    sb.scenes[0].elements[1].region = [150, 300, 600, 500];
    normalizeStoryboard(sb);
    expect(sb.scenes[0].elements[0].region.w).toBeCloseTo(0.9);
    expect(sb.scenes[0].elements[1].region.x).toBeCloseTo(0.15);
  });

  it("appends screen text the imagePrompt forgot, so the page actually letters it", () => {
    const sb = fixtureStoryboard();
    sb.scenes[3].screenText = ["A LINE THE PROMPT FORGOT"];
    normalizeStoryboard(sb);
    expect(sb.scenes[3].imagePrompt).toContain('"A LINE THE PROMPT FORGOT"');
  });
});

describe("storyboard repair loop (mocked provider)", () => {
  it("feeds validation errors back and succeeds on a repaired attempt", async () => {
    const good = fixtureStoryboard();
    const bad = fixtureStoryboard();
    bad.scenes[1].shots[0].motion = "SPIN";
    let call = 0;
    const prompts = [];
    const client = {
      callModel: async ({ prompt }) => {
        prompts.push(prompt);
        call++;
        return {
          text: JSON.stringify(call === 1 ? bad : good),
          inputTokens: 1000,
          outputTokens: 2000,
        };
      },
    };
    const parsed = {
      title: "t",
      // Must contain every number the fixture puts on screen, or the
      // fabricated-number check correctly fails both attempts.
      scriptText:
        "40,000 numbers. 15,000 bought. Over $2,000,000. About $133 a person versus $150 total. Comment OWN.",
      meta: { "big reveal": "money" },
      nanoPrompt: null,
      ctaKeyword: "OWN",
      family: "I",
    };
    const { storyboard, validation } = await generateStoryboard(parsed, client, {
      slug: "1-test-script",
      personSlugs: [],
      ledger: newLedger(),
    });
    // Bypass source-number validation inside the loop by matching fixture numbers:
    // the loop uses the real parsed source, so the first (bad) attempt must fail on
    // the motion enum and the second must pass every check that applies.
    expect(call).toBe(2);
    expect(prompts[1]).toContain("PREVIOUS ATTEMPT FAILED");
    expect(validation.ok).toBe(true);
    expect(storyboard.scenes.length).toBe(8);
  }, 15000);
});
