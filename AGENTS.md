# Reglas de trabajo

- Node >=20. Única dependencia: dotenv. Sin frameworks ni telemetría.
- Trabaja por fases; no avances si el test de la fase falla. Muestra la salida.
- Prohibido modificar o debilitar tests para que pasen.
- Si un test falla dos veces tras corregir código, PARA y documenta en PROGRESS.md.
- Crea solo los archivos de la estructura acordada. Ambigüedad: lo más simple y anotarlo en README.
- Prioriza fases 1-3 completas antes que la fase 4.
- No commit, no push y no instales paquetes sin pedir confirmación.
- La app es Node independiente: no usa subagentes ni herramientas de OpenCode en runtime. El revisor de OpenCode es solo para el desarrollo.

# Comandos

- Instalar: `npm install`
- Tests: `npm test`
- Correr una tarea: `node src/index.js --task "..." --tipo texto`
- Benchmark completo: `node bench/run.js`
- Reanudar benchmark: `node bench/run.js --resume`
- Replay sin API: `node src/index.js --replay traces/<id>.jsonl`
- Servidor: `node src/server.js`

# Memoria

- Al iniciar sesión lee PROGRESS.md antes de actuar.
- Al cerrar cada fase actualiza PROGRESS.md en 10 líneas máximo: hecho, siguiente, decisiones y comando para reanudar.
- Al cerrar cada fase invoca al subagente revisor con la fase y las rutas; corrige hallazgos o documéntalos.
