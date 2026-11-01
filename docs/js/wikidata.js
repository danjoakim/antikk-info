// Wikidata: strukturerte fakta om produsenter, merker, forlag, plateselskap og personer
// (forfattere, kunstnere, designere). Ingen nøkkel, data under CC0. Treffet godtas bare når
// Wikidata sier at det er et firma, et merke, en organisasjon eller et menneske – ikke en by
// eller en bokstav med samme navn. Wikipedia-teksten hentes etterpå med nøyaktig artikkeltittel.

const WD = "https://www.wikidata.org/w/api.php";

// «Forekomst av» (P31) som godtas.
const PERSON = new Set(["Q5"]);
const MAKER = new Set([
  "Q4830453", // virksomhet
  "Q783794",  // firma
  "Q891723",  // børsnotert selskap
  "Q6881511", // foretak
  "Q167037",  // konsern
  "Q1589009", // privat selskap
  "Q658255",  // datterselskap
  "Q43229",   // organisasjon
  "Q431289",  // merke
  "Q83405",   // fabrikk
  "Q2085381", // forlag
  "Q18127",   // plateselskap
  "Q210167",  // spillutvikler
  "Q1137109", // spillutgiver
  "Q1331793", // mediefirma
  "Q1762059", // filmselskap
  "Q215380",  // musikkgruppe
  "Q2088357", // musikkensemble
  "Q5741069", // rockeband
]);

// Reserve når typen er en undertype vi ikke har listet: beskrivelsen sier hva det er.
const MAKER_WORDS = /(firma|selskap|produsent|fabrikk|merke|forlag|plateselskap|konsern|band|konsoll|company|corporation|brand|manufacturer|maker|publisher|record label|band|console|studio)/i;

const year = (claim) => {
  const t = claim?.mainsnak?.datavalue?.value?.time;
  const m = /^[+-]?(\d{1,4})-/.exec(t ?? "");
  return m ? Number(m[1]) : null;
};
const ids = (claims, prop) => (claims?.[prop] ?? []).map((c) => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);

/** Velger første treff som er et menneske eller en produsent/merke, og der navnet passer. */
export function pickEntity(entities, name) {
  const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  for (const e of entities) {
    const types = ids(e.claims, "P31");
    const desc = `${e.descriptions?.nb?.value ?? ""} ${e.descriptions?.en?.value ?? ""}`;
    const place = !!e.claims?.P625;   // har koordinater: et sted, ikke en produsent
    const kind = types.some((t) => PERSON.has(t)) || e.claims?.P569 ? "person"
      : types.some((t) => MAKER.has(t)) || (!place && MAKER_WORDS.test(desc)) ? "maker" : null;
    if (!kind) continue;
    const labels = [e.labels?.nb?.value, e.labels?.en?.value, ...Object.values(e.aliases ?? {}).flat().map((a) => a.value)]
      .filter(Boolean).map((l) => l.toLowerCase());
    if (words.length && !words.some((w) => labels.some((l) => l.includes(w)))) continue;
    return { entity: e, kind };
  }
  return null;
}

/** Fakta fra treffet. Landnavn hentes i et eget kall (labels for landenes ID-er). */
export function factsOf(entity, kind) {
  const c = entity.claims ?? {};
  const f = {
    id: entity.id, kind,
    label: entity.labels?.nb?.value ?? entity.labels?.en?.value ?? entity.id,
    description: entity.descriptions?.nb?.value ?? entity.descriptions?.en?.value ?? null,
    url: `https://www.wikidata.org/wiki/${entity.id}`,
    wiki: entity.sitelinks?.nowiki ? { lang: "no", title: entity.sitelinks.nowiki.title }
      : entity.sitelinks?.enwiki ? { lang: "en", title: entity.sitelinks.enwiki.title } : null,
  };
  if (kind === "person") {
    f.born = year(c.P569?.[0]); f.died = year(c.P570?.[0]);
    f.countryIds = ids(c, "P27").slice(0, 2);
  } else {
    f.founded = year(c.P571?.[0]); f.ended = year(c.P576?.[0]);
    f.countryIds = ids(c, "P17").slice(0, 2);
  }
  return f;
}

/** Kort linje: «norsk forfatter · 1859–1952 · Norge» eller «japansk konglomerat · grunnlagt 1946 · Japan». */
export function factLine(f, countries = []) {
  const parts = [];
  if (f.description) parts.push(f.description);
  if (f.kind === "person" && (f.born || f.died)) parts.push(`${f.born ?? "?"}–${f.died ?? ""}`.replace(/–$/, "–"));
  if (f.kind === "maker" && f.founded) parts.push(`grunnlagt ${f.founded}${f.ended ? `, nedlagt ${f.ended}` : ""}`);
  if (countries.length) parts.push(countries.join(", "));
  return parts.join(" · ");
}

async function get(params, signal) {
  const url = `${WD}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Wikidata svarte ${res.status}`);
  return res.json();
}

/** Slår opp et navn. Gir fakta, landnavn og eventuell Wikipedia-artikkel, eller null. */
export async function lookupWikidata(name, { signal } = {}) {
  const found = await get({ action: "wbsearchentities", search: name, language: "nb", uselang: "nb", type: "item", limit: "7" }, signal);
  const qids = (found.search ?? []).map((s) => s.id);
  if (!qids.length) return null;
  const data = await get({ action: "wbgetentities", ids: qids.join("|"), props: "claims|labels|descriptions|aliases|sitelinks",
    languages: "nb|en" }, signal);
  const ordered = qids.map((q) => data.entities?.[q]).filter(Boolean);
  const hit = pickEntity(ordered, name);
  if (!hit) return null;
  const f = factsOf(hit.entity, hit.kind);
  let countries = [];
  if (f.countryIds.length) {
    const lab = await get({ action: "wbgetentities", ids: f.countryIds.join("|"), props: "labels", languages: "nb|en" }, signal).catch(() => ({}));
    countries = f.countryIds.map((q) => lab.entities?.[q]?.labels?.nb?.value ?? lab.entities?.[q]?.labels?.en?.value).filter(Boolean);
  }
  let extract = null;
  if (f.wiki) {
    const w = await fetch(`https://${f.wiki.lang}.wikipedia.org/w/api.php?${new URLSearchParams({
      action: "query", format: "json", origin: "*", redirects: "1", prop: "extracts|info", exintro: "1", explaintext: "1",
      exsentences: "3", inprop: "url", titles: f.wiki.title })}`, { signal }).then((r) => r.json()).catch(() => null);
    const page = Object.values(w?.query?.pages ?? {})[0];
    if (page?.extract) extract = { text: page.extract, url: page.fullurl, title: page.title };
  }
  return { ...f, line: factLine(f, countries), extract };
}
