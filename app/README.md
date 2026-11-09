# Doude app (Next.js)

Not scaffolded yet. To set it up, run this inside `/app` and keep `lib/types.ts`:

```bash
npx create-next-app@latest . --ts --tailwind --app --eslint --no-src-dir
npm i leaflet react-leaflet recharts && npm i -D @types/leaflet
```

Create `.env.local`:
```
NEXT_PUBLIC_DOUDE_API=http://localhost:8000
```

Build against the engine stub (`uvicorn engine.main:app --reload`), which already serves the sample contract. Types are in `lib/types.ts`.

Pages for the prototype:
- `/` — map (pipeline, leak pin, slick polygon) + pressure/flow charts + "Run analysis" button
- `/report` — the spill record and PDF download
