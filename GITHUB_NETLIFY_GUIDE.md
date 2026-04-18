# GitHub + Netlify Guide

## 1) Push updates to GitHub

This project already has helper scripts:

- `npm run git:sync`
- `npm run git:push` (same behavior)

Use it like this:

```bash
npm run git:sync -- "feat: update dashboard"
```

If you skip the message, a timestamped commit message will be used.

What this command does:

1. `git add -A`
2. `git commit`
3. `git push`

## 2) Connect to Netlify

1. Go to Netlify dashboard.
2. Click `Add new site` -> `Import an existing project`.
3. Connect GitHub and select repo: `Deartaj92/APSCollection`.

Netlify build settings are already in `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: `20`
- Functions directory: `netlify/functions`

## 3) Add environment variables in Netlify

In Netlify site settings -> `Environment variables`, add:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Use the same values you use locally in `.env`.

## 4) Supabase keepalive

This project now includes a scheduled Netlify function:

- `netlify/functions/keep-supabase-awake.js`

Netlify will run it `@daily`, and it makes a tiny read request to Supabase so the database project does not sit idle for 7 days.

You can also test it manually after deploy:

- `/.netlify/functions/keep-supabase-awake`

## 5) Trigger deploy

Any push to `main` will auto-deploy.

Manual deploy:

1. Netlify -> `Deploys`
2. `Trigger deploy` -> `Deploy site`

## 6) Local verification before push

```bash
npm install
npm run build
npm run start
```
