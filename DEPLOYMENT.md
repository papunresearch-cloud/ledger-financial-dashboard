# Free cloud deployment

Ledger is a standalone project. Deploy this folder as its own Git repository and Cloudflare Pages project; do not attach it to another application's repository or deployment.

## What the hosted version supports

Cloudflare Pages hosts the built React app. Workbook parsing, charts, calculations, PDF export and Excel export run in the visitor's browser. The `.xlsx` workbook is read into browser memory and is not sent to a Ledger server. Visitors can use the app from any device with a browser and a Screener workbook they can select on that device.

The Python/Playwright helper is a local computer tool. It launches visible Chrome and uses that computer's Screener browser session. Cloudflare Pages does not run that helper, and a remote service cannot reuse the visitor's local Chrome login. On the hosted site, save the Screener workbook on the device and upload it. To use the one-click Screener helper, run Ledger locally with its Python service and Chrome setup from `README.md`.

## Deploy as its own Cloudflare Pages site

1. Create a new **private** repository in your Git provider for Ledger. Put the contents of this `financial-dashboard` folder at the repository root. Do not add workbook samples, browser profile folders, Screener credentials, or the separate stock-monitor project. The existing `.gitignore` excludes `node_modules`, build output, and the local browser profile.
2. Push the repository to GitHub or GitLab. This workspace currently has no Git repository or remote configured, so connect the new repository you create rather than expecting an existing deployment to update.
3. In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git** and select the new Ledger repository. Choose the production branch (normally `main`).
4. Set the build command to `npm run build` and the build output directory to `dist`. If you instead connect a monorepo containing this app, set its root directory to `financial-dashboard`; standalone repo root should remain `/`.
5. Save and deploy. Cloudflare will provide a `*.pages.dev` address. Open it on a second device and upload a workbook containing a `Data Sheet` worksheet to confirm the hosted workflow. Subsequent pushes to the production branch publish updates.

There are no Python packages or environment secrets required for the static deployment. `npm ci` is used by the build environment from the committed lockfile.

## Free-tier boundaries

Static asset requests on Cloudflare Pages are free and unlimited under the documented plan. The current Free limits include 500 builds per month, one concurrent build, 20,000 files per site, and 25 MiB per individual site file. Pages Functions invoke Workers and have a separate daily free request allowance; Ledger does not need a Function for workbook analysis. Limits and plan terms can change, so check Cloudflare's [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) before relying on a particular quota.

The free Pages URL is provided by Cloudflare. A custom domain requires owning a domain, which is not free. Cloudflare hosts the code and static assets, not a copy of users' workbooks. No login, cloud sync, shared reports, database, background updates, or remotely run Screener automation is included. The app needs an `.xlsx` Data Sheet workbook supplied by the user; legacy `.xls` files are not supported. No hosting plan can make Screener export available if Screener login, verification, or its own access rules prevent it.

## Local fallback from anywhere

Keep the hosted page for workbook analysis. If direct Screener export is needed, run the local service on the computer that has the Screener Chrome session and use the local Ledger URL there. The local service binds to loopback and is intentionally not exposed to the internet. Do not expose it with router port forwarding or place Screener credentials in frontend variables. On a device without the workbook or local helper, the hosted app can only analyze a workbook that the user provides on that device.
