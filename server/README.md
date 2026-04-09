# OSMOSIS Local Server

Backend Express.js pour utilisation 100% locale avec PostgreSQL.

## Installation

```bash
cd server
npm install
```

## Configuration

Créez un fichier `.env` dans le dossier `server/` :

```env
OPENROUTER_API_KEY=sk-or-votre-cle
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=postgres
PG_USER=postgres
PG_PASSWORD=root
```

## Lancement

```bash
npm run dev
```

Le serveur démarre sur `http://localhost:3001`.

## Lancer le frontend en mode local

Depuis la racine du projet :

```bash
VITE_LOCAL_API=http://localhost:3001 npm run dev
```

Ou créez un fichier `.env.local` à la racine :

```env
VITE_LOCAL_API=http://localhost:3001
```

## Endpoints

| Méthode | URL | Description |
|---------|-----|-------------|
| POST | /api/backend-admin | Test connexion, créer tables, état tables |
| POST | /api/import-topo | Import données topo |
| GET | /api/topo | Lire toutes les données topo |
| GET | /api/dashboards | Lister les dashboards |
| POST | /api/dashboards | Créer/modifier un dashboard |
| DELETE | /api/dashboards/:id | Supprimer un dashboard |
| POST | /api/rag-embed | Gestion documents RAG |
| POST | /api/qoe-assistant | Proxy vers OpenRouter (streaming) |
| GET | /api/health | Health check |
