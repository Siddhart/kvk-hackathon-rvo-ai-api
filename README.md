# RVO Subsidie Analyser - Concept voor Hackathon

Dit is een conceptuele AI-agent die automatisch RVO-subsidieregelingen analyseert en vereisten extraheert. Dit project is ontwikkeld voor een hackathon en toont hoe een dergelijke oplossing zou kunnen werken.

## ⚠️ Belangrijke Notitie

**Dit is een concept:** Deze implementatie is gemaakt om te demonstreren hoe een AI-gebaseerde subsidie-analyzer zou kunnen werken. Het is nog geen productie-klaar systeem.

**Geen officiële schema's:** Het bestand `attestation-schema.json` bevat een zelfgemaakt schema voor attestaties. Omdat er nog geen officiële schema's beschikbaar zijn voor subsidies en attestaties, is dit voor de hackathon zo opgelost. In een productie-omgeving zouden er officiële, gestandaardiseerde schema's moeten worden gebruikt.

## Hoe het werkt

De agent werkt in drie stappen:

1. **AI maakt een scraping plan**: De AI analyseert de hoofdpagina van een subsidie en besluit zelf welke subpagina's en documenten (PDFs, DOCX, etc.) relevant zijn om te scrapen.

2. **Automatisch scrapen**: De agent scrapet automatisch de relevante pagina's en documenten en extraheert tekst uit verschillende bestandstypen (HTML, PDF, DOCX, XLSX).

3. **AI analyseert en classificeert**: De AI analyseert alle verzamelde informatie en extraheert vereisten, waarbij deze worden geclassificeerd als:
   - **Attestations**: Verifieerbare data-eigenschappen (bijv. KvK-nummer, IBAN)
   - **Non-attestations**: Documenten die aangemaakt moeten worden (bijv. projectplan, aanvraagformulier)

## Vereisten

- Node.js (v18 of hoger)
- OpenAI API key

## Installatie

```bash
npm install
```

Maak een `.env` bestand aan in de root directory:

```
OPENAI_API_KEY=jouw-openai-api-key
PORT=3000
```

## Gebruik

### Als API Server

Start de server:

```bash
npm run server
```

De server draait op `http://localhost:3000` (of de poort gespecificeerd in `.env`).

**Analyseer een subsidie via API:**

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.rvo.nl/onderwerpen/dhi-subsidieregeling"}'
```

**Health check:**

```bash
curl http://localhost:3000/health
```

### Als Command Line Tool

```bash
npm start "https://www.rvo.nl/onderwerpen/dhi-subsidieregeling"
```

## Structuur

- `server.js` - Express API server
- `agent-ai-autonomous.js` - De hoofdlogica van de AI-agent
- `start-ai-autonomous.js` - CLI tool voor command-line gebruik
- `attestation-schema.json` - Conceptueel schema voor attestaties (geen officieel schema)

## Technologieën

- **OpenAI GPT-4** - Voor AI-besluitvorming en analyse
- **Cheerio** - HTML parsing en scraping
- **Express** - API server
- **pdf-parse, mammoth, xlsx** - Document parsing

## Notities voor Hackathon

- Het `attestation-schema.json` bestand is een conceptueel voorbeeld. In productie zou dit een officieel, gestandaardiseerd schema moeten zijn.
- De AI maakt autonome beslissingen over welke pagina's te scrapen - dit kan soms fouten maken of onvolledig zijn.
