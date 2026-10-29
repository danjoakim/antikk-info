# Prosjektlogg – Lommeur-/antikvitetsappen (MVP)

Denne filen er prosjektets hukommelse. Den ligger i rotmappen og følger koden.

## Regler for loggføring

- **Når:** Ny oppføring etter hver ferdige funksjon og etter hver avsluttede økt.
- **Hva:** Dato, hva som ble gjort, hvilke filer som ble endret, teststatus og hva som gjenstår.
- **Beslutninger** føres i egen seksjon med begrunnelse, slik at vi vet *hvorfor* noe ble valgt.
- **Åpne spørsmål** står til de er avklart. Da flyttes de til beslutninger med svaret.
- Nyeste oppføring øverst i øktloggen.

---

## Status nå

| Område | Status |
|---|---|
| Planlegging | ✅ Ferdig |
| Database (skjema + seed) | ✅ Ferdig (demodata) |
| Datering (`dating.py`) | ✅ Ferdig, testet |
| Verdivurdering (`valuation.py`) | ✅ Ferdig, testet |
| Normalisering (`normalize.py`) | ✅ Ferdig, testet |
| Vision + mock-modus (`vision/`) | ✅ Fire leverandører (Anthropic, OpenAI, Gemini, OpenAI-kompatibel); mock og svartolking testet, live-kall ikke kjørt |
| Ruter (`/api/meta`, `/analyze`, `/lookup`) | 🟡 Skrevet; API-testene må kjøres lokalt (se økt 2) |
| Mobil-frontend | ✅ Ferdig, testet i mobilvisning (lys og mørk) |
| README (inkl. HTTPS-testing på mobil) | ✅ Ferdig |
| **Nettversjon for GitHub Pages (`docs/`)** | ✅ Ferdig og testet i mobilnettleser med simulert Gemini-svar; venter på repo og ekte nøkkel |

---

## Plan (backlog)

### Del 1 – Kjerne uten API-nøkkel
- [x] Mappestruktur, `config.py`, `.env.example`, `requirements.txt`
- [x] `db/schema.sql`: `serial_ranges` (med `number_type`, `source`, `is_demo`), `auction_results`, `hallmarks`
- [x] `db/seed.sql`: Omega 1895–1922 + referansesalg (usignert sylinder/metall, Omega/sølv). Alt merket `is_demo = 1`
- [x] `services/dating.py`: serienummer → «ca. år» med tabellintervall
- [x] `services/valuation.py`: min/median/maks, minimum antall salg, trinnvis utvidelse med `match_level`
- [x] Tester for datering og verdivurdering

### Del 2 – Vision, ruter og frontend
- [x] `services/vision.py`: tool use med strengt skjema, ingen felt for år/pris, mock-modus
- [x] `services/normalize.py`: stempler → kanoniske materialer, rensing av serienumre
- [x] `routes/analyze.py`: `POST /api/analyze` (fakta) og `POST /api/lookup` (bekreftede verdier)
- [x] `static/`: veiledet 3-stegs kameraflyt, komprimering/EXIF i nettleseren, redigerbart bekreftelsesskjema, resultatkort, PWA-manifest
- [x] Grense for filstørrelse, filtype og antall bilder på serveren
- [x] README med oppstart og testing på telefon via tunnel

### Del 3 – Nettversjon for mobil (GitHub Pages)
- [x] `tools/export_data.py`: seed.sql og vision-kontrakt → `docs/data/*.json`
- [x] Kjernelogikken portet til JavaScript (`docs/js/normalize.js`, `dating.js`, `valuation.js`) med samme tester
- [x] Gemini-kall fra nettleseren med strengt skjema og reserveskjema
- [x] Innstillinger: nøkkel og modell i nettleseren, test av nøkkel, demomodus
- [x] Legge koden i GitHub-repo (`danjoakim/antikk-info`, offentlig)
- [ ] Skru på Pages: *Settings → Pages*, gren `main`, mappe `/docs`
- [ ] Første ekte test med Gemini-nøkkel på telefonen

### Neste
- [ ] Kjøre `pytest` lokalt med FastAPI installert (API-testene ble hoppet over i sandkassen)
- [ ] Første live-test med ekte bilder og API-nøkkel; justere systemprompten etter resultatene
- [ ] Sammenligne leverandørene på de samme bildene (lesing av serienumre og stempler)
- [ ] Teste på ekte telefon via HTTPS-tunnel (iPhone/HEIC og Android)
- [ ] Verifisere Omega-tabellen og avklare verks- vs. kassenummer (åpent spørsmål 1)
- [ ] Erstatte fiktive salg med kuraterte, lenkede salg

### Senere (utenfor MVP)
- [ ] Importskript for kuraterte auksjonsdata (CSV → SQLite, `is_demo = 0`)
- [ ] Tabell `reference_estimates` for prisguider, holdt adskilt fra auksjonsdata
- [ ] Flere merker og andre antikviteter (`item_type`)
- [ ] Grov periodeangivelse for usignerte ur (fra gangtype og stempler)

---

## Beslutninger

| Dato | Beslutning | Begrunnelse |
|---|---|---|
| 2026-10-29 | FastAPI + SQLite (`sqlite3`, ingen ORM) | Kompakt, Pydantic validerer både API og vision-svar |
| 2026-10-29 | Claude vision via tool use med strengt JSON-skjema | Modellen kan bare returnere observasjoner, ikke år eller pris |
| 2026-10-29 | Modellen observerer, databasen konkluderer | Unngår hallusinerte årstall og priser |
| 2026-10-29 | To-stegs flyt: `/analyze` → brukeren bekrefter → `/lookup` | Ett feillest siffer kan flytte dateringen flere år |
| 2026-10-29 | Datering vises som «ca. år» + tabellintervall | Serienummertabeller gir 1–2 års presisjon; verk kunne ligge på lager |
| 2026-10-29 | Vision leser både verksnummer og kassenummer | Uklart hvilket nummer som daterer eldre Omega (se åpne spørsmål) |
| 2026-10-29 | Prisintervall krever minimum antall salg, viser n, periode og `match_level` | Ærlig intervall i stedet for falsk presisjon |
| 2026-10-29 | Mobil-først: kamera via `capture`, komprimering i nettleseren, veiledet flyt | Appen brukes hovedsakelig på telefon |
| 2026-10-29 | Frontend uten byggesteg (HTML + CSS + vanlig JS) | Enkelt å vedlikeholde i MVP |
| 2026-10-29 | Kun realiserte salg i `auction_results`, manuelt kurert med kildelenke | Utropspriser er ikke markedsverdi; skraping uten avtale er juridisk risikabelt |
| 2026-10-29 | Ashland / *Complete Price Guide to Watches* brukes ikke | Ingen tilgang eller lisens; guidepriser er ikke realiserte salg |
| 2026-10-29 | Utvikling uten underagenter, testing i mock-modus | Holder kvoteforbruket nede |
| 2026-10-29 | Serieintervaller lagres med `year_from`–`year_to` | Publiserte tabeller gir bare grenser; et intervall kan dekke flere år. Årsanslag innenfor er lineært og merkes som usikkert |
| 2026-10-29 | Stempler tolkes via egen `hallmarks`-tabell (regex + prioritet) | Nye stempler legges inn som data, ikke kode. Edelt metall vinner over «Métal» fordi cuvetten ofte er i metall; brukeren får advarsel |
| 2026-10-29 | Prisutvidelse slipper aldri merket | Et signert ur skal aldri prises mot usignerte |
| 2026-10-29 | Fiktive salg merkes «DEMO (fiktivt salg)», ikke med ekte auksjonshus | Unngår å tillegge virkelige firmaer salg som ikke har skjedd |
| 2026-10-29 | Bilder komprimeres til 2000 px / JPEG 0,85 i nettleseren; server tillater maks 7 MB | Innenfor Claude API-grensen (10 MB base64) og høyoppløst bildebehandling; rask opplasting på mobilnett |
| 2026-10-29 | Standardmodell `claude-sonnet-5-5`, kan endres i `.env` | God balanse mellom bildeforståelse og kostnad |
| 2026-10-29 | Flere leverandører: Anthropic, OpenAI, Google Gemini og OpenAI-kompatibel (OpenRouter, Ollama, LM Studio) | Brukerne skal kunne bruke nøkkelen de allerede har |
| 2026-10-29 | Én felles instruks og ett felles strengt JSON-skjema for alle leverandører, validert likt i `core.to_facts()` | Samme garanti uansett modell: bare observasjoner, ingen år eller pris |
| 2026-10-29 | Leverandør velges med `VISION_PROVIDER`, ellers automatisk etter hvilken nøkkel som finnes | Minst mulig oppsett for brukeren |
| 2026-10-29 | OpenAI og kompatible bruker Chat Completions med `json_schema` (strict) | Bredest støttet hos de kompatible tjenestene |
| 2026-10-29 | Mobilbruk løses med en ren nettversjon på GitHub Pages (`docs/`), i tillegg til serverversjonen | Brukeren skal bruke appen på telefonen uten installasjon; GitHub Pages er kjent for brukeren og gratis |
| 2026-10-29 | Nettversjonen bruker Gemini med brukerens egen nøkkel, lagret i `localStorage` | Brukeren tester alene i testperioden; ingen server trengs |
| 2026-10-29 | Nøkkelen skal aldri i repoet; skal begrenses til Generative Language API og `*.github.io`-adressen | En Pages-side er offentlig; begrensning gjør en lekket nøkkel verdiløs for andre |
| 2026-10-29 | Python er eneste kilde til data, instruks og skjema; `tools/export_data.py` eksporterer til JSON | Hindrer at de to versjonene glir fra hverandre |
| 2026-10-29 | Gemini-kallet bruker `responseJsonSchema`, med ett nytt forsøk med `responseSchema` (OpenAPI) ved avvisning | Full JSON Schema er nyest; reserven gir robusthet hvis API-et ikke godtar den |
| 2026-10-29 | Demomodus er av som standard når en nøkkel er lagret, men kan slås på manuelt | Funnet under testing: demo ble stående på etter lagring av nøkkel |
| 2026-10-29 | Offentlig repo `danjoakim/antikk-info` | GitHub Free krever offentlig repo for Pages; repoet har ingen hemmeligheter, og Pages-siden ville uansett vært offentlig |
| 2026-10-29 | Standardmodeller: `gpt-6-astra` (OpenAIs anbefalte), `gemini-3.8-flash` (Googles anbefalte stabile Flash) | Hentet fra leverandørenes modelloversikter 29.10.2026; overstyres med `VISION_MODEL` |

---

## Åpne spørsmål

1. **Verksnummer eller kassenummer for eldre Omega?** En forumkilde hevder kassenummer gjelder fram til slutten av 1930-tallet. Må verifiseres før seed-data regnes som pålitelige. Skjemaet støtter begge (`number_type`).
2. **Omega «Extract from the Archives»** er ifølge Omega Forums avviklet i 2023. Bekreft hos Omega.
3. **Demodata** for serienumre, stempler og priser må verifiseres mot minst to kilder før `is_demo` settes til 0. Gjelder også de sveitsiske kontrollmerkene (bjørn, tiur, ekorn, Helvetia).
4. **HEIC fra iPhone:** Safari dekoder HEIC og konverterer til JPEG før opplasting, men dette er ikke testet på ekte enhet.
5. **Leverandørkall er ikke kjørt live.** Koden følger leverandørenes dokumentasjon, men første ekte kall per leverandør kan avdekke detaljer (f.eks. skjemastøtte i Gemini eller lokale modeller).

---

## Øktlogg

### 2026-10-29 – Økt 5: Publisert til GitHub
**Gjort:** Hele prosjektet lagt i `danjoakim/antikk-info` som første commit (59 filer). Sjekket at verken `.env`, nøkler eller databasefiler er med. Claude GitHub App installert av brukeren for å gi skrivetilgang.

**Filer:** Alle (første commit), `LOGG.md`.
**Tester:** Uendret siden økt 4 (Python 37, JavaScript 14).
**Neste:** Brukeren skrur på Pages; deretter første ekte test med Gemini-nøkkel på telefonen via https://danjoakim.github.io/antikk-info/.

### 2026-10-29 – Økt 4: Nettversjon for mobil (GitHub Pages + Gemini)
**Bakgrunn:** Brukeren skal bruke appen på mobilen og kan ikke installere Python der. Valgte GitHub Pages (kjent fra før) med egen Gemini-nøkkel i testperioden.

**Gjort:**
- `tools/export_data.py` eksporterer oppslagstabellene og vision-kontrakten (instruks, skjema, demoeksempler) til `docs/data/`.
- Normalisering, datering og verdivurdering portet til ES-moduler uten byggesteg.
- `docs/js/vision.js`: Gemini REST-kall med bildene merket og skjemaet låst, reserveskjema, norske feilmeldinger (ugyldig nøkkel, avvist nøkkel, utgått modell, kvote, nedetid), test av nøkkel uten bilder.
- Innstillingsskjerm med nøkkel, modell, demobryter, test og sletting. Startsiden viser hvilken analyse som brukes.
- Relative stier, så appen virker i en undermappe som `brukernavn.github.io/repo/`. `.nojekyll` lagt til.
- README: oppsett av Pages, nøkkelbegrensning og oppdatering av data.

**Filer:** `tools/export_data.py`, `docs/{index.html,styles.css,manifest.webmanifest,.nojekyll,icon*}`, `docs/js/{app,normalize,dating,valuation,vision,settings}.js`, `docs/data/*.json`, `tests_web/{core,vision}.test.mjs`, `README.md`, `LOGG.md`.

**Tester:** Python 37 bestått. JavaScript 14 bestått, med samme forventninger som Python-testene. Hele nettversjonen kjørt i mobilnettleser under en undermappe som på GitHub Pages: demoflyt, innstillinger (test og lagring av nøkkel, varighet etter omlasting) og live-flyt der Gemini-svaret ble simulert. Ingen JavaScript-feil. Én feil funnet og rettet (demomodus ble stående på etter lagring av nøkkel).

**Ikke testet:** Ekte kall mot Gemini, ekte telefon og kamera.

**Neste:** Få reponavn fra brukeren, legge koden der, skru på Pages, deretter første test med ekte nøkkel.

### 2026-10-29 – Økt 3: Flere leverandører for bildeanalyse
**Gjort:**
- `vision.py` delt opp i pakken `app/services/vision/`: `core.py` (felles instruks, strengt skjema, validering), `mock.py`, og `providers/` med `anthropic.py`, `openai.py` (også OpenAI-kompatible) og `gemini.py`.
- Konfigurasjon: `VISION_PROVIDER`, nøkler per leverandør, `OPENAI_BASE_URL` for kompatible tjenester, standardmodell per leverandør, automatisk valg etter hvilken nøkkel som finnes.
- `/api/meta` oppgir leverandør og modell; startsiden viser hvilken bildeanalyse som er i bruk.
- `requirements.txt`, `.env.example` og README oppdatert med oppsett for hver leverandør.

**Filer:** `app/config.py`, `app/services/vision/{__init__,core,mock}.py`, `app/services/vision/providers/{anthropic,openai,gemini}.py` (nye), `app/services/vision.py` (fjernet), `app/routes/analyze.py`, `app/static/{index.html,app.js}`, `tests/test_vision.py`, `requirements.txt`, `.env.example`, `README.md`, `LOGG.md`.

**Tester:** 37 bestått (10 nye: leverandørvalg, strengt skjema, meldingsoppbygging og svartolking for hver leverandør). API-testene hoppes fortsatt over her fordi FastAPI mangler i byggemiljøet. Nettleserflyten kjørt på nytt uten feil.

**Ikke testet:** Ekte kall mot noen av leverandørene.

**Neste:** Live-test med den nøkkelen brukeren har, deretter sammenligning av leverandører.

### 2026-10-29 – Økt 2: Bygget MVP-en (del 1 og 2)
**Gjort:**
- Database: skjema med `serial_ranges`, `hallmarks`, `auction_results`; seed med 5 Omega-intervaller (1895–1922), 14 stempelregler og 30 fiktive salg. Opprettes automatisk ved oppstart, uten duplisering.
- Normalisering: rensing av serienumre (prefiks, skilletegn, OCR-forvekslinger som O→0 og l→1 med advarsel), merkegjenkjenning (også fra urskivetekst), materiale fra stempler med konfliktvarsel.
- Datering: oppslag på verksnummer, deretter kassenummer; tydelige statuser for manglende nummer, usignert/ukjent merke og nummer utenfor tabell.
- Verdivurdering: min/median/maks over fire nivåer (merke+materiale+gangtype → … → merke), minimum 5 salg, forbehold og liste over sammenlignbare salg.
- Vision: systemprompt og verktøyskjema uten år/pris-felt, tvunget verktøykall, merkede bilder før tekst, feilhåndtering. Tre mock-scenarier.
- API: `/api/meta`, `/api/analyze` (filtype-, størrelses- og antallsgrense), `/api/lookup`, `/api/health`.
- Frontend: startside med demovelger, tre veiledede bildesteg med valgfritt nærbilde og «hopp over», komprimering og EXIF-retting, bekreftelsesskjema med sikkerhetsmerker, advarsler og «ta på nytt»-lenke, resultatkort med prisstolpe og salgsliste. Lys og mørk modus, PWA-manifest og ikoner.
- README og `.env.example`.

**Filer:** `app/config.py`, `app/main.py`, `app/models.py`, `app/db/{database.py,schema.sql,seed.sql}`, `app/services/{normalize,dating,valuation,vision}.py`, `app/routes/analyze.py`, `app/static/{index.html,styles.css,app.js,manifest.webmanifest,icon.svg,icon-192.png,icon-512.png}`, `tests/{conftest,test_core,test_vision,test_api}.py`, `requirements.txt`, `.env.example`, `.gitignore`, `README.md`, `LOGG.md`.

**Tester:** 27 bestått. `tests/test_api.py` (6 tester) ble hoppet over fordi FastAPI ikke kunne installeres i byggemiljøet (pakkeregisteret var blokkert). Hele flyten ble i stedet kjørt i en hodeløs mobilnettleser mot de samme tjenestene og statiske filene: begge demoscenariene ga riktig resultat uten JavaScript-feil. To feil ble funnet og rettet (skjulte elementer som likevel vistes, og årstall som brøt linjen).

**Ikke testet:** FastAPI-rutelaget, live-kall mot Claude API, ekte telefon og kamera.

**Neste:** Kjør `pip install -r requirements.txt && pytest` lokalt, deretter første live-test med ekte bilder.

### 2026-10-29 – Økt 1: Planlegging
**Gjort:**
- Arkitektur fastsatt (se beslutninger).
- Mobiltilpasning lagt inn i planen.
- Kartlagt datakilder: produsentarkiver, publiserte serienummertabeller (Bob's Watches, Fratello, watchspace.co.uk), Pocket Watch Database (amerikanske merker), Mikrolisk (varemerker), Barnebys og nordiske auksjonshus (realiserte priser).
- Avklart at Ashland-katalogen ikke er tilgjengelig.
- Loggsystem opprettet (denne filen).

**Filer:** `LOGG.md` (ny)
**Tester:** –
**Neste:** Del 1 – kjerne uten API-nøkkel.
