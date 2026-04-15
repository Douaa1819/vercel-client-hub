# Client Hub Frontend (Vercel)

Ce dossier est une version statique de `public/client-hub` pour deployment sur Vercel.

## 1) Avant de deployer

1. Ouvre `vercel.json`
2. Remplace:

`https://ton-backend.onrender.com`

par ton URL backend Render, par exemple:

`https://clickupbackend.onrender.com`

## 2) Deploy avec Vercel CLI

Depuis ce dossier:

```bash
cd vercel-client-hub
vercel
vercel --prod
```

## 3) Configuration sur backend Render

Le backend doit avoir au minimum:

- `MONGODB_URI`
- `OPENAI_API_KEY`
- `CENTRALIZED_HUB_EDITOR_TOKEN`
- `CENTRALIZED_HUB_VIEWER_TOKEN`
- `CLIENT_HUB_USER_SUBACCOUNT_MAP_JSON`
- `CLIENT_HUB_TOKEN_ALLOWED_LOCATION_IDS`
- `PAST_CUSTOMER_SLACK_WEBHOOK_URL` (optionnel si vide)

## 4) Test rapide

1. Ouvre l'URL Vercel.
2. Connecte-toi avec `CENTRALIZED_HUB_EDITOR_TOKEN`.
3. Ouvre un client -> onglet `Past customers`.
4. Teste `Preview` puis `Upload & Import`.
