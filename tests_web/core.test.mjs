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
const rules = load("period_rules");
const MONARD = load("vision_contract").mock_scenarios.monard_key_wind;
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
  assert.equal(normalize(hallmarks, { dial_text: "OMEGA", numbers: [{ value: "2 345 678", location: "movement" }], escapement: "lever" }, "vision").brand, "omega");
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
  assert.match(u.match_label, /^Usignerte og mindre kjente ur/);

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

// --- Ekte ur: G. Monard, Genève (samme fasit som Python-testene) ---------------------

test("Monard: nummer, merker og materiale", () => {
  const n = normalize(hallmarks, MONARD, "vision");
  assert.deepEqual([n.brand, n.brand_display, n.known_brand], ["g. monard", "G. Monard, Genève", false]);
  assert.deepEqual([n.case_number, n.movement_serial, n.numbers_match], [101954, null, true]);
  assert.deepEqual(n.number_groups[0].locations, ["outer_lid_inside", "cuvette_outside", "cuvette_inside"]);
  assert.ok(n.repair_marks.some((r) => r.includes("K9341")));
  assert.equal(n.owner_engravings.length, 2);
  assert.equal(n.material, "silver_800");
  assert.deepEqual(n.warnings, []);
  assert.deepEqual([n.escapement, n.winding, n.movement_layout], ["cylinder", "key", "bar"]);
});

test("Monard: grov periode og pris mot usignerte", () => {
  const n = normalize(hallmarks, MONARD, "vision");
  const d = dateItem(ranges, n, rules);
  assert.equal(d.status, "unknown_brand");
  assert.deepEqual([d.period.year_from, d.period.year_to], [1830, 1890]);
  assert.deepEqual(d.period.basis, ["nøkkeloppstrekk", "sylindergang", "verk med broer"]);
  const v = valueItem(sales, n);
  assert.deepEqual([v.min, v.median, v.max, v.n_sales], [450, 625, 900, 6]);
  assert.ok(v.caveats.some((c) => c.includes("G. Monard") && c.includes("merkelisten")));
});

test("innrissede og blandede nummer blir aldri serienummer", () => {
  const n = normalize(hallmarks, { numbers: [
    { value: "K9341", location: "outer_lid_inside", method: "stamped" },
    { value: "4512", location: "movement", method: "scratched" },
  ] }, "vision");
  assert.deepEqual([n.case_number, n.movement_serial], [null, null]);
  assert.ok(n.warnings.some((w) => w.includes("K9341")));
  assert.ok(n.repair_marks.some((r) => r.includes("4512")));
});

test("ulike kassenummer gir advarsel; motstridende perioder gir intervall", () => {
  const n = normalize(hallmarks, { numbers: [
    { value: "101954", location: "outer_lid_inside", method: "stamped" },
    { value: "55321", location: "cuvette_inside", method: "stamped" },
  ] }, "vision");
  assert.equal(n.numbers_match, false);
  assert.ok(n.warnings.some((w) => w.includes("satt sammen")));
  assert.equal(dateItem(ranges, facts({ escapement: "verge", winding: "stem" }), rules).period.display, "ca. 1860–1870");
});
