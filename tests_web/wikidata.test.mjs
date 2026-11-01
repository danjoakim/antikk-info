import assert from "node:assert/strict";
import { test } from "node:test";
import { factLine, factsOf, pickEntity } from "../docs/js/wikidata.js";

const ent = (id, p31, { label, desc, claims = {}, sitelinks = {} } = {}) => ({
  id, labels: { nb: { value: label } }, descriptions: desc ? { nb: { value: desc } } : {},
  claims: { P31: p31.map((q) => ({ mainsnak: { datavalue: { value: { id: q } } } })), ...claims }, sitelinks,
});
const time = (y) => [{ mainsnak: { datavalue: { value: { time: `+${y}-00-00T00:00:00Z` } } } }];
const item = (q) => [{ mainsnak: { datavalue: { value: { id: q } } } }];

test("pickEntity hopper over bokstaver og steder med samme navn og tar firmaet", () => {
  const letter = ent("Q9890", ["Q9788"], { label: "Omega", desc: "gresk bokstav" });
  const town = ent("Q1", ["Q515"], { label: "Omega", desc: "by i Georgia", claims: { P625: [{}] } });
  const firm = ent("Q659379", ["Q4830453"], { label: "Omega", desc: "sveitsisk urprodusent" });
  assert.equal(pickEntity([letter, town, firm], "Omega").entity.id, "Q659379");
});

test("pickEntity godtar merker via beskrivelsen når typen er en undertype vi ikke kjenner", () => {
  const ps = ent("Q10680", ["Q999999"], { label: "PlayStation", desc: "merke for spillkonsoller fra Sony" });
  assert.equal(pickEntity([ps], "PlayStation").kind, "maker");
});

test("pickEntity kjenner igjen personer og krever at navnet passer", () => {
  const hamsun = ent("Q41042", ["Q5"], { label: "Knut Hamsun", desc: "norsk forfatter" });
  assert.equal(pickEntity([hamsun], "Knut Hamsun").kind, "person");
  assert.equal(pickEntity([hamsun], "Sigrid Undset"), null);
});

test("factsOf og factLine: årstall, land og Wikipedia-artikkel", () => {
  const hamsun = ent("Q41042", ["Q5"], { label: "Knut Hamsun", desc: "norsk forfatter",
    claims: { P569: time(1859), P570: time(1952), P27: item("Q20") }, sitelinks: { nowiki: { title: "Knut Hamsun" } } });
  const f = factsOf(hamsun, "person");
  assert.equal(f.born, 1859); assert.equal(f.died, 1952); assert.deepEqual(f.countryIds, ["Q20"]);
  assert.deepEqual(f.wiki, { lang: "no", title: "Knut Hamsun" });
  assert.equal(factLine(f, ["Norge"]), "norsk forfatter · 1859–1952 · Norge");
  const sony = factsOf(ent("Q41187", ["Q167037"], { label: "Sony", desc: "japansk konglomerat",
    claims: { P571: time(1946), P17: item("Q17") }, sitelinks: { enwiki: { title: "Sony" } } }), "maker");
  assert.equal(factLine(sony, ["Japan"]), "japansk konglomerat · grunnlagt 1946 · Japan");
  assert.deepEqual(sony.wiki, { lang: "en", title: "Sony" });
});
