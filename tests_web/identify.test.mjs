import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIdentifyRequest, describeObserved, mockIdentity, parseIdentify } from "../docs/js/identify.js";
import { describeItem } from "../docs/js/websales.js";

const reply = (json, chunks) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] },
  groundingMetadata: { groundingChunks: chunks.map((t) => ({ web: { uri: "https://vertexaisearch.cloud.google.com/x", title: t } })) } }] });

test("Ett forslag med kilde: avgjort, uten «sjekk»", () => {
  const r = parseIdentify(reply({ decided: true, candidates: [
    { name: "Sony DualSense (PS5)", what: "spillkontroller", maker: "Sony", why: "PS-logo og form", check: "x", url: "https://www.playstation.com/dualsense" }] },
    ["playstation.com"]));
  assert.equal(r.decided, true);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].check, null);
  assert.equal(r.candidates[0].site, "playstation.com");
});

test("Flere forslag: bare de med kilde Google fant, høyst tre, med «sjekk»", () => {
  const r = parseIdentify(reply({ decided: false, candidates: [
    { name: "A", check: "Se under bunnen", url: "https://www.finn.no/1" },
    { name: "B", check: "Se på lokket", url: "https://auctionet.com/2" },
    { name: "C (oppdiktet)", url: "https://ukjent-side.example/3" },
    { name: "a", url: "https://www.finn.no/4" },
  ] }, ["finn.no", "auctionet.com"]));
  assert.equal(r.decided, false);
  assert.deepEqual(r.candidates.map((c) => c.name), ["A", "B"]);
  assert.equal(r.candidates[1].check, "Se på lokket");
  assert.equal(r.stats.unverified, 1);
});

test("Står bare ett forslag igjen etter kontrollen, er det avgjort", () => {
  const r = parseIdentify(reply({ decided: false, candidates: [
    { name: "A", check: "x", url: "https://www.finn.no/1" }, { name: "B", url: "https://ukjent.example/2" }] }, ["finn.no"]));
  assert.equal(r.decided, true);
  assert.equal(r.candidates.length, 1);
});

test("Uten kilder blir det ingen forslag", () => {
  const r = parseIdentify(reply({ decided: true, candidates: [{ name: "X", url: "https://x.example/1" }] }, []));
  assert.equal(r.candidates.length, 0);
  assert.equal(r.decided, false);
});

test("Instruksen forbyr alternativer bildet utelukker, og beskrivelsen tar med det som ble lest", () => {
  const sys = buildIdentifyRequest("x").systemInstruction.parts[0].text;
  assert.match(sys, /do not offer a PS4 controller/);
  assert.match(sys, /Never invent/);
  const d = describeObserved({ marks: [{ text: "PORSGRUND", type: "factory_mark" }], style_cues: ["trykt dekor"] },
    { category: "porcelain_ceramics", object_type: "kaffekanne", brand_display: "Porsgrund", description: "Hvit kanne", other_numbers: ["182"] });
  assert.match(d, /PORSGRUND/);
  assert.match(d, /182/);
  assert.match(d, /trykt dekor/);
});

test("Prissøket får det valgte navnet, og demoeksemplene er merket", () => {
  assert.match(describeItem({ identified: "Porsgrund, dekor X" }, { itemType: "porcelain_ceramics" }), /identified as «Porsgrund, dekor X»/);
  assert.equal(mockIdentity("porcelain_demo").candidates.every((c) => c.demo), true);
  assert.equal(mockIdentity("ukjent").candidates.length, 0);
});
