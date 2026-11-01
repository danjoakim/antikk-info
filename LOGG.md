# Prosjektlogg – InformAntikk (MVP)

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
- [x] Fire bildesteg i åpningsrekkefølge (urskive → ytre lokk → cuvette → urverk) og illustrert veiledning
- [x] «Om navnet»: tabell `makers` med kort omtale, tolkning merket som tolkning, forklaring av nummeret og kilder
- [x] Fri bildeopplasting: legg inn det du har, modellen avgjør hva hvert bilde viser, appen foreslår høyst to bilder som vil hjelpe
- [x] Lært av ekte ur (G. Monard): nummer og merker med plassering, oppstrekk, verktype, reparasjons- og eiermerker, grov periode, ukjente navn mot usignerte, HEIC

### Neste
- [ ] Kjøre `pytest` lokalt med FastAPI installert (API-testene ble hoppet over i sandkassen)
- [ ] Første live-test med ekte bilder og API-nøkkel; justere systemprompten etter resultatene
- [ ] Sammenligne leverandørene på de samme bildene (lesing av serienumre og stempler)
- [ ] Teste på ekte telefon via HTTPS-tunnel (iPhone/HEIC og Android)
- [ ] Verifisere Omega-tabellen og avklare verks- vs. kassenummer (åpent spørsmål 1)
- [ ] Erstatte fiktive salg med kuraterte, lenkede salg
- [ ] Bygge ut `makers` med flere navn, og verifisere Monard-oppføringen (f.eks. Pritchard: *Swiss Timepiece Makers 1775–1975*)
- [ ] Samle observasjoner av merke + nummer + kjennetegn fra ekte ur; med nok punkter kan de bli en grov nummertabell
- [ ] Verifisere periodereglene (`period_rules`) mot faglitteratur
- [ ] Legge til salgsdata for nøkkeloppstrekk vs. kroneoppstrekk (påvirker prisen)

### Prioritert rekkefølge (avtalt 01.11.2026)
1. [x] Søkeknapper etter solgte på Auctionet, Barnebys og eBay fra resultatsiden (enkelt, gratis, gjelder alle kategorier)
2. [ ] Frontlokk (savonnette) i skjemaet
3. [ ] Neste kategori etter lommeur (porselen/keramikk eller sølv – brukeren velger)
4. [ ] Felles salgsdatabase med godkjenningskø (Supabase). Nettsøket via Gemini er bygget (økt 19)

### Parkerte idéer (ikke start før det over er ferdig)
- Samlinger («Mine funn») med lagrede analyser, som i Curio
- Skannefunksjon: smart søker med skarphetsmåler, gjenskinnsvarsel og automatisk avtrykk (nivå 1); levende guide med Gemini Live API (nivå 2). Usikker gevinst: bilder fra videostrøm er dårligere enn stillbilder til å lese små stempler.
- Lignende bilder fra nettet (Google Cloud Vision Web Detection)
- Henvisning til urmaker/auksjonshus for verdifulle funn
- Nøkkel på server og betaling per analyse
- Serienummertabell for Vacheron Constantin (kildene er motstridende over 400 000)

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
| 2026-10-29 | Fire bildesteg i samme rekkefølge som uret åpnes: urskive, ytre baklokk, cuvette, urverk | Brukerens innspill: lommeur har som regel to lokk bak, og stempler og nummer kan sitte på begge |
| 2026-10-29 | Stempler fra cuvetten merkes «Cuvette: …»; metallmerke på cuvetten avgjør ikke kassematerialet | «Cuvette Métal» betyr at bare det indre lokket er av metall. Edelmetallstempel på cuvetten teller fortsatt |
| 2026-10-29 | Veiledning i appen («Slik åpner du et lommeur») fra startsiden og fra hvert bildesteg | Brukeren trenger opplæring; feil åpning kan skade uret og senke verdien |
| 2026-10-29 | Modellen rapporterer hvert nummer og merke med plassering og type; reglene avgjør hva de betyr | Monard-uret hadde kassenummeret tre steder og ingenting på verket; faste felt for «verksnummer» og «kassenummer» ville tolket det feil |
| 2026-10-29 | Innrissede nummer og nummer med bokstaver brukes aldri som serienummer | Urmakere risset inn reparasjonskoder (f.eks. «K9341») som lett forveksles med serienumre |
| 2026-10-29 | Eiergravering og kassemakermerker teller ikke for materialet | Monogrammer og initialer sier ingenting om metallet |
| 2026-10-29 | Grov periode fra kjennetegn (oppstrekk, gang, verktype) via tabellen `period_rules`, vist som intervall | Gir nyttig alder uten serienummertabell, uten at modellen gjetter årstall |
| 2026-10-29 | Navn som ikke er i merkelisten, sammenlignes med usignerte ur, med merknad; kjente merker bare med seg selv | Forhandler- og fabrikantnavn som «G. Monard, Genève» ga ellers ingen pris |
| 2026-10-29 | Ekte ur lagres som tekstlig fasit (`app/services/vision/examples/`), ikke som bilder | Repoet er offentlig, og bildene viser personlige graveringer |
| 2026-10-29 | HEIC som nettleseren ikke kan lese, sendes uendret til Gemini | Gemini leser HEIC; iPhone-bilder skal fungere uten omvei |
| 2026-10-29 | Fri bildeopplasting i stedet for faste steg; modellen klassifiserer hvert bilde (`photos[].shows`) | Brukerens prinsipp: det finnes mange måter å identifisere et ur på, og ikke alle trengs. Ett godt bilde kan være nok |
| 2026-10-29 | Forslag til neste bilde regnes ut med regler (`suggest.py` / `suggest.js`) ut fra hva som mangler og hva som er fotografert; høyst to forslag, ingen når det holder | Appen skal ikke presse fram svar på alt, men si ærlig hva som ville hjulpet |
| 2026-10-29 | Produsentkunnskap i egen tabell (`makers`) med kilder; tolkning i egen kolonne og merket «Ikke verifisert» | Brukeren vil ha bakgrunn om navnet; det som ikke er dokumentert, skal ikke se ut som fakta |
| 2026-10-29 | Leverandørnavnet vises bare i innstillingene, ikke i flyten eller feilmeldingene | Brukeren: hvilken modell som gjør jobben, betyr lite for den som bruker appen |
| 2026-10-29 | Appen het først **InformAntique** | Brukerens valg: en app som gir informasjon om antikviteter, f.eks. på loppemarked. Lommeur er første kategori |
| 2026-10-29 | Appen heter **InformAntikk** | Appen skal være norsk. Nettsøk fant ingen andre med navnet |
| 2026-10-29 | Gjennomført viktoriansk steampunk-stil i hele appen | Brukerens ønske. Uttrykk: urmakerverksted i 1890-årene – hovedbokpapir, valnøtt, messing, verdigris og oksblod; IM Fell English til overskrifter, Libre Caslon Text til brødtekst; knapper som graverte messingplater med nagler, kort som etiketter i et kuriositetskabinett. Tall med jevnhøye sifre for lesbarhet |
| 2026-10-29 | Lagringsnøkkelen i nettleseren (`lommeur.settings.v1`) beholdes | Endring ville slettet brukerens lagrede nøkkel |
| 2026-10-31 | Merkekunnskapen ligger i `app/data/makers.json` (79 navn med navnevarianter, land, grunnlagt, nivå og kort omtale) | Appen kjente ikke Vacheron Constantin. Én fil deles av begge versjoner |
| 2026-10-31 | Ukjente navn prises aldri som usignerte; bare nivåene «handelsnavn» og «rimelig masseproduksjon» sammenlignes med usignerte ur | Et Vacheron Constantin ble ellers priset mot billige sylinderur |
| 2026-10-31 | Produsentnavn et annet sted på uret slår en forhandlersignatur på skiven; forhandleren vises som «Solgt av» | Norske forhandlere (Tostrup, David-Andersen) signerte sveitsiske ur |
| 2026-10-31 | Navn som ikke står i listen, slås opp i Wikipedia (norsk, så engelsk) fra nettleseren, med krav om at treffet handler om ur og at navnet står i tittelen | Gir nyttig omtale uten å skrape nettsider; Wikipedia har åpen lisens og et API for dette |
| 2026-10-31 | Merker i fremste klasse får råd om å få uret vurdert og advarsel om forfalskninger | Høy verdi og mange forfalskede signaturer på eldre ur |
| 2026-10-31 | Knappen «Lagre bildene på telefonen» deler originalbildene via delingsarket (Web Share), med nedlasting som reserve | iOS lagrer ikke bilder tatt med kameraet fra en nettside i Bilder-appen; brukeren mistet bildene av et testet ur |
| 2026-11-01 | InformAntikk er for alt man finner på loppis og i antikk- og bruktbutikker. Lommeur er første kategori, ikke hele appen | Brukerens presisering. Nye løsninger (felles salgsdatabase, nettsøk etter salg, lignende bilder) bygges generelt, ikke for ur |
| 2026-11-01 | Vi tar det beste fra de andre appene: rask bildeflyt og samlinger (Curio), salgsdata med kilde (WorthPoint, Barnebys, AntiqBot), lignende bilder (Google Lens), fagperson ved verdifulle funn (Mearto, ValueMyStuff), betaling per analyse (AntiqBot). Det vi beholder selv: år og pris bare fra tabeller og lenkede salg | Brukerens strategi. Ærlighet om kilder er det som skiller oss fra konkurrentene |
| 2026-11-01 | Gemini-nøkkelen er betalt (fakturering på) | Brukerens opplysning. Gratisnivåets køer er ikke årsak til ventetid, og nettsøk via Gemini kan brukes uten ekstra oppsett |
| 2026-11-01 | Tenkenivå «low» for Gemini 3-modellene, med nytt forsøk uten hvis modellen avviser det | Analysen ble treg; standardnivået er «medium»/«high». Avlesning av bilder trenger lite resonnering |
| 2026-11-01 | Priser og bakgrunn fra nettet hentes inne i appen med Gemini og Google-søk; et salg eller en fakta vises bare når domenet finnes blant kildene Google returnerte, og alt merkes «ikke kontrollert» | Lenker ut fjernet poenget med appen (brukeren). Slik gjør de andre appene det inne i appen, men vi gjetter ikke og krever kilde |
| 2026-11-01 | Omregning til kroner med DNBs snittkurser 2026 (`app/data/fx_nok.json`); originalbeløpet vises alltid | Salg kommer i CHF, GBP, EUR, SEK osv. |
| 2026-11-01 | Bildeanalysen er generell: kategori (14 stk.), gjenstandstype, beskrivelse, materialer, stiltrekk og merker (fabrikkmerke, signatur, etikett) med generelle plasseringer. Urfeltene brukes bare for lommeur og armbåndsur | Brukeren: appen skal bygges for alle som går på loppis, ikke etter det som ligger på bordet. Ur er én kategori med ekstra felt og tabeller |
| 2026-11-01 | For kategorier uten egne tabeller sier appen ærlig at den ikke har dateringstabeller eller egne salg, og viser i stedet nettsøket med kilder. Nettsøket kan gi årene et merke eller stempel var i bruk når kilden sier det | Ingen gjetting, men nyttig innhold for alle kategorier |
| 2026-11-01 | Norsk sølvstandard 830 lagt til i stempeltabellen | Vanligste lødighet på norsk sølv |
| 2026-11-01 | Ved ekte bruk vises aldri de oppdiktede demosalgene, og egne salg brukes bare for samme kategori | Feil: en PS5-kontroller fikk «350 kr, demo» fra lommeurenes demosalg |
| 2026-11-01 | Nettsøket henter både oppnådde priser («Solgt for») og utsalgspriser i annonser («Til salgs for»), norske kilder først (finn.no, tise, auctionet m.fl.) | For brukte hverdagsting er annonsepriser det folk faktisk trenger; holdes adskilt og merket |
| 2026-11-01 | Ny kategori: Elektronikk, spill og media | Brukerens test med PS5-kontroller |
| 2026-11-01 | Maskoten er en lisensiert stockillustrasjon av en skjære (brukeren har kjøpt lisens). Brukes som maskot i appen, ikke som logo | Egne tegninger i kode ble for geometriske, og bildegenerering bommet på arten. Stocklisenser tillater normalt ikke bruk som logo/varemerke |
| 2026-11-01 | Appen heter **Funn** | Brukerens valg. Kort og norsk, og passer til flyten: du gjør et funn, skjæra samler funnene i reiret. Ingen varemerkeregistrering nå |
| 2026-11-01 | Ny skjære fra Kuraplan erstatter stockskjæra, som ikke ble godkjent for bruken. Creative Commons-lisens uten krav om kreditering (ifølge brukeren), så merket trenger ikke være med | Brukerens nye fil |
| 2026-11-01 | Skjæra har monokkel og tversoversløyfe og sitter i en loppiskasse (kaffekoppen er droppet) | Rekvisitter gir personlighet uten å tegne om fuglen; kassa skjuler klørne og knytter skjæra til loppis |
| 2026-10-29 | Standardmodeller: `gpt-6-astra` (OpenAIs anbefalte), `gemini-3.8-flash` (Googles anbefalte stabile Flash) | Hentet fra leverandørenes modelloversikter 29.10.2026; overstyres med `VISION_MODEL` |

---

## Åpne spørsmål

1. **Verksnummer eller kassenummer for eldre Omega?** En forumkilde hevder kassenummer gjelder fram til slutten av 1930-tallet. Må verifiseres før seed-data regnes som pålitelige. Skjemaet støtter begge (`number_type`).
2. **Omega «Extract from the Archives»** er ifølge Omega Forums avviklet i 2023. Bekreft hos Omega.
3. **Demodata** for serienumre, stempler og priser må verifiseres mot minst to kilder før `is_demo` settes til 0. Gjelder også de sveitsiske kontrollmerkene (bjørn, tiur, ekorn, Helvetia).
4. **HEIC fra iPhone:** Safari dekoder HEIC og konverterer til JPEG før opplasting, men dette er ikke testet på ekte enhet.
6. **Monard-uret – kontrollmerke:** Gemini meldte en tiur i én av to kjøringer (sveitsisk kontrollmerke for 0.800). Et innslått merke i ramme finnes ved kassenummeret i lokket og i cuvetten, men figuren er ikke lesbar i bildene. Avklares med lupe. Bekreftet tiur ville gitt periode fra 1880-tallet.
9. **Vacheron-uret:** Siste siffer i kassenummeret (233243 eller 233245) og teksten på balansebroen er ikke lest sikkert. Ikke avgjørende for dateringen, som går på verksnummeret.
7. **Monard-uret – G.S og monogram:** «G.S» ved 0.800 i lokk og cuvette er trolig kassemakerens punselmerke (slås opp i Mikrolisk / registre over kassemakere). Bokstavene i det graverte monogrammet er ikke lest sikkert; kan være eier, giver eller unntaksvis produsent.
5. **Leverandørkall er ikke kjørt live.** Koden følger leverandørenes dokumentasjon, men første ekte kall per leverandør kan avdekke detaljer (f.eks. skjemastøtte i Gemini eller lokale modeller).
8. **Navn:** Avgjort: Funn (fra 01.11.2026, tidligere InformAntikk). Varemerke er ikke aktuelt nå.

---

## Øktlogg

### 2026-11-01 – Økt 22: Nytt utseende bygget inn – appen heter nå Funn
**Gjort (nettversjonen i `docs/`):**
- Hele appen i loppislapp-stilen fra designlerretet (Courier Prime + Permanent Marker, teip, neonrosa, harde skygger), bare lyst tema.
- Navnet er Funn overalt: tittel, hjemskjermnavn, manifest, filnavn på lagrede bilder. Nye app-ikoner med skjærehodet (monokkel og sløyfe) på rosa.
- Skjæra i loppiskassa (`docs/img/skjaere.png`, lisensnotat i `docs/img/LISENS.md`) på start, bilder, venting, stemmer dette?, resultat og fant ingenting. «LOPPIS» er tekst, så det får tusjfonten.
- Start: «TA BILDE» åpner kameraet direkte, «eller velg fra bildene dine» åpner bildene; appen går rett til bildeskjermen. Toppfeltet er borte; «meny» leder til innstillingene.
- Bilder: rutenett med teip, «+ ett til»-rute, teller «n av 8 bilder», skjæra gir tips i en snakkeboble (eller forslagene fra analysen).
- Venting: skjæra vipper i kassa, sjekkliste krysses av, «avbryt» stopper analysen og går tilbake til bildene. Steampunk-lommeuret er fjernet.
- Resultat: bilde, navn, prislapp-klistremerke på skjæra og en snakkeboble som oppsummerer prisene. Finnes verken nettpriser eller egne salg, vises «Hm. Denne vet jeg ikke.» med tips og diagnoselinjen.
- **Fjernet:** kortet med ferdige søk på andre nettsteder («Se hva lignende er solgt for»). Prisene skal finnes i appen.
- Alderskortet skjules for kategorier uten dateringstabeller.
**Tester:** 33 JS-tester og 62 Python-tester bestått (1 hoppet over). Gjennomkjørt i hodeløs mobilnettleser: ekte modus med simulert Gemini (priser funnet og ingen priser), demomodus (Omega med salg, porselen uten), avbryt under analyse. Ingen JavaScript-feil.
**Ikke gjort ennå:** «Dine funn» (lagre funnet og samlingen) og «LAGRE FUNNET»-knappen; serverversjonen (`app/static`) har fortsatt det gamle utseendet; lisensnavn og lenke for skjæra mangler i `LISENS.md`.

### 2026-11-01 – Ny skjære: den forrige var ikke godkjent
**Bakgrunn:** Lisensen på den forrige stockskjæra ble ikke godkjent for denne bruken. Brukeren har fått en ny skjære (laget på Kuraplan, svart-hvit, sitter på grein, ser mot venstre).
**Gjort:** Hvit bakgrunn fjernet, greina skjult, og samme monokkel, tversoversløyfe og loppiskasse lagt på. Byttet inn i alle sju H-skjermene (`skjaere2_kasse.png`, 852×933). Spørsmålstegnet i «Fant ingenting» er flyttet fordi skjæra nå ser andre veien. Alle fire bildefiler med den gamle skjæra er slettet fra designlerretet.
**Avklart:** Teksten «Made on kuraplan.com» kan fjernes. Ifølge brukeren ligger bildet under en Creative Commons-lisens som ikke krever kreditering. Lagre lisensnavn og lenke sammen med bildefilen når den legges i repoet.

### 2026-11-01 – Skjæra får monokkel og flytter i loppiskasse
**Gjort:** Rekvisitter tegnet som eget lag oppå den lisensierte skjæra: monokkel med gullkjede og tversoversløyfe i neonrosa. Selve skjærefilen er uendret. Prøvd også lesebriller og lupe; brukeren valgte monokkel.
**Koppen fjernet:** Klørne på koppkanten så feil ut. Skjæra sitter nå i en pappeske med «LOPPIS» skrevet med tusj, slik at føttene skjules. Samlet bilde: `skjaere_kasse.png` (760×900, gjennomsiktig); ordet «LOPPIS» ligger som tekst i skjermene, så det får tusjfonten. Byttet inn i alle sju H-skjermene på designlerretet.
**Kjent:** Et lite stykke av beina synes over kassekanten.

### 2026-11-01 – Designflyten med skjæra, og nytt navn: Funn
**Gjort på designlerretet (side «Skjæra – hele flyten»):** sju skjermer i rekkefølge: start, bilder, analyse, stemmer dette?, resultat, fant ingenting, reiret. Lerretet delt i to sider (flyten og tidligere utkast A–G).
**Tekstendringer etter brukeren:** startskjermen: «Har du funnet noe du liker? Vis meg det!» (snu-meldingen fjernet); bildeskjermen: «Hele funnet, forfra». Ordet «funn» brukes gjennom appen.
**Avgjort:** Appen heter **Funn**. Navnet er byttet i designet; selve appen får nytt navn når designet bygges inn.
**Foreslått, ikke gjort:** bildetipset tilpasses det appen ser (stempel for porselen og sølv, logo eller tekst under bunnen for plast, signatur for kunst).

### 2026-11-01 – Skjæra på kaffekoppen
**Gjort:** Greinen fjernet fra den lisensierte skjæra; ny kaffekopp tegnet i samme illustrerte stil (kontur, skygge, gullkant, håndmalte blå blomster, kaffe, skål) og satt sammen til `skjaere_kopp.png` med gjennomsiktig bakgrunn. Lagt inn i H-skjermene på designlerretet.
**Kjent mangel:** Klørne er ikke helt tilpasset koppkanten. Gjøres om i full kvalitet når originalfilen fra lisensen kommer.
**Forsøk forkastet:** Egentegnede tær som griper koppkanten (brukeren: «ikke talons som fugler har, og proporsjonene er feil»). Første versjon (`skjaere_kopp.png`) beholdes. Lærdom: anatomi tegnes ikke i kode; slike justeringer må gjøres fra originalfilen eller av en illustratør.
**Avtalt:** Skjæra er grunnfiguren; den justeres litt etter hvert (klør, positurer, tilstander).

### 2026-11-01 – Skjæra på plass i designet
**Bakgrunn:** Egne SVG-tegninger av skjæra ble «en samling geometriske figurer», og bildegenerering tegnet andre fugler. Brukeren kjøpte lisens på en stockillustrasjon av en skjære.
**Gjort:** Skjæra frilagt fra bildet brukeren sendte (hvit bakgrunn fjernet) og lagt inn i designlerretet, rad H: start (snakkeboble og gullring i nebbet), resultat (neonprislapp ved nebbet, prisene i snakkeboble), «fant ingenting» (speilvendt og skakk med spørsmålstegn).
**Venter på:** Originalfilen fra nedlastingen (SVG/EPS eller stor PNG) for skarp gjengivelse. Brukeren velger stil (D, E eller H) før den bygges inn i appen.

### 2026-11-01 – Nytt utseende: auksjonskatalog, loppislapp og skjæra
**Bakgrunn:** Brukeren: A–C er ok, men font og stil virker AI-laget. Ønsket en maskot som følger prosessen; valgte skjære.
**Gjort på designlerretet:** D Auksjonskatalog (Spectral + Archivo Narrow, skarpe hjørner, linjer, lotnummer, rødt blekk). E Loppislapp (Courier Prime + Permanent Marker, teip, neonklistremerke, harde skygger). F Skjæra i E-stilen: figurark med fire tilstander (hei, leser stempelet, har prisen, vet ikke), og skjermene start, analyse (hakkeanimasjon som venter, med sjekkliste), resultat (skjæra kommer med neonlappen, prisen i en snakkeboble), «fant ingenting» (trekker på skuldrene, gjetter ikke, foreslår neste bilde) og «Reiret» (samlingen av funn).
**Regler for skjæra:** tusjstrek, aldri glatt 3D; bare i de små øyeblikkene; sier aldri en pris selv, henter bare lappen med kilde.
**Neste:** Brukeren velger; så bygges valgt stil inn i nettversjonen. «Reiret» (samlinger) er en ny funksjon og står fortsatt som parkert idé.

### 2026-11-01 – Forslag til nytt utseende
**Bakgrunn:** Brukeren: steampunk-stilen er utdatert med alt det nye.
**Gjort:** Tre retninger på et designlerret (claude.ai-artefakt «InformAntikk – nytt utseende»), hver med start- og resultatskjerm i mobilformat: A Loppisfunn (lyst og rolig, grønn aksent, Manrope), B Prislapp (kraftpapir og etikett, IBM Plex Mono/Sans, rust), C Kamera først (mørkt, søker med siktemerker, gul aksent). Alle har prisen øverst på resultatet, med «Til salgs for» og «Solgt for» adskilt, og lenkede enkeltpriser.
**Neste:** Brukeren velger retning; deretter bygges den inn i nettversjonen.

### 2026-11-01 – Økt 21: Priser for alt, og feilen med demopriser
**Bakgrunn:** Brukeren testet en PS5-kontroller: appen viste «spillkontroller» og «350 kr i demo», og ingen priser fra nettet. «Jeg forstår ikke hvordan dette skal hjelpe folk på loppemarked.»
**Årsaker:**
- Nettversjonen kalte prisberegningen uten kategori, så alle ting ble sammenlignet med lommeurenes oppdiktede demosalg.
- Nettsøket lette bare etter auksjonstilslag, krevde at prisen var et rent tall, og godtok bare kilder der Google-tittelen var et domenenavn. Trolig ble alt forkastet.
**Gjort:**
- Egne salg bare for samme kategori; demosalg aldri ved ekte bruk; tomt «Markedsverdi»-kort skjules når nettsøket er priskortet.
- Nettsøket ber om «sold» og «listed» priser, norske kilder først, og viser to intervaller: «Solgt for» og «Til salgs for (utsalgspris)».
- Priser leses i mange formater («kr 1 200», «1.200,-», «39,99»). Kilden godtas også når nettstedets navn (f.eks. «finn», «ebay») står i en kildetittel fra Google.
- Når ingenting vises, sier kortet hvorfor: antall kilder fra Google, antall foreslåtte priser, hvor mange som manglet pris eller kilde, og om svaret hadde feil format.
- Ny kategori «Elektronikk, spill og media». «Hva er det?» tar med modellnavn når det står på tingen eller formen er umiskjennelig (f.eks. «PS5-kontroller (DualSense)»).
- Installert jadx 1.5.1 og apktool 2.10.0 i arbeidsområdet (reverse engineering-tillegget); mitmproxy og androguard lot seg ikke installere (pakkeregisteret svarte ikke).
**Tester:** JavaScript 33, Python 62 bestått. Mobilnettleser med simulert svar for PS5-kontroller: kategori elektronikk, «Til salgs for 400–500 kr», ett solgt på eBay (ca. 360 kr), bakgrunn med kilde, ingen demopris.
**Ikke testet:** Ekte Google-søk (kan ikke nås herfra). Diagnoselinjen gjør at en skjermdump viser hvor det stopper.

### 2026-11-01 – Økt 20: Appen tar imot alle slags gjenstander
**Bakgrunn:** Brukeren: «Du må bygge for andre enn bare meg.» Analysen, skjemaet og søket var bygget for lommeur.
**Gjort:**
- Instruks og skjema: kategori, gjenstandstype, beskrivelse, materialer, stiltrekk; nye plasseringer (forsiden, baksiden, undersiden, innsiden, lokket, siden, hank/skaft, etikett) og merketyper (fabrikkmerke, signatur, etikett). Urreglene gjelder bare ur.
- Normalisering: tall på andre ting vises som modell-/dekornummer, ikke serienummer. Navn kan hentes fra fabrikkmerke, signatur og etikett.
- Datering og egne priser bare for ur; andre kategorier får en ærlig melding og nettsøket.
- Bildeforslag for andre ting: undersiden og baksiden når ingen merker er funnet.
- «Stemmer dette?»: kategori, «Hva er det?», produsent/merke/signatur, materialer; urfeltene skjules for andre kategorier, edelt metall vises for sølv, smykker og ur.
- Nettsøk og søkelenker bruker kategori, gjenstandstype, beskrivelse og materialer. Wikipedia-oppslaget krever ord som passer kategorien.
- Ny tekst på start- og bildeskjermen («Hva er det du har funnet?»); veiledningen for lommeur er en lenke for dem som trenger den.
- Demoeksempler: kaffekanne i porselen og spiseskje i 830-sølv (oppdiktede, merket som eksempler). Sølv 830 i stempeltabellen.
**Filer:** `app/models.py`, `app/services/vision/core.py`, `app/services/vision/mock.py`, eksempelfilene, `app/services/{normalize,dating,valuation,suggest,salesearch}.py`, `app/db/seed.sql`, `app/data/sale_search.json`, `docs/js/{normalize,dating,suggest,vision,websales,salesearch,app}.js`, `docs/index.html`, `docs/manifest.webmanifest`, tester.
**Tester:** Python 62, JavaScript 31 bestått. Mobilnettleser: porselensflyt (urfelter skjult, fabrikkmerke og nummer funnet, alder- og verdikort med forklaring, nettsøk og lenker med «porslin/porcelain Porsgrund») og Vacheron-flyten uendret.
**Ikke gjort:** Serverversjonens skjermbilder (`app/static`) er ikke lagt om; den bruker fortsatt urskjemaet i brukerflaten, mens API-et er generelt.

### 2026-11-01 – Økt 19: Funnet på nettet nå (priser og bakgrunn i appen)
**Bakgrunn:** Brukeren: lite å se når klokka søkes opp, og lenker ut fjerner poenget med appen.
**Gjort:** Etter «Stemmer dette?» viser resultatsiden et nytt kort, «Funnet på nettet nå». Appen sender en beskrivelse bygget bare av bekreftede fakta (merke, materiale, gang, oppstrekk, periode, nummer, stempler) til Gemini med Google-søk (`tools: google_search`, tenkenivå lavt). Svaret tolkes slik:
- Salg tas med bare når de har pris over null, og når nettstedet finnes blant kildene Google returnerte (`groundingChunks`). Resten forkastes og telles («N treff uten bekreftet kilde ble utelatt»).
- Pris i original valuta pluss ca. kroner (DNB-snitt 2026). Minst tre salg med pris gir intervall og median.
- Sortert «samme modell», «samme merke», «lignende»; tilslag eller inkl. salær vises.
- Bakgrunn: inntil fire korte fakta, hver med kilde. Modellen får ikke oppgi produksjonsår for tingen.
- Googles søkeforslag vises i en isolert ramme.
Søkelenkene ligger igjen nederst som «Se hva lignende er solgt for».
**Filer:** `docs/js/websales.js` (ny), `app/data/fx_nok.json` (ny), `docs/data/fx_nok.json`, `tools/export_data.py`, `docs/js/app.js`, `docs/index.html`, `docs/styles.css`, `tests_web/websales.test.mjs` (ny), `LOGG.md`.
**Tester:** JavaScript 29, Python 59 bestått. Mobilnettleser med simulert Google-svar: tre salg vist og omregnet (13 000–75 000 kr, median 42 000), et oppdiktet salg forkastet, bakgrunn med kilde, søkeforslag vist.
**Ikke testet:** Ekte kall med Google-søk (kan ikke nås herfra). Formatet følger `generateContent` med `google_search`; Googles dokumentasjon viser nå mest det nye Interactions-API-et, så første ekte kjøring må sjekkes. Serverversjonen har ikke nettsøket ennå.
**Lærdom:** `node --check` på en `.js`-fil fanger ikke dobbeltdeklarasjoner i ES-moduler; sjekk som `.mjs`.

### 2026-11-01 – Økt 18: Raskere bildeanalyse
**Bakgrunn:** Brukeren melder at analysen tar veldig lang tid.
**Årsak (sannsynlig):** Appen satte ikke tenkenivå, så Gemini 3 brukte standardnivået («medium»/«high»), som Google sier gir lengst ventetid. Instruksen er lang og bildene mange.
**Gjort:** `thinkingConfig.thinkingLevel = "low"` for modeller som begynner på «gemini-3» (nettversjonen og serverversjonen), med nytt forsøk uten tenkenivå hvis API-et avviser det. Bekreftelsesskjermen viser nå «Analysen tok N s · X bilder · Y MB sendt».
**Filer:** `docs/js/vision.js`, `docs/js/app.js`, `app/static/app.js`, begge `index.html`, `app/services/vision/providers/gemini.py`, `tests_web/vision.test.mjs`, `LOGG.md`.
**Tester:** Python 59, JavaScript 24 bestått. Mobilnettleser: forespørselen inneholder `thinkingLevel: low`, og tiden vises.
**Ikke testet:** Ekte ventetid og om avlesningen er like god med lavt tenkenivå – brukeren tester med Vacheron-uret.

### 2026-11-01 – Økt 17: Se hva lignende er solgt for
**Gjort:** Nytt kort på resultatsiden med ferdige søk etter solgte eksemplarer: Auctionet (avsluttede, tilslag; svenske søkeord), Barnebys (oppnådde priser; bare merkenavnet) og eBay (solgte). Søkeordene lages av bekreftet merke, materiale og gangtype. Ordlistene ligger i `app/data/sale_search.json`, felles for begge versjoner, så nye kategorier bare trenger nye ord. Kortet sier tydelig at prisene der ikke er kontrollert av appen.
**Funn under testing:** Auctionet-adressen `?is=ended&q=` gir avsluttede salg med tilslag (kontrollert i nettleser). Barnebys søker med ELLER mellom ordene, så «pocket watch vacheron constantin gold» ga 86 754 treff med mye irrelevant. Barnebys får derfor bare merkenavnet og utelates for usignerte ting.
**Filer:** `app/data/sale_search.json` (ny), `app/services/salesearch.py` (ny), `docs/js/salesearch.js` (ny), `docs/data/sale_search.json`, `app/models.py` (`SaleSearch`, `LookupResponse.sale_searches`), `app/routes/analyze.py`, `tools/export_data.py`, `docs/js/app.js`, `app/static/app.js`, begge `index.html` og `styles.css`, tester.
**Tester:** Python 59, JavaScript 23 bestått. Mobilnettleser med Vacheron-fasiten: kortet vises med tre riktige lenker, ingen feil.
**Ikke testet:** eBay-lenken i ekte nettleser (adresseformatet er eBays kjente for solgte annonser).

### 2026-10-31 – Research: hvordan andre apper finner priser, informasjon og bilder
- **Store prisdatabaser** (WorthPoint, Barnebys, EveryWatch) har bygget opp millioner av salg over mange år gjennom avtaler med hundrevis av auksjonshus og markedsplasser, med AI og manuell kontroll. WorthPoint koster fra 29,99 dollar i måneden; Barnebys' prisbank er gratis å søke i, men har ikke noe åpent API.
- **De mange «Antique Identifier»-appene** gjenkjenner bildet med AI og gir «AI-anslag» uten navngitte kilder. Det er nettopp den gjetningen InformAntikk skal unngå.
- **Bildesøk:** Google Cloud Vision Web Detection finner like bilder på nett (1 000 gratis per måned, deretter 3,50 dollar per 1 000).
- **eBay:** Marketplace Insights API (solgte objekter) er i begrenset utgivelse; åpent API gir bare aktive annonser.
- **Auctionet** (nordisk, over 80 hus) har et åpent arkiv over solgte objekter med priser.
- **Konklusjon:** Ingen gratis, lovlig kilde gir ferdige pris-API-er. Realistisk vei for oss: manuell kuratering med kilde (brukeren sender lenker), eventuelt lenker ut til prisarkiver (Auctionet, Barnebys) med ferdig søk fra appen, og senere avtale med en datakilde.

### 2026-10-31 – Kartlegging: salgsresultater fra auksjonshus
**Bakgrunn:** Brukeren vil samle informasjon om ur og priser fra auksjonshus.
**Funn om kildene:**
- Viser tilslag åpent: Antiquorum (solgt pris inkl. salær, 25 %), Gardiner Houlgate (tilslag + 26,4 % inkl. mva), Gorringes («Sold for»), Smith & Singer (tilslag og pris inkl. salær).
- Skjuler prisene bak innlogging eller abonnement: Fellows, the-saleroom, Catawiki (avsluttede objekter ble ikke vist), Heritage (ikke vist for dette objektet).
- Norske hus (Blomqvist, Grev Wedels Plass, Christiania) ble ikke funnet med nettsøk; må trolig hentes via brukeren.
- Utbyttet er lavt: om lag to brukbare salg per tre oppslag.
**Kandidatsalg (ikke lagt inn ennå):**
| Hus | Dato | Ur | Pris | Grunnlag |
|---|---|---|---|---|
| Antiquorum | 2022-05-08 | Vacheron Constantin, savonnette 18 k, ca. 1915, verk 412538 | CHF 3 500 | inkl. salær |
| Antiquorum | 2024-11-10 | Vacheron Constantin, åpen 18 k, ca. 1915, verk 374500 | CHF 6 250 | inkl. salær |
| Gorringes | 2025-07-15 | Vacheron & Constantin, åpen 18 k, verk 394139, dårlig stand | GBP 1 000 | «Sold for» |
| Gardiner Houlgate | 2023-10-24 | Omega, sølv 0.800, anker, går ikke | GBP 65 | tilslag |
| Gardiner Houlgate | 2024-10-22 | Omega, sølv 0.800 og forgylt, anker, 1930-årene, god stand | GBP 140 | tilslag |
| Antiquorum | 2020-10-01 | Usignert, sølv 0.800, åpen, ca. 1900, må repareres | CHF 56 | inkl. salær |
**Dateringsfunn:** Antiquorum daterer verk 374500 til ca. 1915 (støtter 1915–1920 for 377144), men også verk 412538 til ca. 1915, mens tabellene setter 410 000 til ca. 1930. Tabellene for Vacheron Constantin er derfor usikre over 400 000.
**Valuta:** Salg må lagres i opprinnelig valuta med kurs; 2024-snitt fra DNBs tabell: GBP 13,74, CHF 12,22, EUR 11,63, USD 10,75 (beregnet snitt av daglige kurser).
**Neste:** Avklare med brukeren hvilke urtyper som skal prioriteres og om hen sender lenker fra norske hus.

### 2026-10-31 – Vacheron & Constantin: fasit fra ekte ur
**Bakgrunn:** Brukeren lastet opp fem bilder av uret som avslørte at appen ikke kjente Vacheron Constantin (testet før økt 15).
**Avlest manuelt:** Savonnette i 18 k gull («0,750» i ramme i begge lokk), kassenummer 233243 i frontlokket og i ytre baklokk (siste siffer 3 eller 5), «V&C» i ramme, «5» og malteserkors i baklokket. Cuvetten er gravert «Vacheron & Constantin», «Chronomètre» og «Genève» med malteserkors. Verket har broer, kroneoppstrekk, signatur «Vacheron & Constantin Genève» og verksnummer 377144. Ankergaffelen er ikke synlig. Prislappen «116…» ved siden av uret er ikke en del av uret.
**Gjort:** Tekstlig fasit `app/services/vision/examples/vacheron_233243.json` og test i `tests/test_core.py`. Med dagens kode blir merket gjenkjent, nummerne skilt riktig (kasse og verk), materialet satt til 18 k gull, det gis ingen pris og vises råd for fremste klasse. Dateringen blir bare «ca. 1860–1940».
**Funn:**
- Skjemaet mangler plassering for **frontlokket** på savonnetter (lokket over skiven). Fasiten bruker «unknown».
- Ingen serienummertabell for Vacheron Constantin. To nettkilder (forumtabell og Ashland-tall gjengitt av pocketwatchrepair.com) plasserer verksnummer 377144 mellom 1915 og 1920. Bonhams daterte verksnummer 330790 til ca. 1913. To andre nettsider oppgir tall som strider mot auksjonsdateringer og er forkastet.
- Innskrifter på verket havner i listen over kassestempler (kosmetisk).
**Tester:** Python 58 bestått.
**Neste (venter på brukeren):** Frontlokk i skjemaet; tabell for Vacheron Constantin med kildene over.

### 2026-10-31 – Økt 16: Lagre bildene på telefonen
**Bakgrunn:** Bilder tatt i appen ble ikke lagret i Bilder på telefonen. iOS lagrer ikke bilder fra en nettsides kamerafelt.
**Gjort:** Lenkeknappen «Lagre bildene på telefonen» på bildeskjermen (vises når det finnes bilder). Den åpner delingsarket med originalfilene (før komprimering, HEIC beholdes), slik at «Arkiver bilder» legger dem i Bilder. Uten deling lastes filene ned én og én. Filnavn: `informantikk-ÅÅÅÅMMDDTTMM-n.jpg`.
**Filer:** `docs/js/app.js`, `docs/index.html`, `app/static/app.js`, `app/static/index.html`, `LOGG.md`.
**Tester:** Mobilnettleser: knappen skjult uten bilder, synlig med to bilder, nedlasting av begge (jpg og heic) uten feil.
**Ikke testet:** Delingsarket på ekte iPhone.
**Alternativ:** Ta bildene med Kamera-appen og bruk «Velg bilder» i appen.

### 2026-10-31 – Økt 15: Appen må kjenne de store merkene
**Bakgrunn:** Brukeren testet flere ur. Appen kjente ikke Vacheron Constantin, og hadde i tillegg sammenlignet ukjente navn med usignerte ur.
**Gjort:**
- `app/data/makers.json`: 79 urmakere og forhandlere (Sveits, Tyskland, USA, Storbritannia, Frankrike, Norden, Russland, Japan) med navnevarianter (f.eks. «Vacheron & Constantin», «Jules Jürgensen», «Paul Buhré»), land og sted, grunnleggelsesår, nivå (fremste klasse, kvalitetsmerke, stor produksjon, masseproduksjon, forhandler, verkprodusent, handelsnavn), kort norsk omtale og Wikipedia-lenke. Monard flyttet hit fra databasen.
- Normalisering bruker listen; lengste navnevariant vinner; bynavn som «Genève» tas bort. Produsent på cuvetten slår forhandler på skiven.
- Pris: kjente merker prises bare mot egne salg; ukjente navn får ingen pris og en forklaring; Roskopf, Ingersoll o.l. og handelsnavn sammenlignes med usignerte.
- «Om navnet»: sted, land, år, nivå, «Solgt av», råd for fremste klasse. Ukjente navn slås opp i Wikipedia med lenke og lisens; uten treff pekes det til Mikrolisk.
**Filer:** `app/data/makers.json` (ny), `app/services/{makers,normalize,valuation}.py`, `app/models.py`, `app/routes/analyze.py`, `app/db/{schema,seed,database}`, `tools/export_data.py`, `docs/data/makers.json`, `docs/js/{normalize,valuation,app}.js`, `app/static/app.js`, `tests/test_core.py`, `tests_web/core.test.mjs`, `README.md`, `LOGG.md`.
**Tester:** Python 57, JavaScript 22 bestått. Mobilnettleser: Vacheron Constantin (navnevariant med «&» og «Genève») gjenkjent, ingen pris, råd og advarsel vist; ukjent navn «Zentra» uten pris og med simulert Wikipedia-treff.
**Ikke testet:** Ekte Wikipedia-kall (sperret i byggemiljøet).
**Neste:** Ekte salgsdata; serienummertabeller for flere merker (Longines, Waltham, Elgin m.fl.).

### 2026-10-29 – Økt 14: InformAntikk i viktoriansk steampunk-stil
**Gjort:**
- Navnet byttet til **InformAntikk** overalt (tittel, toppfelt, manifest, hjemskjermtittel, README, FastAPI).
- Nytt tema for hele appen (`styles.css`, delt av begge versjoner): hovedbokpapir med svake fibre og mørkere kanter, toppfelt som messingskilt på valnøtt, overskrifter i IM Fell English med kapittelpynt (strek – ❦ – strek), knapper som graverte messingplater med nagler, sekundærknapper og kort med dobbel strek som museumsetiketter, emaljeskilt for «Sikker/Sjekk/Usikker», bilder i messingramme, prisskala som messingstang med gradering og knott, ❧/✦ som punkttegn. Mørk modus i valnøtt og lær.
- Nytt ikon: lommeur på messingtannhjul, valnøtt med messingkant (SVG + PNG 192/512).
- Skrifter fra Google Fonts med Baskerville (iPhone) og Palatino som reserve.
**Filer:** `docs/{styles.css,index.html,manifest.webmanifest,icon.svg,icon-192.png,icon-512.png}`, `app/static/` (samme), `app/main.py`, `README.md`, `LOGG.md`.
**Tester:** JavaScript 20 bestått. Alle skjermene kontrollert i lys og mørk modus (med reserveskrifter; Google Fonts er sperret i byggemiljøet).

### 2026-10-29 – Sammenligning: ekte Gemini mot fasiten (Monard)
**Stemmer:** 101954 som kassenummer på tre steder (ytre lokk innside, cuvetten inn- og utside), merke «G. MONARD», teksten «Echappement à cylindre», «Aiguilles», «Genève», sylindergang, nøkkeloppstrekk (med riktig begrunnelse: to nøkkelhull, «Aiguilles», ingen krone), verk med broer, sølv 0.800 i både lokk og cuvette, ingen falske advarsler. Ingen tiur.
**Avvik:** (1) «8» i «8 Rubis» ikke lest (står i egen ramme). (2) Kassemakermerket G.S ikke rapportert; i stedet ba modellen om nærbilde av «småstemplene ved siden av 0,800». Det er ønsket oppførsel: den så at noe var der, men gjettet ikke. (3) Bare ett element under «Brukes ikke i vurderingen» mot fire i fasiten: modellen fant monogrammet («monogram i slyngeskrift», ytre lokk innside), men ikke K9341, ripene på balansebroen eller initialene på utsiden. Ufarlig: de ville uansett blitt holdt utenfor. (4) Begrunnelsen for gangtype sier også at sylindergangen er synlig i verket; det kan ikke bekreftes fra bildet.
**Vurdering:** Alt som avgjør datering og pris, ble lest riktig. Resultatet blir det samme som med fasiten.
**Rettet:** Merkelappen «Samme nummer 3 steder» brøt over to linjer; merkelapper brytes ikke lenger.

### 2026-10-29 – Økt 13: Nytt navn: InformAntique
**Gjort:** Navnet byttet i sidetittel, toppfelt, PWA-manifest (navn og kortnavn), hjemskjermtittel for iPhone, sidebeskrivelse, FastAPI-tittel, README og logg. Repoet heter fortsatt `antikk-info`.
**Filer:** `app/main.py`, `app/static/{index.html,manifest.webmanifest}`, `docs/{index.html,manifest.webmanifest}`, `README.md`, `LOGG.md`.

### 2026-10-29 – Økt 12: Steampunk-venteskjerm
**Gjort:** Venteskjermen i viktoriansk steampunk-stil: messing- og kobbertannhjul som går i hverandre bak uret (motsatt vei, fart etter antall tenner), rifflet kasse, romertall, Breguet-visere, åpent vindu der uroen svinger, og en messinglupe som glir over skiven. Teksten i kursiv antikva med ❦-ornamenter og tidstypiske formuleringer («Studerer bildene …», «Tyder gravering og tekst …», «Blar i protokollene …»). Fungerer i lys og mørk modus; står stille ved «redusert bevegelse». Vinduet med uroen krympet så det ikke dekker romertallet VI.
**Filer:** `app/static/{app.js,styles.css}`, `docs/styles.css`, `docs/js/app.js`, `LOGG.md`.
**Tester:** JavaScript 20 bestått. Animasjonen tatt opp i lys og mørk modus.

### 2026-10-29 – Økt 11: Venteskjerm med animasjon
**Gjort:** Spinneren og «Gemini leser bildene …» er byttet ut med en animasjon av et lommeur under lupe: sekundviseren tikker, lupen glir over urskiven. Teksten under skifter rolig: «Ser på bildene …», «Finner ut hva hvert bilde viser …», «Leter etter nummer og stempler …» osv., og blir stående på siste linje. Respekterer «redusert bevegelse». Leverandørnavnet er fjernet fra startsiden og feilmeldingene; det står bare i innstillingene. Begge versjoner.
**Filer:** `app/static/{index.html,app.js,styles.css}`, `docs/{index.html,styles.css}`, `docs/js/{app,vision}.js`, `tests_web/vision.test.mjs`, `LOGG.md`.
**Tester:** Python 50, JavaScript 20 bestått. Venteskjermen tatt opp i mobilnettleser.

### 2026-10-29 – Økt 10: Hvem er G. Monard? («Om navnet»)
**Søk:** «G. Monard, Genève» finnes på mange lommeur i handelen: sølv-savonnette med nøkkeloppstrekk, 13 steiner, nummerert cuvette (Proantic); kasse i uedelt metall nr. 70958 med usignert sveitsisk verk, vurdert til £60–90 (Fellows 2017); gullur med ankergang (forumtråder). Jules Monard, Genève, laget fine minuttrepetisjonsur rundt 1900 (Antiquorum, nr. 24964 og 25261). Flere forumtråder (NAWCC, watch.ru) spør hvem G. Monard var; innholdet kunne ikke leses herfra. Ingen biografi funnet.
**Gjort:** Ny tabell `makers` og kort «Om navnet» på resultatsiden (begge versjoner), med omtale, tolkning (etablisseur eller handelsnavn, merket som tolkning), forklaring av nummeret og kilder. Merket «Ikke verifisert». Ukjente navn får «Vi har ingen opplysninger om … ennå».
**Filer:** `app/db/{schema,seed,database}`, `app/models.py`, `app/services/makers.py` (ny), `app/routes/analyze.py`, `tools/export_data.py`, `docs/data/makers.json` (ny), `app/static/*`, `docs/{index.html,styles.css}`, `docs/js/app.js`, `tests/test_core.py`, `tests_web/core.test.mjs`, `LOGG.md`.
**Tester:** Python 50, JavaScript 20 bestått. Kortet kontrollert i mobilnettleser.

### 2026-10-29 – Første ekte Gemini-test med fri opplasting
**Gjort:** Brukeren kjørte Monard-uret gjennom den publiserte appen med egen Gemini-nøkkel. Resultatet var det samme som ved forrige ekte kjøring, altså stabilt mellom to kjøringer. Detaljert sammenligning mot fasiten er ikke gjort ennå.
Tiuren fra første kjøring ble **ikke** nevnt denne gangen. Det tyder på at Gemini var usikker og at tiuren var en tolkning, ikke en avlesning.
**Endret:** Instruksen sier nå at figuren i et kontrollmerke bare skal navngis når den er tydelig synlig, ikke utledes fra sølvgrad eller land; ellers «unidentified hallmark in a frame».
**Neste:** Sammenligne skjermbildet «Stemmer dette?» mot fasiten (nummer og steder, oppstrekk, gangtype, materiale, periode).

### 2026-10-29 – Økt 9: Legg inn bildene du har
**Bakgrunn:** Brukeren påpekte at et ur kan identifiseres på mange måter, og at alle kjennetegn ikke alltid trengs. Forslag fra brukeren: legg inn bilder av det du har.

**Gjort:**
- De faste fire stegene er erstattet av ett bildeskjermbilde: ta bilde eller velg flere fra galleriet (høyst 8), fjern enkeltbilder, analyser når du vil.
- Modellen får bildene umerket og i vilkårlig rekkefølge, og rapporterer hva hvert bilde viser (`photos`). Miniatyrene viser dette etter analysen.
- Nye regler for forslag (`app/services/suggest.py`, `docs/js/suggest.js`): verket når merket har serienummertabell og verksnummer mangler, lokket når materialet mangler, cuvetten når navn eller gangtype mangler, osv. Deler som allerede er fotografert og lest, foreslås ikke på nytt. Monard-uret får ingen forslag.
- Bekreftelsesskjermen viser «Ett bilde til kan hjelpe» med knapp tilbake til bildene; alle bilder beholdes og analyseres på nytt.
- API-et tar imot `photos` som liste. Begge frontender oppdatert.

**Filer:** `app/models.py`, `app/services/vision/{core,mock}.py`, `app/services/vision/providers/*.py`, `app/services/vision/examples/monard_101954.json`, `app/services/suggest.py` (ny), `app/routes/analyze.py`, `app/config.py`, `app/static/*`, `docs/index.html`, `docs/styles.css`, `docs/js/{app,vision,suggest}.js`, `docs/data/vision_contract.json`, `tests/*`, `tests_web/core.test.mjs`, `.env.example`, `README.md`, `LOGG.md`.

**Tester:** Python 49 bestått, JavaScript 19 bestått. Mobilnettleser: fem Monard-bilder valgt fra galleriet på én gang i tilfeldig rekkefølge og sendt umerket; ingen forslag. Bare urskiven på et Omega-ur ga forslag om verket og lokket; legge til og fjerne bilder virker. Ingen JavaScript-feil.

**Neste:** Ekte Gemini-test med fri opplasting.

### 2026-10-29 – Økt 8: Kontrollmerke, monogram og G.S
**Gjort:** Gjennomgått nytt nærbilde av ytre lokk. Funnet innslått merke i ramme ved kassenummeret (lokk og cuvette), som jeg overså i første avlesning; Gemini hadde sett det og kalt det tiur, men figuren kan ikke bekreftes. Eieren leste «G.S» ved sølvstempelet; fasiten oppdatert (kassemakermerke i lokk og cuvette). Drøftet monogrammets betydning: proveniens og historie, ikke materiale eller datering.

**Foreslått, ikke bygget ennå:** (1) instruks: navngi kontrollmerkets figur bare når den er tydelig, (2) avkrysning «jeg har sett merket selv», (3) kontrollmerke snevrer inn perioden bare når bekreftet, (4) boks «Gravering og historie» med bokstaver og brukerens egne opplysninger, (5) merknad i verdikortet om eiergravering.

**Filer:** `app/services/vision/examples/monard_101954.json`, `docs/data/vision_contract.json`, `LOGG.md`.
**Tester:** Python 44, JavaScript 18 bestått.

### 2026-10-29 – Økt 7: Lært av et ekte ur (G. Monard, Genève)
**Bakgrunn:** Brukeren fotograferte et ekte lommeur (6 HEIC-bilder). Det avvek fra antakelsene: nummeret sto på lokkene og ikke på verket, cuvetten hadde stempler på begge sider, verket og urskiven hadde nesten ingen merker.

**Avlesning (fasit):** Sveitsisk lommeur med nøkkeloppstrekk, sølv 0.800 i både kasse og cuvette, sylindergang, 8 steiner, verk med broer. Signert «G. Monard, Genève» på cuvetten. Nummer 101954 i ytre lokk og på begge sider av cuvetten. «K9341» og riper på balansebroen tolket som reparasjonsmerker. Monogram og initialer er eiergravering. Ingen sveitsisk kontrollmerke sett.

**Gjort:**
- Nytt observasjonsskjema: `numbers[]` og `marks[]` med plassering, metode og type; `winding` og `movement_layout`. Ny instruks som forklarer stempling vs. gravering vs. riping.
- Normalisering: grupperer like nummer på tvers av deler og markerer samsvar, varsler ved ulike kassenummer, skiller ut reparasjons- og eiermerker, finner merke også i graverte tekster og fjerner bynavn fra nøkkelen.
- Datering: ny tabell `period_rules`; uten serienummerdatering vises en grov periode (Monard: ca. 1830–1890).
- Verdivurdering: ukjente navn sammenlignes med usignerte ur, med merknad.
- Grensesnitt: eget bilde av cuvettens innside, felt for oppstrekk og verktype, boks «Funnet på uret» med nummer, steder, samsvar og hva som ble sett bort fra. Veiledningen oppdatert.
- HEIC: originalen sendes til Gemini når nettleseren ikke kan lese den.
- Monard-uret er standard demoeksempel og testfasit i begge språk.

**Filer:** `app/models.py`, `app/services/vision/{core,mock}.py`, `app/services/vision/examples/monard_101954.json` (ny), `app/services/{normalize,dating,valuation}.py`, `app/db/{schema,seed,database}`, `app/routes/analyze.py`, `app/config.py`, `app/static/*`, `docs/index.html`, `docs/styles.css`, `docs/js/{app,normalize,dating,valuation,vision}.js`, `docs/data/*.json`, `tools/export_data.py`, `tests/*`, `tests_web/*`, `.env.example`, `LOGG.md`.

**Tester:** Python 44 bestått, JavaScript 18 bestått (nye: Monard-fasit, innrissede nummer, ulike kassenummer, perioder). Nettversjonen kjørt i mobilnettleser med de ekte bildene: demo og simulert Gemini-svar ga samme resultat, fem merkede bilder sendt. HEIC-bilde sendt uendret som `image/heif`. To feil funnet og rettet (krasj i steg uten ekstra bilde, sikkerhetsmerke ved tomt felt).

**Ikke testet:** Ekte Gemini-kall med disse bildene.

**Neste:** Skru på Pages og kjør Monard-uret gjennom ekte Gemini; sammenlign med fasiten.

### 2026-10-29 – Økt 6: To baklokk og veiledning
**Bakgrunn:** Brukeren påpekte at lommeur som regel har to lokk bak (ytre lokk og cuvette), og at appen trenger en liten opplæring.

**Gjort:**
- Bildestegene endret fra tre til fire, i åpningsrekkefølge: urskive, ytre baklokk (innsiden), cuvetten (utsiden) og urverket. Valgfrie nærbilder av ytre lokk og verk. Fremdriftslinjen lages nå ut fra stegene.
- Ny bilderolle `cuvette` i modellen, API-et og vision-instruksen. Instruksen ber modellen merke stempler fra det indre lokket med «Cuvette: ».
- Stempeltolking: metallmerke på cuvetten avgjør ikke kassematerialet. Er bare cuvetten merket metall, ber appen om stempel fra det ytre lokket eller manuelt valg.
- Veiledningen «Slik åpner du et lommeur» med skjematisk tegning av lagene og korte kort: før du begynner, de fire stegene (inkludert savonett med frontlokk og ur som åpnes forfra) og lukking. Åpnes fra startsiden og via «Slik åpner du dette» i hvert steg, rett til riktig avsnitt.
- Gjelder både nettversjonen og serverversjonen. Demoeksempel og eksporterte data oppdatert.

**Filer:** `app/models.py`, `app/routes/analyze.py`, `app/services/vision/{core,mock}.py`, `app/services/normalize.py`, `app/static/{index.html,app.js,styles.css}`, `docs/{index.html,styles.css}`, `docs/js/{app,normalize}.js`, `docs/data/vision_contract.json`, `tests/test_core.py`, `tests_web/core.test.mjs`, `README.md`, `LOGG.md`.

**Tester:** Python 38 bestått, JavaScript 14 bestått. Nettversjonen kjørt i mobilnettleser: fire steg, veiledningen fra startsiden og fra steg 3 (lander på cuvette-avsnittet og går tilbake til samme steg), demoflyt og live-flyt med fire bilder sendt til simulert Gemini. Ingen JavaScript-feil.

**Neste:** Skru på Pages og test med et ekte ur.

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
