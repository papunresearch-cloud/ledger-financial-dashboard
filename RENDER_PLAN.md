# Ledger on Render: free-tier implementation plan

## Target design

Keep Ledger as its own Render project, separate from the existing stock-monitor and separate from the existing Screener downloader project. Use two Render services in the Ledger project:

```text
Browser
  └─ Render Static Site: React/Vite dashboard (free static hosting)
       └─ HTTPS API request
            └─ Render Web Service: Ledger Python API (Free instance)
                 └─ configured outbound proxy
                      └─ Screener export
```

The static site serves the dashboard. The Python API downloads a workbook through the already-working proxy and returns it directly to the requesting browser. The React app then uses its existing workbook parser, charts, and exports. Uploaded workbooks continue to be processed in the browser.

## Proxy requirement

The proxy is a required part of the data path because Screener blocks requests from Render cloud IPs. Render gives services regional outbound IP ranges; those addresses are not a proxy and do not make a blocked cloud request work. Configure the API downloader to send Screener traffic through the same proxy method that already succeeds in the existing Render project.

- Reuse the existing authorized proxy/provider configuration if its service terms permit this separate Ledger project to use it. Otherwise obtain a proxy endpoint that is permitted for this use. Render itself does not supply a free proxy.
- Store proxy URL, username, and password only as Render environment secrets on the Ledger API service. Never put them in React/Vite variables, browser requests, source files, or logs.
- Ensure the downloader actually routes all Screener page and export requests through the proxy. Test this from the deployed service; setting an environment variable alone is not proof that Playwright or the HTTP client is using it.
- Do not rely on anonymous public proxies. They are unstable, can observe traffic, and may fail at authentication or file downloads. A proxy provider may have a separate charge; free Render hosting does not make proxy access free.

## Implementation phases

### 1. Confirm the working Render downloader contract

Record the current service's request URL/method, required inputs, proxy configuration mechanism, and returned file format. Confirm whether the response can provide an `.xlsx` workbook containing the exact `Data Sheet` tab expected by Ledger. Do not change or merge the existing service as part of this project.

If the downloader only returns CSV, inspect its columns and periods. Either map that CSV to Ledger's data types in a separate CSV importer, or have the Ledger API produce the expected Data Sheet workbook. Do not treat an arbitrary Screener CSV as equivalent to the current workbook until the fields and coverage match.

### 2. Prepare Ledger's Python API for Render

Adapt `backend/server.py` for a public Render web service:

- Bind to `0.0.0.0` and the port in `PORT` (Render defaults to `10000`), instead of fixed `127.0.0.1:8000`.
- Keep `/api/download` same in purpose: validate the company code, call the proxy-enabled downloader, and return workbook bytes with the correct content type and attachment name.
- Keep downloads in memory and return them to the requesting browser; do not persist user workbooks or proxy credentials.
- Add a health endpoint for Render and concise, secret-free logs.
- Replace localhost-only origin checks with an allowlist for the exact deployed Ledger static-site origin. Add preview/local origins only when needed. CORS controls which browser pages may read the response; it is not authentication and does not stop non-browser clients.
- Add request throttling or an access-control layer before exposing a costly public download endpoint. Do not ship a shared API secret in frontend JavaScript: every visitor can inspect it.

The existing Playwright downloader is explicitly local-only: it launches `channel="chrome"`, `headless=False`, and a persistent local browser profile. Do not deploy it unchanged. The Ledger backend must reuse the proxy-compatible headless/download flow proven by the existing Render downloader, or another permitted automation method that does not expect a desktop window or local profile. If Screener login, CAPTCHA, or verification still needs a human-visible browser, direct cloud downloads cannot be made hands-off merely by setting a proxy.

### 3. Configure the React app to call the separate API

The current frontend uses the relative URL `/api/download`, which assumes the frontend and API share an origin. For the two-service design:

- Add a Vite build-time API base setting such as `VITE_API_BASE_URL` and use it for the download request.
- Update the landing UI so the direct-download form is enabled when the production API URL is configured; it currently shows the local-only message on non-localhost domains.
- Set it in the Render Static Site build environment to the Ledger API's HTTPS `onrender.com` URL.
- Set the API CORS allowlist to the final `*.onrender.com` static-site URL.
- Retain the local Vite proxy and local Python workflow for development.

Do not place Screener credentials or proxy credentials in `VITE_*` settings; Vite embeds those values in public client assets.

### 4. Create a standalone Ledger repository

Create a separate Git repository containing only the `financial-dashboard` project. Exclude `node_modules`, `dist`, `.browser-profile`, workbook samples, `.env` files, proxy details, and Screener credentials. The current workspace folder has no Git remote, so a new repository and first push are needed before Render can deploy it.

### 5. Deploy the API as a Render Free Web Service

Connect the Ledger repository and set the service root to the repository root (or `financial-dashboard` if using a larger repository, though a standalone repository is preferred).

- Runtime: Python 3.
- Build command: `pip install -r backend/requirements.txt` plus any required cloud-browser installation for the chosen downloader. Avoid installing desktop Chrome if the tested proxy downloader uses another approach.
- Start command: `python -u backend/server.py` (after making it honor Render's host and `PORT`).
- Add proxy configuration and any downloader credentials under Render's Environment settings as secrets.
- Choose the Free compute plan and configure a health-check path.

### 6. Deploy the React app as a Render Static Site

Create a second service in the Ledger Render project, connected to the same standalone repository:

- Build command: `npm ci && npm run build`.
- Publish directory: `dist`.
- Build environment: set `VITE_API_BASE_URL` to the API service's HTTPS URL.
- No server, database, Python service, or user workbook storage is needed for the static site.

### 7. Verify end to end

From the deployed site, check (a) the health route, (b) a supported company-code download through the proxy, (c) that the response is an `.xlsx` with the expected `Data Sheet`, (d) both Bank and non-bank parsing where appropriate, and (e) PDF/Excel report downloads. Also check a bad ticker, proxy failure, Screener login/verification challenge, and the first request after the API sleeps. Confirm logs never reveal credentials or proxy URLs with embedded secrets.

## Free-tier and reliability expectations

Render static sites are free to deploy and do not consume web-service instance hours, but they count against included bandwidth and build-pipeline usage. The API is a Free Web Service. Render currently grants 750 Free instance hours per workspace each calendar month, shared by that workspace's Free web services. An idle web service spins down after 15 minutes and its next request can take about a minute to wake. Free web-service filesystems are ephemeral, and Render may restart the service. See [Render free-plan details](https://render.com/docs/free) and check actual usage in the dashboard.

Because another Free web service already runs in the same Render workspace, the 750 hours are not a separate allowance for Ledger. If the existing service consumes most of the workspace hours, Ledger's API may be suspended when the shared allowance is exhausted. A separate Render project does not create a separate free-hours quota. Static hosting remains free, but direct downloads need the API to be awake and within the workspace allowance.

The proxy is an independent dependency and may cost money. This plan does not assume that a free proxy exists, that Screener will always accept the proxy, or that a proxy overrides Screener's own access rules. If a suitable permitted proxy is not available at no cost, then the all-free direct-download requirement cannot be guaranteed; manual workbook upload remains the fallback.

## Suggested order

1. Verify that the existing proxy-backed Render download returns a workbook that Ledger can already parse (or define the CSV conversion/import work).
2. Create the separate Ledger repository.
3. Adapt the API host/port, proxy integration, authentication/throttling, and CORS.
4. Configure the frontend API URL.
5. Deploy the API and static site on Render Free.
6. Test the complete path and monitor shared Render hours plus proxy usage.
