// Samme forventninger som tests/test_core.py, mot nettversjonens JavaScript og JSON-data.
// Kjør: node --test tests_web/

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { dateItem } from "../docs/js/dating.js";
import { cleanSerial, detectMaterial, normalize, normalizeBrand } from "../docs/js/normalize.js";
import { valueItem } from "../docs/js/valuation.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../docs/data/${name}.json`, import.meta.url), "utf8"));
const ranges = load("serial_ranges");
const hallmarks = load("hallmarks");
const sales = load("auction_results");
const facts = (f) => ({ brand: null, movement_serial: null, case_number: null, escapement: "unknown", material: null, ...f });

test("serienumre renses", () => {
  assert.deepEqual(cleanSerial("No 2.345.678", "x"), [2345678, []]);
  assert.equal(cleanSerial("1 234 567", "x")[0], 1234567);
  const [v, w] = cleanSerial("2O45l78", "Verksnummer");
  assert.equal(v, 2045178);
  assert.match(w[0], /Sjekk sifrene/);
  assert.equal(cleanSerial("Swiss Made", "Kassenummer")[0], null);
});

test("merker normaliseres", () => {
  assert.equal(normalizeBrand("OMEGA Watch Co."), "omega");
  assert.equal(normalizeBrand("Ω"), "omega");
  assert.equal(normalizeBrand("usignert"), null);
  assert.equal(normalizeBrand(null), null);
});

test("materiale fra stempler", () => {
  assert.equal(detectMaterial(hallmarks, ["0,800"]).material, "silver_800");
  assert.equal(detectMaterial(hallmarks, ["ARGENTAN"]).material, "base_metal");
  assert.equal(detectMaterial(hallmarks, ["Métal"]).material, "base_metal");
  assert.equal(detectMaterial(hallmarks, ["0.935", "Swiss"]).material, "silver_935");
  assert.equal(detectMaterial(hallmarks, ["1800"]).material, null);
  assert.equal(detectMaterial(hallmarks, ["8001"]).material, null);
  const cuvette = detectMaterial(hallmarks, ["0.800", "Cuvette: Métal"]);
  assert.equal(cuvette.material, "silver_800");
  assert.deepEqual(cuvette.warnings, []);
  const onlyCuvette = detectMaterial(hallmarks, ["Cuvette Métal"]);
  assert.equal(onlyCuvette.material, null);
  assert.match(onlyCuvette.warnings[0], /Bare cuvetten/);
  const conflict = detectMaterial(hallmarks, ["0.800", "Métal"]);
  assert.equal(conflict.material, "silver_800");
  assert.ok(conflict.warnings.some((w) => w.includes("cuvetten")));
});

test("merke fra urskivetekst og bekreftet materiale vinner", () => {
  assert.equal(normalize(hallmarks, { dial_text: "OMEGA", movement_serial: "2 345 678", escapement: "lever" }, "vision").brand, "omega");
  const n = normalize(hallmarks, { brand: "Omega", material: "silver_875", case_stamps: ["0.800"], escapement: "lever" }, "confirmed");
  assert.equal(n.material, "silver_875");
});

test("datering", () => {
  const r = dateItem(ranges, facts({ brand: "omega", movement_serial: 2500000 }));
  assert.equal(r.status, "dated");
  assert.deepEqual([r.year_from, r.year_to, r.estimate], [1908, 1911, 1910]);
  assert.equal(dateItem(ranges, facts({ brand: "omega", movement_serial: 1000000 })).estimate, 1895);
  assert.equal(dateItem(ranges, facts({ brand: "omega", movement_serial: 4999999 })).estimate, 1922);
  assert.equal(dateItem(ranges, facts({ brand: "omega", movement_serial: 99999999, case_number: 12345 })).status, "out_of_range");
  assert.equal(dateItem(ranges, facts({ movement_serial: 123456 })).status, "unknown_brand");
  assert.equal(dateItem(ranges, facts({ brand: "omega" })).status, "no_serial");
  assert.equal(dateItem(ranges, facts({ brand: "zenith", movement_serial: 123456 })).status, "unknown_brand");
});

test("prisintervall", () => {
  const v = valueItem(sales, facts({ brand: "omega", material: "silver_800", escapement: "lever" }));
  assert.deepEqual([v.min, v.median, v.max, v.n_sales, v.period], [1500, 2300, 3800, 8, "2019–2025"]);
  assert.equal(v.match_level, "brand+material+escapement");

  const u = valueItem(sales, facts({ material: "base_metal", escapement: "cylinder" }));
  assert.deepEqual([u.min, u.median, u.max, u.n_sales], [150, 265, 450, 10]);
  assert.match(u.match_label, /^Usignerte ur/);

  const w = valueItem(sales, facts({ brand: "omega", material: "silver_875", escapement: "lever" }));
  assert.equal(w.match_level, "brand+escapement");
  assert.deepEqual(w.criteria_dropped, ["materiale"]);

  const few = valueItem(sales, facts({ brand: "omega", material: "base_metal", escapement: "lever" }), { minSales: 50 });
  assert.equal(few.sufficient_data, false);

  assert.equal(valueItem(sales, facts({ brand: "zenith", material: "silver_800", escapement: "lever" })), null);

  const unk = valueItem(sales, facts({ brand: "omega", material: "silver_800", escapement: "unknown" }));
  assert.equal(unk.match_level, "brand+material");
  assert.ok(unk.caveats.some((c) => c.includes("ukjent")));
});
