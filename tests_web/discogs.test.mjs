import assert from "node:assert/strict";
import { test } from "node:test";
import { discogsQuery, parseStats, searchUrls, toCandidates } from "../docs/js/discogs.js";

const facts = { numbers: [{ value: "PL 74053", prefix: "Cat. no" }, { value: "5 012981 214022", prefix: "EAN" }], title: "Rumours", creator: "Fleetwood Mac" };
const normalized = { title: "Rumours", creator: "Fleetwood Mac", brand_display: "Warner Bros. Records" };

test("discogsQuery henter strekkode, katalognummer, artist, tittel og selskap fra bildeanalysen", () => {
  const q = discogsQuery(facts, normalized);
  assert.deepEqual(q, { barcode: "5012981214022", catno: "PL 74053", artist: "Fleetwood Mac", title: "Rumours", label: "Warner Bros. Records" });
});

test("searchUrls søker i rekkefølge: strekkode, katalognummer (med og uten selskap), artist og tittel", () => {
  const urls = searchUrls(discogsQuery(facts, normalized), "TOK").map((u) => new URL(u));
  assert.deepEqual(urls.map((u) => [...u.searchParams.keys()].filter((k) => !["type", "per_page", "token"].includes(k)).join("+")),
    ["barcode", "catno+label", "catno", "artist+release_title"]);
  assert.ok(urls.every((u) => u.searchParams.get("token") === "TOK" && u.searchParams.get("type") === "release"));
});

const R = (id, extra) => ({ id, title: "Fleetwood Mac - Rumours", uri: `/release/${id}-Rumours`, label: ["Warner Bros. Records"], format: ["Vinyl", "LP", "Album"], ...extra });

test("toCandidates: pressinger med år, land og katalognummer, «sjekk» på katalognummer, høyst fire", () => {
  const r = toCandidates([R(1, { year: "1977", country: "Norway", catno: "WB 56344" }), R(2, { year: "1977", country: "UK", catno: "K 56344" }),
    R(2, { year: "1977", country: "UK", catno: "K 56344" }), R(3, { year: "1980", country: "US", catno: "BSK 3010" }),
    R(4, { year: "1977", country: "Germany", catno: "WB 56 344" }), R(5, { year: "1977", country: "France", catno: "x" })]);
  assert.equal(r.decided, false);
  assert.equal(r.candidates.length, 4);
  const c = r.candidates[0];
  assert.equal(c.creator, "Fleetwood Mac"); assert.equal(c.title, "Rumours"); assert.equal(c.what, "LP-plate");
  assert.match(c.why, /1977 · Norway · Warner Bros. Records WB 56344/);
  assert.match(c.check, /WB 56344/);
  assert.equal(c.url, "https://www.discogs.com/release/1-Rumours");
  assert.equal(c.discogs.year, 1977);
});

test("toCandidates: ett treff, eller treff på strekkode, er avgjort", () => {
  assert.equal(toCandidates([R(1, { year: "1977" })]).decided, true);
  assert.equal(toCandidates([R(1, { year: "1977" })], { exact: true }).candidates[0].check, null);
  assert.equal(toCandidates([]).decided, false);
});

test("parseStats: laveste pris og antall til salgs", () => {
  assert.deepEqual(parseStats({ lowest_price: { currency: "EUR", value: 12.5 }, num_for_sale: 34 }), { lowest: { value: 12.5, currency: "EUR" }, forSale: 34 });
  assert.deepEqual(parseStats({ lowest_price: null, num_for_sale: 0 }), { lowest: null, forSale: 0 });
});

test("«Sjekk» peker på det som skiller: land når katalognummeret er likt", () => {
  const r = toCandidates([R(1, { year: "1977", country: "Norway", catno: "WB 56344" }), R(2, { year: "1977", country: "Germany", catno: "WB 56344" })]);
  assert.match(r.candidates[0].check, /produksjonslandet \(Norway\)/);
  assert.match(r.candidates[1].check, /Germany/);
  const same = toCandidates([R(1, { year: "1977", country: "UK", catno: "K 1" }), R(2, { year: "1977", country: "UK", catno: "K 1", title: "Fleetwood Mac - Rumours (remaster)" })]);
  assert.equal(same.candidates[0].check, null, "ingen falsk sjekk når ingenting skiller");
});
