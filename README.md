# QOEBIT Frontend Adapter

This package is a frontend scaffold adapted to the QOEBIT backend services:

- QOEBIT Parser: `:8000/api/v1`
- KPI Engine: `:8001`
- Agent Layer: `:1000`

## Included pages

- Dashboard
- Topology
- FM Alarms
- CM History
- PM Counters
- HO Neighbors
- KPI Monitor
- Anomalies
- Agent Chat
- Config

## Environment

Create a `.env` file from the example below:

```env
VITE_PARSER_API_BASE=http://151.242.147.49:8000/api/v1
VITE_KPI_API_BASE=http://151.242.147.49:8001
VITE_AGENT_API_BASE=http://151.242.147.49:1000
VITE_AGENT_API_KEY=
```

## Auth

The frontend uses `POST /auth/token` and stores the returned bearer token in local storage.

## Notes

This adapter intentionally avoids direct Supabase usage in the active app shell.
Legacy prototype files are still present in the repository, but the routed app now uses the QOEBIT API layer under:

- `src/api`
- `src/context/AuthContext.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/pages/qoebit/*`
