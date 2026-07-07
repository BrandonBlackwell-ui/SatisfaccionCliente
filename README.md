# Survey Dashboard — Satisfacción del Cliente

Dashboard standalone que muestra el estado de los surveys bimestrales de satisfacción por cliente.

## Stack
- React + TypeScript + Vite
- Datos en tiempo real desde Supabase (`wa_daily_analysis.raw_analysis.survey`)

## Setup

```bash
npm install
cp .env.example .env   # y llena las variables
npm run dev
```

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL de tu proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key pública de Supabase |

## Funcionalidades

- Tabla checklist por cliente con palomita/tache para Pregunta Tipo A y Tipo B
- Tooltip al hover: muestra la pregunta y respuesta exacta
- Fecha del último survey aplicado
- Scores Tipo A y Tipo B con color semáforo
- Búsqueda y filtros (Todos / Respondidos / Pendientes)
- Tarjetas de resumen: con survey, ambas preguntas, pendientes
