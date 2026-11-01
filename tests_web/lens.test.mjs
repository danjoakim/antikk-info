import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLensRequest, lensDomains, lensError, lensLeads, parseWebDetection } from "../docs/js/lens.js";
import { buildWebSalesRequest, parseWebSales } from "../docs/js/websales.js";

const VISION = { responses: [{ webDetection: {
  bestGuessLabels: [{ label: "den illustrerte kama sutra", languageCode: "no" }],
  webEntities: [{ description: "Kama Sutra", score: 0.9 }, { description: "Book", score: 0.5 }, { description: "støy", score: 0.1 }],
  pagesWithMatchingImages: [
    { url: "https://www.finn.no/recommerce/forsale/item/1", pageTitle: "DEN ILLUSTRERTE <b>KAMA SUTRA</b> | FINN", fullMatchingImages: [{ url: "x" }] },
    { url: "https://www.finn.no/recommerce/forsale/item/1", pageTitle: "duplikat" },
    { url: "https://boklibris.no/b/2", pageTitle: "Kama Sutra – Ananga-Ranga" },
  ],
  visuallySimilarImages: [{ url: "https://img.example/a.jpg" }, { url: "https://img.example/a.jpg" }, { url: "data:x" }, { url: "https://img.example/b.jpg" }],
} }] };

test("parseWebDetection: beste gjetning, entiteter over terskel, sider uten duplikater og HTML", () => {
  const r = parseWebDetection(VISION);
  assert.equal(r.ok, true);
  assert.deepEqual(r.guess, ["den illustrerte kama sutra"]);
  assert.deepEqual(r.entities.map((e) => e.name), ["Kama Sutra", "Book"]);
  assert.equal(r.pages.length, 2);
  assert.equal(r.pages[0].title, "DEN ILLUSTRERTE KAMA SUTRA | FINN");
  assert.equal(r.pages[0].site, "finn.no");
  assert.deepEqual(lensDomains(r), ["finn.no", "boklibris.no"]);
  assert.deepEqual(r.similar, ["https://img.example/a.jpg", "https://img.example/b.jpg"], "lignende bilder uten duplikater, bare http(s)");
});

test("lensError: forklarer avslått API, blokkert nøkkel og fakturering", () => {
  assert.equal(lensError(403, { error: { status: "PERMISSION_DENIED", message: "Cloud Vision API has not been used in project 1 before or it is disabled.",
    details: [{ reason: "SERVICE_DISABLED" }] } }).reason, "disabled");
  assert.equal(lensError(403, { error: { message: "Requests to this API vision.googleapis.com method are blocked.",
    details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] } }).reason, "blocked");
  assert.equal(lensError(403, { error: { details: [{ reason: "BILLING_DISABLED" }] } }).reason, "billing");
  assert.equal(parseWebDetection({ responses: [{ error: { message: "Bad image" } }] }).ok, false);
});

test("Bildesøkets spor havner i nettsøket, og sidene det fant godtas som kilder", () => {
  const r = parseWebDetection(VISION);
  const leads = lensLeads(r);
  assert.match(leads, /best guess: den illustrerte kama sutra/);
  assert.match(leads, /finn\.no\/recommerce\/forsale\/item\/1/);
  assert.match(buildWebSalesRequest("book", { leads }).contents[0].parts[0].text, /Leads from an image search/);
  assert.equal(buildLensRequest("AAA").requests[0].features[0].type, "WEB_DETECTION");
  const reply = { candidates: [{ content: { parts: [{ text: JSON.stringify({ sales: [
    { title: "Kama Sutra", kind: "listed", price: 199, currency: "NOK", url: "https://www.finn.no/recommerce/forsale/item/1", similarity: "same_model" }],
    background: [] }) }] }, groundingMetadata: { groundingChunks: [] } }] };
  assert.equal(parseWebSales(reply, { rates: { NOK: 1 } }).sales.length, 0, "uten kilde fra Google forkastes salget");
  assert.equal(parseWebSales(reply, { rates: { NOK: 1 } }, { extraDomains: lensDomains(r) }).sales.length, 1, "siden bildesøket fant, teller som kilde");
});
