# Deploying PackVision on the Windows server

Target: **https://packvision.packagesgroup.com**, one Python process behind IIS.
The new system runs next to phase 1 on its own port (**5100**), so it can be installed and
tested without touching the live portal. The switch is a short window (see the release runbook).

```
browser ──HTTPS──▶ IIS site packvision.packagesgroup.com ──▶ 127.0.0.1:5100  PackVision API (uvicorn)
                                                                   ├─ /api/*     API
                                                                   ├─ /uploads/* design files
                                                                   └─ /*         web app (frontend/build)
```

## 1. Before the window (no downtime)

**Ask IT for**
- DNS: `packvision.packagesgroup.com` → the server's public IP.
- A TLS certificate covering that name (a `*.packagesgroup.com` wildcard works).
- In the SAP IAS admin console, on the PackVision application:
  redirect URI **`https://packvision.packagesgroup.com/api/auth/ias/callback`** (exactly), and the ID token
  must carry the SuccessFactors employee ID as **`employee_number`**. Then send you the client ID and secret.

**Install on the server**
- Python 3.12 (64-bit, "Add to PATH"), Node.js 18+ (only to build the web app), Git.
- IIS modules: **URL Rewrite** and **Application Request Routing (ARR)**.
- A service wrapper to run the API as a Windows service, e.g. NSSM (or what phase 1 already uses).

**Get and build the code** (example folder `D:\PackVision`)
```powershell
git clone https://github.com/LaraibYazdani/qc_portal.git D:\PackVision
cd D:\PackVision
git checkout feature/python-backend          # or main, once merged

cd frontend
npm ci
npm run build                                # → frontend\build

cd ..\server
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m pytest -q            # 46 passed
```

**Settings**: copy `server\.env.example` to `server\.env` and fill in:

| Setting | Value |
|---|---|
| `DB_*` | the production database (same as phase 1) |
| `JWT_SECRET` | a new long random value |
| `PORT` | `5100` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://packvision.packagesgroup.com` |
| `TRUST_PROXY` | `1` |
| `COOKIE_SECURE` | `true` |
| `UPLOAD_DIR` | **the full path of phase 1's existing `backend\uploads` folder**, so all 4,435 designs keep working. Don't copy or move the files. |
| `SF_*` | as in your current `.env` |
| `IAS_*` | issuer, client ID/secret from IT, `IAS_REDIRECT_URI` as above; keep `IAS_ENABLED=false` for now |

**Rehearse the database upgrade** on a copy, on this server (release runbook, "Rehearsal on a copy").

**Install the service** (NSSM example; it is not started against production yet):
```powershell
nssm install PackVision "D:\PackVision\server\.venv\Scripts\python.exe" "-m uvicorn app.main:app --host 127.0.0.1 --port 5100"
nssm set PackVision AppDirectory D:\PackVision\server
nssm set PackVision AppStdout D:\PackVision\logs\api.log
nssm set PackVision AppStderr D:\PackVision\logs\api.log
nssm set PackVision AppRotateFiles 1
nssm set PackVision AppRotateBytes 10485760
nssm set PackVision Start SERVICE_AUTO_START
```
Never add `--workers`: SAP sign-in state is kept in the one process's memory.

**IIS site**
1. New site `PackVision`, physical path `D:\PackVision\deploy\iis` (holds only `web.config`),
   HTTPS binding for `packvision.packagesgroup.com` with the certificate (+ HTTP binding, which redirects).
2. Once, as administrator:
   ```powershell
   $appcmd = "$env:windir\system32\inetsrv\appcmd.exe"
   & $appcmd set config -section:system.webServer/proxy /enabled:"True" /reverseRewriteHostInResponseHeaders:"False" /timeout:"00:05:00" /commit:apphost
   & $appcmd set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='HTTP_X_FORWARDED_PROTO']" /commit:apphost
   ```
   (proxying on, IIS must not rewrite the API's redirects, 5-minute timeout for big bulk uploads,
   and permission to pass on that the browser used HTTPS).

## 2. In the window (≈10 minutes)

Follow the release runbook, steps 3–8: back up the database and the uploads folder, run the migrations
from `D:\PackVision\server`, then `nssm start PackVision`.

Phase 1's Node code keeps working on the upgraded database, so the old portal can stay up a few days
while people move to the new address. Then point the old address at `https://packvision.packagesgroup.com`.

## 3. Checks

```powershell
Invoke-WebRequest https://packvision.packagesgroup.com/api/health      # {"status":"OK",...}
```
- Sign in with an existing account; the sidebar shows the role and company.
- Look up a known job number: the phase 1 artwork shows (proves `UPLOAD_DIR`).
- Upload a test design, see it in the overview, archive it.
- Logs: `D:\PackVision\logs\api.log`.

## 4. Turning on SAP sign-in

When IT confirms the redirect URI is registered: set `IAS_ENABLED=true` in `server\.env`,
`nssm restart PackVision`, and the login page shows **Continue with SAP**. Approve the first people
under **Users → Waiting**.

## 5. Photo checks (the print-check engine)

Keep `ENGINE_ENABLED=false` on the current server: checking photos needs CPU and memory it doesn't have.
Nothing is lost meanwhile: every uploaded design version is queued, and is prepared once the engine is on.

On the new server:
1. In `server\.env`: `ENGINE_ENABLED=true`, `ENGINE_WORKERS=2` (each check uses about 1 GB while it runs),
   `ENGINE_REFERENCE_WORKERS=1`. `nssm restart PackVision`. The log shows "Print-check engine on".
2. Sign in as a group admin → **Reference review** → **Prepare … older designs** queues phase 1's designs
   (newest first; roughly 5–15 seconds each, in the background, never delaying checks).
3. QC supervisors approve each design's reference in **Reference review** before it can be checked.

The engine runs as extra Python processes started by the service; there is nothing else to install.
Reference and check files are kept under `UPLOAD_DIR\_engine\` (back it up with the uploads).

## 6. Updating later

```powershell
cd D:\PackVision; git pull
cd frontend; npm ci; npm run build
cd ..\server; .venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python scripts\migrate.py --status     # apply any new migration (back up first)
nssm restart PackVision
```

## Rolling back

`nssm stop PackVision` and point users back to the phase 1 address. Database rollback only if needed
(release runbook, "Rollback").
