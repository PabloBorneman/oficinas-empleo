# Sistema Interno - Oficinas de Empleo

Proyecto web interno para la Red de Oficinas de Empleo / Ministerio de Trabajo de Jujuy.

## Objetivo

Permitir que cada municipio/oficina cargue relevamientos dinamicos y que el Ministerio pueda visualizar estadisticas, graficos, datos por municipio, datos unificados y comparativas.

## Stack inicial

- Frontend: Angular con standalone components
- Backend: Node.js + Express
- Base de datos: SQLite para MVP inicial, migrable luego a PostgreSQL
- Autenticacion: JWT
- Contrasenias: bcrypt
- Graficos: Chart.js / ng2-charts

## Estructura

- backend: API, autenticacion, base de datos y logica del sistema
- frontend: panel admin y panel municipio
- docs: documentacion tecnica y notas del proyecto
