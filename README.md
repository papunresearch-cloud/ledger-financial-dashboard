# Ledger — Company Financial Visualizer

Ledger can read a local workbook or fetch a Screener export from a locally running Python helper. It processes the resulting workbook in the browser, then renders charts and analysis tables. Non-bank and bank analysis use separate formulas and chart sets. Bank mode follows the calculations in the supplied bank financial prompt and works with a local Data Sheet workbook.

## Run with direct Screener download

You need Node.js, Python 3.10+, Google Chrome, and the Python packages in `backend/requirements.txt`.

1. Open a terminal in this folder and install Python requirements once:

   ```powershell
   & "C:\Users\USER\AppData\Local\Programs\Python\Python310\python.exe" -m pip install -r backend\requirements.txt
   ```

   Use your installed Python path if it differs. The downloader uses your installed Chrome and creates its own profile under `backend\.browser-profile`; it does not use or lock your normal Chrome profile.

2. Start the local Python service in Terminal 1:

   ```powershell
   & "C:\Users\USER\AppData\Local\Programs\Python\Python310\python.exe" backend\server.py
   ```

3. Start React in Terminal 2:

   ```powershell
   npm install
   npm run dev
   ```

4. Open the local Vite URL. For supported non-bank companies, enter a Screener code such as `INFY`, `ITC`, or `RELIANCE`, then click **Download & analyze**. A separate Chrome window opens. If Screener asks for sign-in, sign in there; the app-owned profile retains the session for later requests. The app checks for the export button before attempting any login-field interaction. Direct download is currently disabled for bank mode; upload the bank workbook instead.

The service returns only the `Data Sheet` tab to the React app. It does not save the downloaded workbook to your project folder; Playwright holds a temporary browser download until the request finishes. The browser stores the workbook in page memory only; clearing or refreshing removes it. The Chrome profile retains Screener's login session locally until you remove `backend\.browser-profile`.

### Optional automatic sign-in

You can provide credentials to the local service as environment variables for that terminal session. The project source has no password field or hard-coded credential. In PowerShell:

```powershell
$credential = Get-Credential -Message "Screener sign-in"
$env:SCREENER_EMAIL = $credential.UserName
$env:SCREENER_PASSWORD = $credential.GetNetworkCredential().Password
& "C:\Users\USER\AppData\Local\Programs\Python\Python310\python.exe" backend\server.py
```

If Screener requires an OTP, CAPTCHA, or different verification, complete it in the opened Chrome window. The credentials are process environment values and are not written by Ledger to its files.

## Manual workbook option

If the Screener export is unavailable, choose an `.xlsx` file that contains **Data Sheet**. The file is read in browser memory. Legacy `.xls` files are not supported yet.

## What the app calculates

- Annual charts for sales, net profit, derived operating profit, cash flow, user-defined FCF, dividends, EPS/dividend per share, receivables, inventory, net block, CWIP, equity, and cash/bank.
- Annual GPM, OPM, NPM, debt/equity, ROE, ROA, and the selected Other Assets / Total Assets proxy.
- Quarterly sales, net profit, OPM, and NPM. Quarterly GPM is not plotted.
- Tables for the source Data Sheet and derived annual/quarterly calculations.
- PDF report and Excel workbook exports. The Excel export includes the Data Sheet, analysis tables, definitions, and chart images.

### Bank mode

Select **Bank**, then upload a bank workbook with the same `Data Sheet` structure. Bank mode displays the 10 annual and 4 quarterly charts specified in the supplied bank prompt. It maps bank `Sales` to interest earned and `Interest` to interest paid. Annual total expense uses the prompt's itemized expense formula when all required line items exist; if components are blank but total revenue and PBT are present, it derives total expense as Total Revenue − PBT and flags that method in Data checks and exports. Quarterly total expense is `Expenses + Interest`.

The bank views also calculate the prompt's interest gap, OPM, NPM, dividend payout, EPS/DPS, ROE/ROA, borrowings/equity, and liquidity formulas. Borrowings/equity is retained as the user-requested measure and is labeled as a user-defined bank funding ratio. Missing values remain blank. NIM, advances/loans, deposits/CASA, NPAs/provisions, and capital adequacy are not inferred when absent from the workbook. PDF and Excel exports use bank-specific tables and include the bank chart images.

Missing source values remain missing and appear as gaps or dashes, with data-quality notes. Explicit zero dividend gives zero dividend per share and payout ratio. EPS and dividend per share divide ₹ crore by adjusted shares in crore. ROE and ROA use average balance-sheet values; their first period is blank when no prior year is present.

The selected proxy definitions are shown in the app and exports: **CapEx proxy = CWIP**, **user-defined FCF = Operating Cash Flow − CWIP**, and **current-assets proxy = Other Assets**. CWIP is a balance-sheet amount, so these measures are labelled as proxies rather than standard cash-flow CapEx/FCF. Blank annual operating-cost rows are not silently converted to zero.

## Build / run the local production app

```powershell
npm run build
& "C:\Users\USER\AppData\Local\Programs\Python\Python310\python.exe" backend\server.py
```

After building, open `http://127.0.0.1:8000`. The local server binds to loopback only. The Vite development server also uses localhost by default so a company download endpoint is not exposed to the Wi-Fi network.

## Cloud hosting

Ledger can be hosted as its own free Cloudflare Pages site. The static React app supports workbook upload, browser-side analysis, charts, and PDF/Excel exports from anywhere. Cloud-hosted users must provide an `.xlsx` workbook with a `Data Sheet`; the uploaded workbook is processed in browser memory.

The Python/Playwright Screener downloader remains local-only because it needs visible Chrome and that computer's browser session. The cloud page therefore directs visitors to upload a saved workbook. See [DEPLOYMENT.md](DEPLOYMENT.md) for the standalone Pages setup, free-tier limits, and local Screener fallback. This deployment does not require or join another project.

For a Render-hosted API and proxy-backed direct Screener download, see the separate [RENDER_PLAN.md](RENDER_PLAN.md). That design requires adapting the current local-only downloader and confirming the API's workbook format and proxy access first.

The current Vercel implementation is in [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md). It adds a Python serverless endpoint and headless Playwright path while keeping the same `.xlsx` response used by the local app. A configured proxy and server-side access key are required for cloud downloads.

## Workbook layout

Only the `Data Sheet` worksheet is read. Its section labels should include Profit & Loss, Quarters, Balance Sheet, and Cash Flow. The parser looks up row labels rather than fixed row numbers. Extend the aliases in `src/parseWorkbook.ts` if another source workbook uses different labels.
