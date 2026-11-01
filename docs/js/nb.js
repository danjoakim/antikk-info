// Nasjonalbiblioteket: katalogen over norske bøker (api.nb.no), uten nøkkel.
// Finner riktig bok og utgave ut fra ISBN eller tittel og forfatter. Søket gir også artikler
// om bøkene, så bare treff med medietypen «bøker» brukes.

const API = "https://api.nb.no/catalog/v1/items";
const MAX_CANDIDATES = 4;

/** «Hamsun, Knut» → «Knut Hamsun». */
export function personName(s) {
  const m = /^([^,]+),\s*(.+)$/.exec(String(s ?? "").trim());
  return m ? `${m[2]} ${m[1]}` : String(s ?? "").trim() || null;
}

export function nbQuery(facts, normalized) {
  const isbn = (facts.numbers ?? []).find((n) => /isbn/i.test(n.prefix ?? "") || /^97[89]/.test(String(n.value).replace(/\D/g, "")))?.value;
  return {
    isbn: isbn ? String(isbn).replace(/[^\dXx]/g, "") : null,
    title: normalized.title ?? facts.title ?? null,
    creator: normalized.creator ?? facts.creator ?? null,
  };
}

export function nbUrls(q) {
  const make = (query) => `${API}?${new URLSearchParams({ q: query, filter: "mediatype:bøker", size: "10" })}`;
  const urls = [];
  if (q.isbn) urls.push(make(`isbn:${q.isbn}`));
  if (q.title) urls.push(make([q.title, q.creator].filter(Boolean).join(" ")));
  return urls;
}

const yearOf = (s) => Number(/(\d{4})/.exec(String(s ?? ""))?.[1]) || null;

/** Gjør katalogtreff om til forslag i samme form som identifiseringen. */
export function toCandidates(items, q = {}, { exact = false } = {}) {
  const words = String(q.title ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  const seen = new Set();
  const out = [];
  for (const it of items ?? []) {
    const m = it?.metadata ?? {};
    if (!(m.mediaTypes ?? []).some((t) => /bøker|books/i.test(t))) continue;
    const title = String(m.title ?? m.titleInfos?.[0]?.title ?? "").replace(/[[\]]/g, "").trim();   // «[Markens grøde]» → «Markens grøde»
    if (!title) continue;
    if (words.length && !words.some((w) => title.toLowerCase().includes(w))) continue;
    const creator = personName((m.creators ?? [])[0]);
    const year = yearOf(m.originInfo?.issued);
    const publisher = m.originInfo?.publisher ?? m.publisher ?? null;
    const key = `${title.toLowerCase()}|${year}|${publisher ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: `${title}${creator ? ` – ${creator}` : ""}${year ? ` (${year})` : ""}`,
      what: "bok", title, creator, maker: publisher,
      why: [year ? `utgitt ${year}` : "år ukjent", publisher].filter(Boolean).join(" · "),
      check: null, url: `https://www.nb.no/items/${encodeURIComponent(it.id)}`, site: "nb.no",
      thumb: it._links?.thumbnail_custom?.href?.replace("{width}", "120").replace("{height}", "160")
        ?? it._links?.thumbnail_small?.href ?? null,
      nb: { id: it.id, year, publisher },
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  // «Sjekk» peker på det som skiller utgavene: trykkeår, ellers forlag.
  const differs = (k) => new Set(out.map((c) => k(c) ?? "")).size > 1;
  const byYear = differs((c) => c.nb.year), byPub = differs((c) => c.nb.publisher);
  for (const c of out) {
    if (byYear && c.nb.year) c.check = `Se etter trykkeåret ${c.nb.year} på baksiden av tittelbladet.`;
    else if (byPub && c.nb.publisher) c.check = `Se etter forlaget ${c.nb.publisher} på tittelbladet.`;
  }
  const decided = out.length === 1 || (exact && out.length > 0 && (items ?? []).length === 1);
  return { candidates: decided ? out.slice(0, 1).map((c) => ({ ...c, check: null })) : out, decided: decided && out.length > 0 };
}

/** Finner boka. Gir { candidates, decided, source } – tom liste når ingenting passer. Kaster ved nettverksfeil. */
export async function nbIdentify(facts, normalized, { signal } = {}) {
  const q = nbQuery(facts, normalized);
  for (const [i, url] of nbUrls(q).entries()) {
    let res;
    try {
      res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    } catch (err) {
      if (err.name === "AbortError") throw err;
      throw new Error("Fikk ikke kontakt med Nasjonalbiblioteket.");
    }
    if (!res.ok) throw new Error(`Nasjonalbiblioteket svarte med feil (${res.status}).`);
    const items = (await res.json())?._embedded?.items ?? [];
    const r = toCandidates(items, q, { exact: i === 0 && !!q.isbn });
    if (r.candidates.length) return { ...r, source: "nb" };
  }
  return { candidates: [], decided: false, source: "nb" };
}
