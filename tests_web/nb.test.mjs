import assert from "node:assert/strict";
import { test } from "node:test";
import { nbQuery, nbUrls, personName, toCandidates } from "../docs/js/nb.js";

const item = (id, title, creators, issued, mediaTypes = ["bøker"], publisher) => ({
  id, _links: {}, metadata: { title, creators, mediaTypes, originInfo: { issued, ...(publisher ? { publisher } : {}) } } });

test("personName snur «Etternavn, Fornavn»", () => {
  assert.equal(personName("Hamsun, Knut"), "Knut Hamsun");
  assert.equal(personName("Amorin"), "Amorin");
});

test("nbQuery og nbUrls: ISBN først, så tittel og forfatter, bare bøker", () => {
  const q = nbQuery({ numbers: [{ value: "82-05-12345-6", prefix: "ISBN" }] }, { title: "Sult", creator: "Knut Hamsun" });
  assert.deepEqual(q, { isbn: "8205123456", title: "Sult", creator: "Knut Hamsun" });
  const urls = nbUrls(q).map((u) => new URL(u));
  assert.deepEqual(urls.map((u) => u.searchParams.get("q")), ["isbn:8205123456", "Sult Knut Hamsun"]);
  assert.ok(urls.every((u) => u.searchParams.get("filter") === "mediatype:bøker"));
});

test("toCandidates: hopper over artikler, viser utgaver med år og «sjekk» på trykkeåret", () => {
  const r = toCandidates([
    item("a1", 'Dengang Hamsun skrev "Sult"', ["Hamsun, Tore"], "1966", ["artikler"]),
    item("b1", "Sult", ["Hamsun, Knut"], "1957", ["bøker"], "Gyldendal"),
    item("b2", "Sult", ["Hamsun, Knut"], "1990", ["bøker"], "Gyldendal"),
    item("b3", "Sult", ["Hamsun, Knut"], "1990", ["bøker"], "Gyldendal"),
  ], { title: "Sult" });
  assert.equal(r.decided, false);
  assert.deepEqual(r.candidates.map((c) => c.name), ["Sult – Knut Hamsun (1957)", "Sult – Knut Hamsun (1990)"]);
  assert.match(r.candidates[0].check, /trykkeåret 1957/);
  assert.equal(r.candidates[0].url, "https://www.nb.no/items/b1");
  assert.equal(r.candidates[1].nb.year, 1990);
});

test("toCandidates: ett treff er avgjort; feil tittel gir ingenting", () => {
  assert.equal(toCandidates([item("b1", "Sult", ["Hamsun, Knut"], "1957")], { title: "Sult" }).decided, true);
  assert.equal(toCandidates([item("x", "Markens grøde", ["Hamsun, Knut"], "1917")], { title: "Sult" }).candidates.length, 0);
});
