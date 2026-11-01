// Datering ved oppslag i serienummertabellen. Samme regler som app/services/dating.py.

import { CATEGORY_LABELS, isWatch } from "./normalize.js";

const STOCK_NOTE = "Året gjelder produksjon av verket; uret kan være satt i kasse og solgt noe senere.";
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export function dateBySerial(ranges, brand, serial, numberType) {
  const row = ranges
    .filter((r) => r.brand === brand && r.number_type === numberType && serial >= r.serial_start && serial <= r.serial_end)
    .sort((a, b) => (a.serial_end - a.serial_start) - (b.serial_end - b.serial_start))[0];
  if (!row) return null;

  let estimate, method, display;
  if (row.year_from === row.year_to) {
    estimate = row.year_from;
    method = "Direkte treff i tabellen.";
    display = `ca. ${estimate} (±1 år)`;
  } else {
    // Tabellen angir bare grensene; plassering innenfor er en lineær tilnærming.
    const span = row.serial_end - row.serial_start + 1;
    const fraction = (serial - row.serial_start) / span;
    estimate = Math.min(row.year_to, row.year_from + Math.floor(fraction * (row.year_to - row.year_from + 1)));
    method = `Tabellen dekker ${row.year_from}–${row.year_to}. Året er anslått ved lineær plassering ` +
      "innenfor intervallet og er usikkert.";
    display = `ca. ${estimate} (innenfor ${row.year_from}–${row.year_to})`;
  }
  const label = numberType === "movement" ? "verksnummer" : "kassenummer";
  return {
    status: "dated", message: `Datert etter ${label}. ${STOCK_NOTE}`,
    number_used: numberType, serial, year_from: row.year_from, year_to: row.year_to,
    estimate, display, method, source: row.source, is_demo: row.is_demo,
  };
}

const FEATURE_LABELS = {
  "winding:key": "nøkkeloppstrekk", "winding:stem": "kroneoppstrekk",
  "escapement:verge": "spindelgang", "escapement:cylinder": "sylindergang", "escapement:lever": "ankergang",
  "movement_layout:bar": "verk med broer", "movement_layout:three_quarter_plate": "trekvart plate",
  "movement_layout:full_plate": "hel plate",
};

/** Snitter periodene for kjente kjennetegn. Gir et intervall, aldri et årstall. */
export function estimatePeriod(rules, facts) {
  const rows = ["winding", "escapement", "movement_layout"]
    .map((f) => [f, facts[f]])
    .filter(([, v]) => v && v !== "unknown")
    .map(([f, v]) => rules.find((r) => r.feature === f && r.value === v))
    .filter(Boolean);
  if (!rows.length) return null;
  const yearFrom = Math.max(...rows.map((r) => r.year_from));
  const yearTo = Math.min(...rows.map((r) => r.year_to));
  if (yearFrom > yearTo) return null;
  return {
    year_from: yearFrom, year_to: yearTo,
    basis: rows.map((r) => FEATURE_LABELS[`${r.feature}:${r.value}`] ?? r.value),
    display: `ca. ${yearFrom}–${yearTo}`, is_demo: rows.some((r) => r.is_demo),
  };
}

/** Serienummer først; ellers en grov periode ut fra kjennetegn. */
export function dateItem(ranges, facts, rules = []) {
  if (!isWatch(facts.category)) {
    const label = (CATEGORY_LABELS[facts.category] ?? "denne typen ting").toLowerCase();
    return { status: "no_tables", message: `Vi har ingen dateringstabeller for ${label} ennå. Se bakgrunnen fra nettet nedenfor.` };
  }
  const result = dateByNumber(ranges, facts);
  if (result.status !== "dated") result.period = estimatePeriod(rules, facts);
  return result;
}

/** Prøver verksnummer først, deretter kassenummer. */
function dateByNumber(ranges, facts) {
  const candidates = [[facts.movement_serial, "movement"], [facts.case_number, "case"]].filter(([n]) => n);
  if (!candidates.length) {
    return { status: "no_serial", message: "Fant ikke noe nummer å datere etter." };
  }
  if (!facts.brand) {
    return { status: "unknown_brand", message: "Usignerte ur kan ikke dateres etter serienummer." };
  }
  if (!ranges.some((r) => r.brand === facts.brand)) {
    return { status: "unknown_brand", message: `Vi har ingen serienummertabell for «${facts.brand_display || facts.brand}».` };
  }
  for (const [serial, type] of candidates) {
    const result = dateBySerial(ranges, facts.brand, serial, type);
    if (result) return result;
  }
  const tried = candidates.map(([s]) => fmt(s)).join(", ");
  return { status: "out_of_range", message: `Nummeret (${tried}) ligger utenfor tabellene våre for ${facts.brand}. ` +
    "Sjekk sifrene, eller om det er et annet nummer (f.eks. kaliber eller kasse)." };
}
