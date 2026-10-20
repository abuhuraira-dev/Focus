# Windows setup — C:\Solopreneur\Focus

## Tools

Install Node.js 24 LTS and Git for Windows. Optional: VS Code and Vercel CLI. Restart PowerShell after installing tools.

```powershell
node --version
npm --version
git --version
New-Item -ItemType Directory -Force C:\Solopreneur | Out-Null
Set-Location C:\Solopreneur
git clone https://github.com/abuhuraira-dev/Focus.git
Set-Location C:\Solopreneur\Focus
Copy-Item .env.example .env.local
npm.cmd install
npm.cmd run dev
```

Open http://localhost:3000. There are no runtime package dependencies. If the folder already contains work, do not clone over it; commit or back it up first. For an existing clone, run `git pull --ff-only` instead. Use `npm.cmd` and `npx.cmd` if PowerShell blocks script execution; no execution-policy change is needed.

## Environment variables

Browser-only mode needs no keys. For accounts and cloud sync, create a Supabase project, then set these in `.env.local`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
PORT=3000
```

Find the Project URL and public anon key under Supabase Project Settings > API. These two values are intentionally browser-visible. Never use a service-role/secret key. Never commit `.env.local`.

1. Run `supabase/schema.sql` in Supabase SQL Editor. This enables row-level security so each account accesses only its own workspace.
2. Enable email/password authentication. Keep email confirmation enabled for production; configure a production email provider in Supabase before opening registration broadly.
3. Set Authentication > URL Configuration > Site URL to your Vercel production URL after deployment.
4. Restart `npm.cmd run dev` after changing `.env.local`.
5. Open Account & sync. Create an account, confirm email if required, and sign in.
6. Export a browser backup. Read cloud workspace, then upload if cloud is empty. Cloud sync is manual; local data is never silently replaced. Sign-in lasts for this browser tab session.

## Verify and deploy

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
npx.cmd vercel login
npx.cmd vercel
```

For the Vercel prompts, use the current directory and the detected `vercel.json` settings. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Vercel Project Settings > Environment Variables for the environments you use. Then:

```powershell
npx.cmd vercel --prod
```

Alternatively, import `abuhuraira-dev/Focus` in Vercel's dashboard. Framework preset: Other. Build command: `npm run build`. Output: `dist`. Root: repository root. Functions in `api/` are deployed by Vercel. Once linked to GitHub, pushes to main trigger production deployments.

## Daily commands

```powershell
Set-Location C:\Solopreneur\Focus
npm.cmd run dev
# Ctrl+C stops the local server.
npm.cmd run check
npm.cmd test
npm.cmd run build
git status
git add .
git commit -m "Describe the change"
git push origin main
```

## Install on phone or desktop

Serve from HTTPS in production or localhost during development. In supported browsers use the Install button or browser menu > Install app. iPhone/iPad: Safari > Share > Add to Home Screen. The app can reopen offline after its first online load. Account actions require Internet. Installation support varies by browser.

## Troubleshooting

- Port in use: set `PORT=3001` in `.env.local`, restart, and open localhost:3001.
- Cloud not configured: check environment variables and restart/redeploy.
- Signup fails or email never arrives: inspect Supabase Auth logs and email provider settings. Do not put passwords or tokens into issues.
- Cloud table/policy error: run the SQL migration in the correct Supabase project.
- Another device changed data: export the local backup, read cloud, then reconcile locally before uploading. Focus intentionally refuses a stale upload.
- Browser storage is per origin. localhost, Vercel preview, production, and downloaded HTML have different storage. Transfer via backup/restore.
- On a shared device, export your backup and clear browser site data after signing out. Signing out does not remove your local workspace.
