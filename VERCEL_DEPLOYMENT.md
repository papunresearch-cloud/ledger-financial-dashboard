# Vercel deployment: React app plus Python download function

This deployment keeps Ledger as a separate project. Vercel serves the Vite React app and its `/api/download` Python Function from one origin. The endpoint returns the same kind of `.xlsx` workbook with a `Data Sheet` tab that the current local server returns, so the existing browser-side parser and reports remain in use.

## What is configured in this project

- `api/download.py` implements `GET /api/status` and `POST /api/download`.
- `backend/screener_downloader.py` retains the local visible-Chrome path and adds a Vercel headless-browser path routed through a proxy.
- The Vercel function requires a private `LEDGER_ACCESS_KEY` entered in the dashboard. The key is checked server-side and is never compiled into JavaScript.
- The Vite app calls the same-origin `/api/download` endpoint and sends the access key in an HTTPS request header.
- The build installs Playwright's Chromium headless shell into the Python package before building the React static assets.

## Deploy it

1. Create a separate Git repository containing only this `financial-dashboard` project. Do not include workbook samples, `.browser-profile`, `node_modules`, or `.env` files.
2. Import that repository as a new project in Vercel. Use the project root (no monorepo root override).
3. Set the Vercel project environment variable `VITE_ENABLE_SCREENER_DOWNLOAD` to `true` for Production and Preview if you want the download card enabled. This is a public UI switch, not a secret.
4. In Vercel Project Settings → Environment Variables, add:
   - `LEDGER_ACCESS_KEY`: a long, private random string that only you enter into the dashboard's Ledger access-key field.
   - `SCREENER_PROXY_SERVER`: proxy address, for example `http://proxy-host:proxy-port` or `https://proxy-host:proxy-port` as supplied by your provider.
   - `SCREENER_PROXY_USERNAME` and `SCREENER_PROXY_PASSWORD` if required by that proxy.
   - `SCREENER_EMAIL` and `SCREENER_PASSWORD` if the Screener export requires sign-in and the provider/account permits automated sign-in. These stay server-side. Do not set them as `VITE_*` variables.
5. Redeploy after setting variables. Vercel uses `vercel-build`: it installs Chromium's headless shell and runs the existing TypeScript/Vite production build.
6. Open `/api/status`; it should return a small JSON health response. Then open the homepage, enter the access key and a supported Screener code, and try **Download & analyze**.

For initial setup, leave the proxy username/password empty if the proxy has no authentication. The user supplies the proxy endpoint values through Vercel's Environment Variables; no proxy address or credentials are committed in this project.

## Limits and what can still fail

Vercel Python Functions are available on Hobby. This function is configured for up to 300 seconds with Fluid Compute. Without Fluid Compute, Hobby maximum duration may be lower. Function request/response payloads are limited to 4.5 MB, so the API returns a clear error for a workbook larger than 4 MB. Hobby usage and personal-use restrictions are described in [Vercel's Hobby plan](https://vercel.com/docs/plans/hobby), with runtime ceilings on [Function limits](https://vercel.com/docs/functions/limitations). Check current plan terms before relying on these limits.

The cloud function uses a fresh headless browser for each invocation, not the persistent Chrome profile on your computer. If Screener requires an OTP, CAPTCHA, or a visible human sign-in, the function cannot pause and show a browser window; that download will fail and manual `.xlsx` upload remains available. The proxy must work with HTTPS CONNECT and with Playwright's browser traffic. A proxy does not guarantee that Screener permits the request.

Use a proxy provider endpoint you are authorized to use. Vercel does not supply a proxy; the free tier does not make the proxy free. The Python Function bundles Chromium and may approach Vercel's 500 MB Python-function bundle limit. The first Vercel build is the practical check that the headless-shell bundle fits and its Linux libraries are available. If the build or browser launch fails because of these platform constraints, keep the same React frontend on Vercel and run the Python/Playwright service on a browser-capable host that supports the proxy, or use the local helper.

The public dashboard requires an access key for downloads, but this is a small personal-use gate, not a full user-account system or rate-limiting service. Do not share the key. Rotate it in Vercel if it is exposed. Workbook analysis remains local to the visitor's browser; only the ticker request is sent to the function, and the returned workbook passes through the function to that browser.
