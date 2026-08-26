// The one real provider adapter. Everything upstream depends only on this shape
// ({ callModel, generateImage }), so tests inject fakes and a future provider swap
// touches this file alone (§23 provider abstraction).

import { GoogleGenAI } from "@google/genai";
import { IMAGE } from "../config.mjs";

export function createGeminiClient(apiKey = process.env.GEMINI_API_KEY) {
  if (!apiKey) throw new Error("GEMINI_API_KEY not set. Run: source ./load-env.sh");
  const ai = new GoogleGenAI({ apiKey });

  return {
    /** Text (optionally vision) call. Returns { text, inputTokens, outputTokens }. */
    async callModel({ model, prompt, image = null, json = false }) {
      const parts = [];
      if (image) parts.push({ inlineData: image });
      parts.push({ text: prompt });
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: json ? { responseMimeType: "application/json" } : {},
      });
      let text = "";
      for (const cand of response.candidates || []) {
        for (const p of cand.content?.parts || []) {
          if (p.text) text += p.text;
        }
      }
      const usage = response.usageMetadata || {};
      return {
        text,
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0),
      };
    },

    /** Image generation with aspect/size fallback chain. Returns
     * { imageBuffer, inputTokens, imageSize, aspectRatio }. */
    async generateImage({ model, parts, aspectRatio, imageSize }) {
      const combos = [{ aspectRatio, imageSize }, ...IMAGE.fallbacks];
      let lastErr = null;
      for (const combo of combos) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts }],
            config: {
              responseModalities: ["IMAGE"],
              imageConfig: { aspectRatio: combo.aspectRatio, imageSize: combo.imageSize },
            },
          });
          let imageData = null;
          for (const cand of response.candidates || []) {
            for (const p of cand.content?.parts || []) {
              if (p.inlineData?.data) {
                imageData = p.inlineData.data;
                break;
              }
            }
            if (imageData) break;
          }
          if (!imageData) throw new Error("no image in response");
          const usage = response.usageMetadata || {};
          return {
            imageBuffer: Buffer.from(imageData, "base64"),
            inputTokens: usage.promptTokenCount || 0,
            imageSize: combo.imageSize,
            aspectRatio: combo.aspectRatio,
          };
        } catch (err) {
          lastErr = err;
          // Only fall through the combo chain on config rejections; a quota or
          // safety error would fail every combo and should surface immediately.
          const msg = String(err.message || err);
          if (!/aspect|image_?size|invalid|unsupported/i.test(msg)) throw err;
        }
      }
      throw lastErr || new Error("image generation failed");
    },
  };
}
