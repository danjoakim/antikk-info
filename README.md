# Lommeur-sjekk (MVP)

Mobil web-app som hjelper samlere med å identifisere, datere og finne prisintervall for gamle lommeur.

**Prinsipp:** vision-modellen *observerer* (leser nummer, stempler, gangtype). Databasen *konkluderer* (årstall og pris fra oppslagstabeller). Modellen har ingen felt for år eller pris, så den kan ikke gjette dem.

> ⚠️ Alle data i `seed.sql` er **demodata**. Auksjonssalgene er fiktive. Se `LOGG.md` for hva som må verifiseres.

Prosjektet har to versjoner som deler data, regler og grensesnitt:

| | Nettversjon (`docs/`) | Serverversjon (`app/`) |
|---|---|---|
| Kjører | I nettleseren, hostet på GitHub Pages | Python/FastAPI på egen maskin eller server |
| Bildeanalyse | Google Gemini med din egen nøkkel, lagret på telefonen | Anthropic, OpenAI, Gemini eller OpenAI-kompatibel |
| Brukes til | Daglig bruk på mobilen | Videreutvikling, flere brukere senere |

## Nettversjonen på GitHub Pages (mobil)

1. Legg koden i et GitHub-repo.
2. Gå til repoets **Settings → Pages**. Velg *Deploy from a branch*, gren `main` og mappe **`/docs`**. Lagre.
3. Etter et minutt eller to er appen på `https://BRUKERNAVN.github.io/REPO/`.
4. Åpne adressen på telefonen, trykk tannhjulet, lim inn Gemini-nøkkelen, trykk **Test nøkkelen** og **Lagre**.
5. Legg siden på hjemskjermen («Legg til på Hjem-skjerm» i Safari, «Legg til på startskjermen» i Chrome).

**Nøkkelen** lagres bare i nettleseren på telefonen og sendes bare til Google. Den skal aldri inn i repoet; en Pages-side er offentlig. Begrens nøkkelen i Google Cloud Console (*APIs & Services → Credentials*): *API restrictions* = Generative Language API, *Website restrictions* = `https://BRUKERNAVN.github.io/*`.

Uten nøkkel kjører nettversjonen i demomodus med faste eksempler.

**Endre data:** rediger `app/db/seed.sql` (eneste kilde), kjør `python tools/export_data.py` og commit. Instruks og skjema for bildeanalysen eksporteres samtidig fra `app/services/vision/`, så begge versjonene alltid bruker det samme.

**Tester for nettversjonen:** `node --test tests_web/*.test.mjs` (Node 20+).

## Serverversjonen

### Kom i gang

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # valgfritt: legg inn ANTHROPIC_API_KEY
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Åpne <http://localhost:8000>. Databasen opprettes og fylles med demodata ved første oppstart (`data/lommeur.db`). Slett filen for å starte på nytt.

**Uten API-nøkkel** kjører appen i mock-modus. Du kan da velge mellom tre faste eksempler på startsiden: Omega i sølv, usignert sylinderur i metall, og uleselige bilder.

## Velge leverandør for bildeanalyse

Kopier `.env.example` til `.env` og fyll inn nøkkelen du har. Appen velger leverandør automatisk ut fra hvilken nøkkel som finnes, eller du kan sette `VISION_PROVIDER` selv.

| Leverandør | `VISION_PROVIDER` | Nøkkel | Standardmodell |
|---|---|---|---|
| Anthropic Claude | `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-6-astra` |
| Google Gemini | `gemini` | `GEMINI_API_KEY` (eller `GOOGLE_API_KEY`) | `gemini-3.8-flash` |
| OpenRouter, Ollama, LM Studio o.l. | `openai_compatible` | `OPENAI_COMPATIBLE_API_KEY` (ikke for lokale) + `OPENAI_BASE_URL` + `VISION_MODEL` | – |

Alle leverandørene får samme instruks og samme strenge JSON-skjema, og svaret valideres likt. Skjemaet har ingen felt for årstall eller pris. Modellnavn endres ofte; bytt med `VISION_MODEL` om standardmodellen er utgått.

For Google trengs en **Gemini API-nøkkel** fra Google AI Studio. Nøkler til Maps eller Cloud Vision virker ikke.

Lokale modeller (Ollama, LM Studio) er gratis og privat, men leser små graveringer og stempler klart dårligere enn de store skymodellene. Modellen må kunne lese bilder og støtte strukturert JSON-utdata.

## Tester

```bash
pytest
```

## Teste på mobilen

Nettlesere gir bare kameratilgang over **HTTPS** (unntatt `localhost`). For å teste på telefonen mot maskinen din:

```bash
# Alternativ 1: Cloudflare Tunnel (gratis, ingen konto nødvendig for rask test)
cloudflared tunnel --url http://localhost:8000

# Alternativ 2: ngrok
ngrok http 8000
```

Åpne HTTPS-adressen som vises på telefonen. Filopplasting fra galleri fungerer også over vanlig HTTP på lokalnettet, men direkte kamera krever HTTPS.

Appen kan legges til på hjemskjermen («Legg til på startskjerm»).

## Struktur

```
app/
├── main.py              FastAPI-app, oppstart og statiske filer
├── config.py            Innstillinger fra miljø/.env
├── models.py            Pydantic-kontrakter
├── routes/analyze.py    /api/meta, /api/analyze, /api/lookup
├── services/
│   ├── vision/          Bildeanalyse: core.py (felles instruks, skjema, validering),
│   │                    mock.py og providers/ (anthropic, openai, gemini)
│   ├── normalize.py     Stempler → materiale, rensing av serienumre
│   ├── dating.py        Serienummer → årsintervall
│   └── valuation.py     Salg → min/median/maks med trinnvis utvidelse
├── db/                  schema.sql, seed.sql, database.py
└── static/              Mobil-frontend uten byggesteg
tests/                   pytest
docs/                    Nettversjonen (GitHub Pages): index.html, js/, data/ (eksportert)
tools/export_data.py     seed.sql + vision-kontrakt → docs/data/*.json
tests_web/               node:test for nettversjonen
LOGG.md                  Prosjektlogg: plan, beslutninger, økter
```

## Flyt

1. `POST /api/analyze` (multipart: `dial`, `movement`, `caseback`, valgfritt `movement_closeup`, `caseback_closeup`) → observasjoner + normaliserte verdier.
2. Brukeren bekrefter eller retter i skjemaet.
3. `POST /api/lookup` (JSON) → datering og prisintervall.

Frontend komprimerer bildene til maks 2000 px / JPEG 0,85 og retter EXIF-rotasjon før opplasting.

## Legge inn ekte data

- **Serienumre:** én rad per intervall i `serial_ranges` med `source` og `is_demo = 0` når raden er sjekket mot minst to kilder. `number_type` angir om tabellen gjelder verks- eller kassenummer.
- **Salg:** bare realiserte salg (hammerpris), med `source_url`. Ikke utropspriser eller prisguider.
