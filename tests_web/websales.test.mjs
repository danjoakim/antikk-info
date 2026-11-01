// Nettsøk etter solgte: bare treff fra domener Google returnerte, omregning og intervall.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildWebSalesRequest, describeItem, groundedDomains, parseWebSales } from "../docs/js/websales.js";

const fx = JSON.parse(readFileSync(new URL("../docs/data/fx_nok.json", import.meta.url), "utf8"));

const reply = (obj, chunks) => ({ candidates: [{
  content: { parts: [{ text: "tenker", thought: true }, { text: "```json\n" + JSON.stringify(obj) + "\n```" }] },
  groundingMetadata: { webSearchQueries: ["vacheron constantin 18k hunter sold"],
    searchEntryPoint: { renderedContent: "<div>forslag</div>" },
    groundingChunks: chunks.map((title) => ({ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title } })) },
}] });

test("beskrivelse bygges bare av bekreftede fakta", () => {
  const d = describeItem({ material: "gold_18k", winding: "stem", movement_serial: 377144, case_stamps: ["0,750", "V&C"] },
    { brandName: "Vacheron Constantin", period: "1860–1940" });
  assert.equal(d, "Vacheron Constantin pocket watch (18k gold, keyless (stem wind), approx. 1860–1940, movement no. 377144, marks: 0,750; V&C)");
  assert.ok(describeItem({}).startsWith("unsigned pocket watch"));
});

test("forespørselen bruker Google-søk og lavt tenkenivå", () => {
  const body = buildWebSalesRequest("x", { thinkingLevel: "low" });
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: "low" });
});

test("domener fra kildene, også når lenken er en omdirigering", () => {
  const d = groundedDomains({ groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/x", title: "antiquorum.swiss" } },
                                               { web: { uri: "https://www.bonhams.com/lot/1", title: "Bonhams" } }] });
  assert.deepEqual([...d].sort(), ["antiquorum.swiss", "bonhams.com"]);
});

test("salg uten bekreftet kilde forkastes, resten regnes om og gir intervall", () => {
  const r = parseWebSales(reply({
    sales: [
      { title: "VC 18k hunter", price: 3500, currency: "CHF", price_basis: "incl_premium", date: "2022-05-08", seller: "Antiquorum", url: "https://catalog.antiquorum.swiss/en/lots/x", similarity: "same_maker" },
      { title: "VC open face", price: 6250, currency: "CHF", price_basis: "incl_premium", date: "2024-11-10", seller: "Antiquorum", url: "https://catalog.antiquorum.swiss/en/lots/y", similarity: "same_maker" },
      { title: "VC poor", price: 1000, currency: "GBP", price_basis: "hammer", date: "2025-07-15", seller: "Gorringes", url: "https://auction.gorringes.co.uk/lot/z", similarity: "same_model" },
      { title: "Oppdiktet", price: 99999, currency: "USD", url: "https://fake-site.example/lot", similarity: "same_model" },
      { title: "Uten pris", price: 0, currency: "USD", url: "https://catalog.antiquorum.swiss/en/lots/q" },
    ],
    background: [{ text: "Vacheron Constantin ble grunnlagt i 1755.", url: "https://en.wikipedia.org/wiki/Vacheron_Constantin" },
                 { text: "Uten kilde.", url: "https://blogg.example/x" }],
  }, ["antiquorum.swiss", "gorringes.co.uk", "en.wikipedia.org"]), fx);
  assert.equal(r.sales.length, 3);
  assert.equal(r.dropped, 3);
  assert.equal(r.sales[0].similarity, "same_model");             // samme modell først
  assert.equal(r.sales[0].nok, 13000);                            // 1000 GBP × 12,8268, avrundet til 500
  assert.deepEqual(r.range, { min: 13000, median: 42000, max: 75000, n: 3 });
  assert.equal(r.background.length, 1);
  assert.equal(r.entryPoint, "<div>forslag</div>");
});

test("uten kildemetadata vises ingenting", () => {
  const data = { candidates: [{ content: { parts: [{ text: JSON.stringify({ sales: [{ title: "x", price: 5, currency: "EUR", url: "https://a.com/x" }], background: [] }) }] } }] };
  const r = parseWebSales(data, fx);
  assert.equal(r.sales.length, 0);
  assert.equal(r.dropped, 1);
  assert.equal(r.range, null);
});

test("priser i mange formater", async () => {
  const { parsePrice } = await import("../docs/js/websales.js");
  assert.equal(parsePrice("kr 1 200"), 1200);
  assert.equal(parsePrice("1.200,-"), 1200);
  assert.equal(parsePrice("1,200.50"), 1200.5);
  assert.equal(parsePrice("450"), 450);
  assert.equal(parsePrice("99,90"), 99.9);
  assert.ok(Number.isNaN(parsePrice("gratis")));
});

test("utsalgspriser og solgte holdes adskilt; kilde godtas via navn i tittelen", () => {
  const data = { candidates: [{ content: { parts: [{ text: JSON.stringify({ sales: [
    { title: "PS5 DualSense", kind: "listed", price: "kr 450", currency: "NOK", url: "https://www.finn.no/recommerce/forsale/item/1", similarity: "same_model" },
    { title: "PS5 DualSense hvit", kind: "listed", price: "500", currency: "NOK", url: "https://www.finn.no/recommerce/forsale/item/2", similarity: "same_model" },
    { title: "DualSense", kind: "listed", price: "39,99", currency: "EUR", url: "https://www.ebay.de/itm/3", similarity: "same_model" },
    { title: "DualSense sold", kind: "sold", price: 35, currency: "USD", url: "https://www.ebay.com/itm/4", similarity: "same_model" },
  ], background: [] }) }] },
  groundingMetadata: { groundingChunks: [
    { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/a", title: "FINN.no – PS5-kontroller til salgs" } },
    { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/b", title: "ebay.com" } }] } }] };
  const r = parseWebSales(data, fx);
  assert.equal(r.sales.length, 4);
  assert.equal(r.stats.sources, 2);
  assert.deepEqual(r.listedRange, { min: 440, median: 450, max: 500, n: 3 });
  assert.equal(r.range, null);
});

test("describeItem: bøker beskrives med tittel, forfatter, trykte opplysninger og ISBN", () => {
  const d = describeItem({ object_type: "bok", title: "Sult", creator: "Knut Hamsun", materials: [],
    printed: ["Gyldendal Norsk Forlag", "Oslo 1957"], other_numbers: ["ISBN 82-05-12345-6"] },
    { brandName: "Gyldendal", itemType: "book_paper" });
  assert.match(d, /titled «Sult» by Knut Hamsun/);
  assert.match(d, /Oslo 1957/);
  assert.match(d, /ISBN 82-05-12345-6/);
  assert.doesNotMatch(d, /unsigned/);
});

test("Nettsøket kjenner bok- og platesider og ber om tittel og forfatter først", () => {
  const text = buildWebSalesRequest("x").systemInstruction.parts[0].text;
  for (const site of ["antikvariat.net", "bokborsen.no", "abebooks.com", "discogs.com"]) assert.ok(text.includes(site), site);
  assert.match(text, /match title and author\/artist first/);
});
