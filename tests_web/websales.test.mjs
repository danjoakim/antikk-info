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
