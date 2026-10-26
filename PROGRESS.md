# Progreso

- Hecho: fases 1-3 completas y 43 tests verdes; LLM MOCK/caché/presupuesto, agentes, verificadores, bucle, replay/trazas y servidor.
- Fase 4: `bench/cases.json` (15 casos), `bench/run.js` A/B/C/D, `bench/stats.js`, `test/bench.test.js` y `report.MOCK.md`; revisor: sin hallazgos reales.
- Siguiente: correr benchmark con API real, revisar resultados y ajustar README; **No probado con API real**.
- Decisión: app nueva en la raíz; legacy intacto y probado con `npm run test:legacy`. A/B una llamada; C/D tope por llamada; D solo gana si IC95% >0.
- Comando: `npm test`; `MOCK=true BENCH_RUNS=1 node bench/run.js` (PowerShell: `$env:MOCK='true'; $env:BENCH_RUNS='1'; node bench/run.js`).
