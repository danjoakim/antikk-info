// Bildeanalysen i nettversjonen, uten nettverk.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { analyzeWithGemini, buildRequest, mockFacts, parseGemini, toFacts, toOpenApiSchema, VisionError } from "../docs/js/vision.js";

const contract = JSON.parse(readFileSync(new URL("../docs/data/vision_contract.json", import.meta.url), "utf8"));
const RAW = {
  dial_text: "OMEGA", brand_signed: "Omega", movement_serial: "1234567", case_number: null, escapement: "lever",
  escapement_evidence: null, case_stamps: ["0,800"], jewels: 15,
  confidence: { dial_text: 0.9, brand_signed: 0.95, movement_serial: 0.8, case_number: null, escapement: 0.7, case_stamps: 0.9 },
  unreadable: ["case_number"], retake_hints: [],
};
const geminiReply = (text, extra = {}) => ({ candidates: [{ content: { parts: [{ text }] }, ...extra }] });

test("kontrakten har ingen felt for år eller pris", () => {
  const fields = Object.keys(contract.schema.properties);
  assert.ok(!fields.some((f) => /year|date|price|value|age/.test(f)));
  assert.deepEqual(Object.keys(contract.mock_scenarios).sort(), ["cylinder_metal", "omega_silver", "unreadable"]);
});

test("toFacts validerer og rydder", () => {
  const f = toFacts(RAW);
  assert.equal(f.movement_serial, "1234567");
  assert.ok(!("case_number" in f.confidence));
  assert.throws(() => toFacts({ ...RAW, escapement: "quartz" }), VisionError);
  assert.throws(() => toFacts("tekst"), VisionError);
});

test("svar fra Gemini tolkes, også i kodeblokk", () => {
  assert.equal(parseGemini(geminiReply(JSON.stringify(RAW))).brand_signed, "Omega");
  assert.equal(parseGemini(geminiReply("```json\n" + JSON.stringify(RAW) + "\n```")).escapement, "lever");
  assert.throws(() => parseGemini({ promptFeedback: { blockReason: "SAFETY" } }), /avviste/);
  assert.throws(() => parseGemini(geminiReply("ikke json")), /gyldig JSON/);
  assert.throws(() => parseGemini({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }), /kuttet/);
});

test("forespørselen merker bildene og låser skjemaet", async () => {
  const images = [{ role: "dial", blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }) }];
  const req = await buildRequest(images, contract);
  const parts = req.contents[0].parts;
  assert.equal(parts[0].text, "Bilde 1: Urskiven (forsiden)");
  assert.deepEqual(parts[1].inline_data, { mime_type: "image/jpeg", data: "AQID" });
  assert.equal(req.generationConfig.responseMimeType, "application/json");
  assert.equal(req.generationConfig.responseJsonSchema, contract.schema);
  const legacy = await buildRequest(images, contract, { legacySchema: true });
  assert.equal(legacy.generationConfig.responseSchema.properties.dial_text.nullable, true);
  assert.equal(legacy.generationConfig.responseSchema.properties.dial_text.type, "string");
  assert.ok(!("additionalProperties" in legacy.generationConfig.responseSchema));
});

test("OpenAPI-konvertering bevarer enum og lister", () => {
  const out = toOpenApiSchema(contract.schema);
  assert.deepEqual(out.properties.escapement.enum, ["cylinder", "lever", "verge", "unknown"]);
  assert.equal(out.properties.case_stamps.items.type, "string");
});

test("Gemini-kall: reserveskjema ved 400 og tydelige feil", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body.generationConfig);
    assert.equal(opts.headers["x-goog-api-key"], "k");
    if (body.generationConfig.responseJsonSchema) {
      return new Response(JSON.stringify({ error: { message: "Unknown name \"responseJsonSchema\"" } }), { status: 400 });
    }
    return new Response(JSON.stringify(geminiReply(JSON.stringify(RAW))), { status: 200 });
  });
  const images = [{ role: "dial", blob: new Blob(["x"], { type: "image/jpeg" }) }];
  const facts = await analyzeWithGemini(images, contract, { key: "k", model: "m" });
  assert.equal(facts.brand_signed, "Omega");
  assert.equal(calls.length, 2);
  assert.ok(calls[1].responseSchema);
});

test("Gemini-kall: feilmeldinger på norsk", async (t) => {
  const images = [{ role: "dial", blob: new Blob(["x"], { type: "image/jpeg" }) }];
  for (const [status, message, expected] of [
    [400, "API key not valid", /ugyldig/], [403, "denied", /avviste nøkkelen/], [404, "not found", /finnes ikke/],
    [429, "quota", /Kvoten/], [503, "down", /problemer/],
  ]) {
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message } }), { status }));
    await assert.rejects(analyzeWithGemini(images, contract, { key: "k", model: "m" }), expected);
    t.mock.restoreAll();
  }
  await assert.rejects(analyzeWithGemini(images, contract, {}), /Gemini-nøkkel/);
});

test("demoeksempler kopieres", () => {
  const a = mockFacts(contract, "omega_silver");
  a.case_stamps.push("endret");
  assert.ok(!mockFacts(contract, "omega_silver").case_stamps.includes("endret"));
  assert.equal(mockFacts(contract, "finnes-ikke").brand_signed, "Omega");
});
