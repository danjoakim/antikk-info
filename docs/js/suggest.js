// Hvilket bilde vil hjelpe mest? Samme regler som app/services/suggest.py.
// Ett godt kjennetegn kan være nok, så appen foreslår høyst to bilder.

import { LOCATION_LABELS } from "./normalize.js";

const MAX_SUGGESTIONS = 2;

function seen(facts) {
  const s = new Set([
    ...(facts.photos ?? []).map((p) => p.shows),
    ...(facts.numbers ?? []).map((n) => n.location),
    ...(facts.marks ?? []).map((m) => m.location),
  ]);
  for (const u of [...(facts.unreadable ?? []), "unknown"]) s.delete(u);
  return s;
}

export function suggestPhotos(ranges, facts, n) {
  const have = seen(facts);
  const wanted = [];
  const want = (location, reason) => {
    if (!have.has(location) && !wanted.some((w) => w.location === location)) wanted.push({ location, reason });
  };

  if (!have.size) {
    want("outer_lid_inside", "Innsiden av lokkene har oftest mest: sølvstempel, nummer og ofte navn.");
    want("cuvette_outside", "Cuvetten har ofte gravert navn, gangtype og antall steiner.");
  }
  const hasTable = !!n.brand && ranges.some((r) => r.brand === n.brand);
  if (hasTable && n.movement_serial == null) {
    want("movement", `Vi har serienummertabell for ${n.brand_display || n.brand}. Et verksnummer kan datere uret.`);
  }
  if (n.material == null) {
    want("outer_lid_inside", "Sølv- og gullstempler står vanligvis på innsiden av det ytre lokket.");
    want("cuvette_inside", "Stempelet kan også stå inni cuvetten.");
  }
  if (!n.brand && !(facts.marks ?? []).some((m) => m.type === "inscription")) {
    want("cuvette_outside", "Navnet på urmaker eller forhandler står ofte gravert på cuvetten.");
    want("dial", "Urskiven kan være signert.");
  }
  if (n.escapement === "unknown") {
    want("cuvette_outside", "Gangtypen («Ancre», «Cylindre») står ofte på cuvetten.");
    want("movement", "Urverket viser gangtypen.");
  }
  if (n.winding === "unknown") want("movement", "Firkantede tapper på verket betyr nøkkeloppstrekk.");
  if (n.case_number && !n.numbers_match) want("cuvette_inside", "Står samme nummer i cuvetten, hører lokkene trolig sammen.");

  return wanted.slice(0, MAX_SUGGESTIONS).map((w) => ({ ...w, label: LOCATION_LABELS[w.location] ?? w.location }));
}
