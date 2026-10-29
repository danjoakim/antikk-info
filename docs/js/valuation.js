// Prisintervall fra realiserte salg. Samme regler som app/services/valuation.py.

import { isKnownBrand } from "./normalize.js";

// Fra mest til minst spesifikt. Merke slippes aldri: et signert ur sammenlignes ikke med usignerte.
const LEVELS = [
  ["brand+material+escapement", ["material", "escapement"], "{who}, samme materiale og gangtype"],
  ["brand+material", ["material"], "{who}, samme materiale (gangtype ikke vektlagt)"],
  ["brand+escapement", ["escapement"], "{who}, samme gangtype (materiale ikke vektlagt)"],
  ["brand", [], "{who} (materiale og gangtype ikke vektlagt)"],
];
const CRITERIA_LABELS = { material: "materiale", escapement: "gangtype" };
const BASE_CAVEATS = [
  "Tilstand er ikke vurdert fra bildene, og den påvirker prisen mest.",
  "Prisene er hammerpriser uten salær med mindre annet er oppgitt.",
];

const known = (facts, field) => facts[field] != null && facts[field] !== "unknown";

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function fetchRows(sales, facts, itemType, use, brand) {
  return sales
    .filter((r) => r.item_type === itemType && r.brand === brand && use.every((f) => r[f] === facts[f]))
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
}

export function valueItem(sales, facts, { itemType = "pocket_watch", minSales = 5 } = {}) {
  const usable = LEVELS.filter(([, use]) => use.every((f) => known(facts, f)));
  // Kjente merker prises bare mot seg selv. Mindre kjente navn sammenlignes med usignerte ur.
  const brand = isKnownBrand(facts.brand) ? facts.brand : null;
  let fallback = null;
  for (const level of usable) {
    const rows = fetchRows(sales, facts, itemType, level[1], brand);
    if (rows.length >= minSales) return build(level, rows, facts, true, minSales);
    if (rows.length && !fallback) fallback = [level, rows];
  }
  return fallback ? build(...fallback, facts, false, minSales) : null;
}

function build([key, used, label], rows, facts, sufficient, minSales) {
  const prices = rows.map((r) => r.price_nok);
  const years = rows.map((r) => r.sale_date.slice(0, 4)).sort();
  const dropped = ["material", "escapement"].filter((f) => !used.includes(f)).map((f) => CRITERIA_LABELS[f]);
  const unknown = ["material", "escapement"].filter((f) => !known(facts, f)).map((f) => CRITERIA_LABELS[f]);
  const widened = dropped.filter((d) => !unknown.includes(d));

  const brandKnown = isKnownBrand(facts.brand);
  const caveats = [...BASE_CAVEATS];
  if (facts.brand && !brandKnown) {
    caveats.unshift(`«${facts.brand_display || facts.brand}» finnes ikke i merkelisten vår, så uret er sammenlignet ` +
      "med usignerte og mindre kjente ur.");
  }
  if (widened.length) caveats.unshift(`For få salg med nøyaktig samme egenskaper. Intervallet ser bort fra ${widened.join(" og ")}.`);
  if (unknown.length) {
    const s = unknown.join(" og ");
    caveats.unshift(`${s[0].toUpperCase()}${s.slice(1)} er ukjent, så intervallet blander ulike typer.`);
  }
  if (!sufficient) caveats.unshift(`Bare ${rows.length} sammenlignbare salg (minimum ${minSales}). Intervallet er svært usikkert.`);
  const isDemo = rows.some((r) => r.is_demo);
  if (isDemo) caveats.unshift("DEMODATA: salgene er fiktive eksempler og gir ingen reell markedsverdi.");

  return {
    min: Math.min(...prices), median: median(prices), max: Math.max(...prices), currency: "NOK",
    n_sales: rows.length,
    period: years[0] === years.at(-1) ? years[0] : `${years[0]}–${years.at(-1)}`,
    match_level: key,
    match_label: label.replace("{who}", brandKnown ? "Samme merke" : "Usignerte og mindre kjente ur"),
    sufficient_data: sufficient, criteria_dropped: dropped, caveats,
    comparables: rows.slice(0, 12).map(({ price_nok, sale_date, condition, auction_house, source_url, is_demo }) =>
      ({ price_nok, sale_date, condition, auction_house, source_url, is_demo })),
    is_demo: isDemo,
  };
}
