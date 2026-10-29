# Financial Dashboard — Integration Handoff for the Existing AI Agent

## 1. Project purpose

This project is a client-side financial statement analysis dashboard called **Ledger**. It reads a Screener-style Excel workbook with a worksheet named `Data Sheet`, extracts annual, quarterly, balance-sheet and cash-flow data, calculates user-defined financial ratios, and presents the results in a responsive React interface. A user can inspect an original-like Data Sheet view and export a PDF report or an Excel workbook containing the source data, analysis tables and chart images.

The dashboard has two distinct analysis modes:

- **Non-bank company** — industrial, IT, FMCG and other non-financial companies. Includes detailed profitability, cash conversion, balance-sheet, solvency and operating trend charts.
- **Bank** — bank-specific view based only on fields available in the workbook. It does not try to infer standard bank measures that are absent from the supplied Data Sheet.

There is no database, user account system, server-side workbook storage, or persistent upload store. Workbook parsing, calculation, rendering and PDF/Excel exports run in the browser. The manual upload flow is therefore suitable for a static React host such as Vercel.

## 2. Current architecture and data flow

```text
User's browser
  ├─ React + TypeScript UI (Vite build)
  ├─ Selects Bank or Non-bank mode
  ├─ Reads uploaded .xlsx file in browser memory (ExcelJS)
  ├─ Converts Data Sheet sections into typed financial rows
  ├─ Computes charts / ratios and renders Recharts visualizations
  ├─ Exports PDF and Excel locally in the browser
  └─ Optional Screener button calls POST /api/download
         │
         ├─ Local development: Vite proxy -> http://127.0.0.1:8000
         └─ Production local server: backend/server.py serves dist and endpoint
                └─ backend/screener_downloader.py -> Playwright -> app-owned Chrome profile
                     -> Screener company page -> export Excel -> retain only Data Sheet
```

### Manual workbook route (recommended for a Vercel integration)

1. User chooses a mode and uploads a `.xlsx` workbook.
2. `App.tsx` calls `parseCompanyWorkbook()` or `parseBankWorkbook()`.
3. `parseWorkbook.ts` reads the workbook's `Data Sheet` into a matrix and maps its sections/rows into typed annual and quarterly objects.
4. `Charts.tsx`, `CompanyDashboard.tsx` or `BankDashboard.tsx` render the analysis.
5. `exportReports.ts` creates PDF/Excel files in the browser. The uploaded workbook is not sent to the Python service or saved by the app.

This route has no dependency on Render or a Python server. It can be integrated into an existing Vercel frontend without moving workbook calculations to the backend.

### Screener route (local-only in this version)

1. `App.tsx` sends `POST /api/download` with `{ "code": "INFY" }`.
2. `backend/server.py` validates the code and calls `download_company_workbook()`.
3. `backend/screener_downloader.py` opens an app-owned persistent Chrome profile using Playwright, waits for Screener authentication/export UI, clicks **Export to Excel**, downloads the workbook, and removes every worksheet except `Data Sheet` using openpyxl.
4. Python returns the `.xlsx` bytes; React wraps them in a browser `File` and uses the same parsing flow as an uploaded workbook.

This implementation is intentionally for a local Windows computer. It launches a visible Chrome using a persistent profile on that computer. It is not a cloud-ready Render worker as written. In addition, the frontend currently fetches the relative URL `/api/download`; it expects a same-origin endpoint or a dev proxy.

## 3. What an integrating agent should preserve / decide

### Recommended first integration

Integrate the React dashboard as a page/route/component within the existing Vercel app, initially keeping **manual workbook upload** as the supported input route. Keep parsing, chart calculation, display, and exports in the browser. This avoids duplicating data handling in the Python backend and preserves the privacy-by-design behavior.

### Render backend integration

Do not copy `backend/server.py` unchanged into the current Render server. It is a small local `http.server` app that binds specifically to `127.0.0.1:8000`, serves this project's `dist`, and includes `/api/download`. The existing Render application likely already has its own web framework/server and must remain the process entry point. If the app needs a new endpoint, incorporate the endpoint into that existing backend, use Render's assigned port/bind configuration, and configure CORS/API URL as needed.

### Screener automation constraint

The existing Playwright downloader depends on a browser session/profile at `backend/.browser-profile` and opens visible Chrome. A Render instance cannot reuse a user's local Chrome session or show its browser window to the user's device. Putting Screener credentials in Vercel frontend code is unsafe and must not be done. Treat remote Screener export as a separate backend/product decision; do not assume it becomes functional just because the UI is hosted on Vercel and the Python files are deployed on Render.

### Frontend API URL

`fetchFromScreener()` currently calls `fetch('/api/download', ...)`. In a combined Vercel + Render deployment, this URL would target Vercel unless Vercel routes/proxies it. If the integration exposes a Render API directly, make its base URL configurable through a Vite environment variable (for example `VITE_API_BASE_URL`) and configure backend CORS for the exact Vercel origin. This only solves routing; it does not solve the local Chrome/session requirement above.

## 4. Detailed file inventory

Paths below are relative to the `financial-dashboard` project root.

| File | Description | Task performed / important logic |
|---|---|---|
| `src/App.tsx` | Main React application and user journey | Holds Bank/Non-bank selection, section navigation, upload/drag-drop state, Screener company-code form, errors/loading state, report buttons and privacy messaging. Parses a workbook after upload or after download. Calls `POST /api/download` for Screener export. Routes to bank or non-bank dashboard. |
| `src/parseWorkbook.ts` | Workbook import, normalization and financial calculations | Uses ExcelJS in the browser; loads only `Data Sheet`; converts the sheet into a cell matrix; identifies Profit & Loss, Quarters, Balance Sheet and Cash Flow sections by labels; reads periods from `Report Date`; normalizes numbers/dates/aliases; produces `CompanyData` or `BankData`; computes derived annual/quarterly metrics and warning messages. This is the core domain-calculation module. |
| `src/types.ts` | Shared financial data contracts | Defines `AnnualRow`, `QuarterRow`, `BankAnnualRow`, `BankQuarterRow`, `CompanyData`, `BankData`, `FinancialData`, and period/value structures. The parser, dashboards, charts and export functions share these types. |
| `src/Charts.tsx` | Chart specifications and reusable chart renderer | Defines `ChartSpec` and `ChartPanel` using Recharts. `makeChartSpecs()` builds non-bank annual, quarterly and special chart groups (including TTM additions and ratio overlays); `makeBankChartSpecs()` builds bank-specific chart groups. Handles dark/light themes, legends, axes, tooltips, line/column/combo plots and chart export render stage. |
| `src/CompanyDashboard.tsx` | Non-bank report pages | Renders the overview cards and tables, rolling per-share summary, growth and quality tables, annual/quarterly charts, special analysis charts, source Data Sheet table, and calculation/data-quality notes. |
| `src/BankDashboard.tsx` | Bank report pages | Renders the bank overview, bank annual and quarterly plots, source Data Sheet display and bank-specific calculation checks. Shows source-driven coverage; unavailable bank measures are not invented. |
| `src/rollingPerShare.ts` | Three-year rolling average calculation | Builds every complete rolling three-period mean from a list of per-share values, skips any window containing a missing/non-finite value, then averages the valid rolling means. Returns the final value and number of valid windows. |
| `src/PerShareRollingSummary.tsx` | Overview widget for per-share rolling summaries | Presents the rolling summary values for EPS, Dividend per Share and Free Cash Flow per Share, along with explanatory notes/coverage. |
| `src/exportReports.ts` | PDF and Excel report exporters | Captures chart cards from the DOM, builds downloadable PDF and Excel files in browser memory, includes Data Sheet and derived analysis tables/definitions, embeds plot images in Excel, and uses separate bank/non-bank report handling. It does not send export data to Python. |
| `src/styles.css` | All visual styling and responsive layout | Defines dark visual theme, typography, page structure, card/table/chart styles, bank/non-bank variants, responsive breakpoints, upload and error states, print/export staging styles. |
| `src/main.tsx` | React entry point | Creates the React root and mounts `App` into the HTML root element. |
| `index.html` | Vite HTML shell | Provides the root element and page metadata/title loaded by the React entry point. |
| `vite.config.ts` | Vite build/dev-server configuration | Enables the React plugin. In development it proxies `/api` calls to `http://127.0.0.1:8000`, allowing the Vite UI to reach the local Python service. This proxy is not automatically present on Vercel. |
| `package.json` | Frontend package scripts and dependencies | Defines `npm run dev`, `npm run build` (`tsc -b && vite build`) and `npm run preview`; includes React, ExcelJS, Recharts, html2canvas, jsPDF and icon dependencies. |
| `package-lock.json` | Reproducible frontend dependency lockfile | Records exact dependency graph for npm install/build. Keep it aligned with `package.json`. |
| `tsconfig.json` | TypeScript project references | Top-level TypeScript configuration. |
| `tsconfig.app.json` | TypeScript configuration for application source | Compiler configuration for the React/TypeScript app. |
| `tsconfig.node.json` | TypeScript configuration for Node/Vite config | Compiler settings for tooling/config files. |
| `backend/server.py` | Local Python HTTP server and Screener API endpoint | Serves `dist` after build; `GET /api/status`; `POST /api/download`; validates request size/company code/origin; invokes downloader and returns XLSX bytes. Hardcoded `127.0.0.1:8000` and local static serving make this a local development/desktop server, not a plug-in Render entry point. |
| `backend/screener_downloader.py` | Playwright browser automation and workbook cleanup | Opens a persistent app-owned Chrome profile; visits Screener company page; optionally fills login form from environment values; waits for user sign-in when needed; clicks export; reads the temporary download; uses openpyxl to retain only `Data Sheet`; serializes browser operations with a lock. Requires Chrome, Playwright and Screener access. |
| `backend/requirements.txt` | Python service dependencies | Lists `openpyxl` and `playwright`. Playwright browser binaries / Chrome installation are separate runtime requirements. |
| `README.md` | Developer setup and functional documentation | Explains local development, Screener sign-in/download, upload fallback, formulas, bank mode, exports, and limitations of static cloud hosting. |
| `.gitignore` | Ignore rules | Ignores `node_modules`, built `dist`, Vite cache/logs, Python bytecode and the persistent local Screener browser profile. Do not commit `.browser-profile`. |

## 5. Workbook input structure

The app supports `.xlsx` only and requires a worksheet named `Data Sheet` (case-insensitive). Non-bank mode expects section labels for:

- `Profit & Loss`
- `Quarters`
- `Balance Sheet`
- `Cash Flow`

The parser finds sections by their labels, then looks for a `Report Date` row inside each section. It does not rely on fixed row numbers. It uses label aliases in some places (for example `Net Profit`/`Net profit`, `Share Capital`/`Equity Share Capital`, and a few cash-flow spellings). New workbook variants may need additional aliases in `parseWorkbook.ts`.

The sheet values are held as an in-memory matrix for rendering the original-style Data Sheet view and for the calculations. The app reads the workbook in the browser; uploads are not posted to Render.

## 6. Main calculation rules implemented

### Non-bank calculations

The formulas below reflect the current source code. All amounts are expected in the workbook's stated units (normally ₹ crore), with period labels derived from `Report Date`.

| Metric | Current rule |
|---|---|
| Total income | Sales + Other Income; blank component leaves result unavailable. |
| Annual gross profit | Sales + Change in Inventory − Raw Material Cost; blank change/raw material is treated as zero. |
| Annual operating profit | Sales + Change in Inventory − Raw Material Cost − Power and Fuel − Other Manufacturing Expenses − Employee Cost − Selling and Admin − Other Expenses; blank cost components are treated as zero. |
| Annual GPM / OPM / NPM | 100 × relevant gross/operating/net profit ÷ Sales. A zero/missing sales denominator yields blank. The chart suppresses GPM when every annual GPM is above 95%. |
| Quarterly OPM | Reported quarterly Operating Profit ÷ Sales × 100. |
| Quarterly NPM | Quarterly Net Profit ÷ Sales × 100. |
| Equity | Equity Share Capital + Reserves; if either is unavailable, equity is blank. |
| EPS | Net Profit ÷ adjusted shares in crore; fallback reported share count is divided by 10,000,000 when adjusted-share row is unavailable. |
| Dividend per share | Dividend amount ÷ shares in crore; explicit zero dividend gives zero DPS; missing/unusable inputs remain blank. |
| Dividend payout | Dividend ÷ net profit × 100; explicit zero dividend gives zero; missing/unusable inputs or non-positive profit remain blank. |
| FCF | Cash from Operating Activity − Capital Work in Progress; blank CWIP is treated as zero; missing operating cash flow leaves FCF blank. |
| Net cash flow | Uses reported Net Cash Flow if present; otherwise sums operating, investing and financing cash flow only when all three are present. |
| ROE | Net profit ÷ average of current and preceding period equity × 100; first year and missing balance values remain blank. |
| ROA | Net profit ÷ average of current and preceding period total assets × 100; first year and missing balance values remain blank. |
| ROCE | EBIT ÷ average capital employed × 100. EBIT is PBT + Interest, with blank inputs treated as zero for this calculation. Capital employed is share capital + reserves + borrowings, with blank components treated as zero; first-year prior capital employed is set to zero in current implementation. |
| Interest coverage | (PBT + Interest) ÷ Interest; unavailable when required inputs are absent or interest is non-positive. |
| Current ratio / Cash ratio | Current ratio proxy = Other Assets ÷ Other Liabilities. Cash ratio = Cash & Bank ÷ Other Liabilities. Invalid/missing denominator remains blank. |
| Debt/equity | Borrowings ÷ (Share Capital + Reserves). |
| Current asset share | `Other Assets / Total Assets × 100` per user-selected proxy. Other special ratios use the same user-defined proxy. |
| TTM chart values | Sum of the latest four quarters; margins calculated from TTM totals, not by averaging quarterly margin percentages. |
| Three-year rolling per-share average | Average complete three-year windows first; then average all valid rolling-window averages. Any window with a missing/non-finite period is skipped. EPS's input sequence includes TTM when available; dividend/share and FCF/share use annual series. |

Some code labels retain legacy fields (such as `quickRatio`, `currentAssets`) that may not be central to the current UI. When integrating, follow the visible formulas and types actually used rather than assuming every type property is displayed.

### Bank calculations

Bank mode deliberately uses a separate type model, parser output, dashboard and chart specification.

- Interest earned = source `Sales`; interest paid = source `Interest`.
- Total revenue = Interest earned + Other Income.
- Interest gap % = 100 × (earned − paid) ÷ earned.
- Other income ratio = 100 × Other Income ÷ Interest Earned.
- Annual total expense uses the item's expense components plus Other Expenses and Interest when all required line items exist. Otherwise it derives Total Revenue − reported PBT and records which method was used.
- Quarterly total expense = Expenses + Interest.
- OPM = 100 × (Total Revenue − Total Expense) ÷ Total Revenue.
- NPM = 100 × Net Profit ÷ Total Revenue.
- Equity = Share Capital + Reserves; EPS/DPS use adjusted shares in crore.
- ROE/ROA use average equity/total assets; first year is blank without a prior balance.
- Borrowings/equity is retained as the requested bank funding ratio and is not presented as a standard bank solvency metric.
- Liquidity = 100 × Cash & Bank ÷ (Borrowings + Other Liabilities).
- FCF follows the user-specified proxy: OCF − CWIP, with blank CWIP treated as zero.
- NIM, loans/advances, deposits/CASA, NPAs/provisions and capital adequacy are not estimated when missing.

## 7. UI sections and outputs

Both modes have an overview, plots, Data Sheet and data checks areas, though the contents differ by mode.

- **Overview:** key values, metric tables, average/growth summaries, descriptive notes; no chart wall.
- **Plots:** Recharts visualizations using annual and quarterly values. Non-bank includes a TTM point in selected annual charts, separate quarterly charts and a special-analysis group. Bank plots use only bank-specific measures.
- **Data Sheet:** renders the source matrix in its original row and column order with styling; it removes a known “PLEASE DO NOT MAKE ANY CHANGES TO THIS SHEET” warning phrase from the display while retaining source values otherwise.
- **Data checks:** source coverage, warnings, missing fields and formula definitions.
- **PDF:** generated in browser through jsPDF/jsPDF-AutoTable and chart snapshots.
- **Excel:** generated in browser through ExcelJS; includes source Data Sheet, analysis tables/definitions and exported plot images on a Charts worksheet. Excel charts are embedded as chart snapshots, not native editable Excel chart objects.

## 8. Runtime and deployment facts

- Vite development server: `npm run dev`, usually `http://localhost:5173`.
- Local backend: `python backend/server.py`, listens at `127.0.0.1:8000`.
- Production build: `npm run build` creates `dist`.
- Local built-app mode: Python `server.py` serves `dist` and `/api/download` at the same origin on port 8000.
- Vercel static deployment: manual upload and browser analysis/export can work after the React app is integrated/deployed. Vite's local `/api` proxy does not exist in production.
- Render: can host the existing Python web application, but the current local `server.py` and visible-Chrome downloader should not replace or be blindly merged into the existing Render server. Adapt endpoints into the existing web framework if needed.
- There is no database or permanent upload storage in this project. Do not introduce one unless the combined product explicitly requires saved reports/accounts.

## 9. Suggested amalgamation plan

1. **Map existing project routes and build setup.** Determine whether its frontend is Vite, Next.js, React Router, etc., and identify the existing Render web framework/API entrypoint.
2. **Add a dashboard route/page** (for example `/analysis` or `/financial-dashboard`) in the existing Vercel frontend. Reuse the current dashboard source modules and install only required npm dependencies: React-compatible ExcelJS, Recharts, html2canvas, jsPDF, jspdf-autotable, lucide-react.
3. **Keep manual upload as the initial flow.** Keep `parseWorkbook.ts` and exporters client-side; don't send workbook contents to the current Render API unless the product needs it.
4. **Resolve CSS scope.** `styles.css` contains global app-level styles and may conflict with the existing product. Scope styles under a dashboard root class or carefully namespace/merge global selectors when embedding as a route.
5. **Merge shared backend only where needed.** Do not deploy a second static file server. If `/api/download` remains, add/route a compatible endpoint through the existing Render framework and set its production URL/CORS. Revisit Screener automation as a separate design because this implementation relies on local Chrome/session state.
6. **Check client routes and build config.** Ensure the existing Vercel app's route fallback handles direct refresh at the dashboard path and that browser-only APIs are called client-side (not during server rendering if the main app uses SSR).
7. **Keep data models and formula ownership clear.** Avoid recalculating the same metrics differently in Render and React. The parser is currently the source of truth for workbook-derived metrics.
8. **Test integration with one non-bank workbook and one bank workbook**, including missing values, explicit zero dividends, chart rendering, Data Sheet display, PDF, and Excel export. These checks are important because the two modes intentionally have different formulas.

## 10. Local development commands

From the `financial-dashboard` directory:

```powershell
npm install
npm run dev
```

For the optional local Screener button, install Python packages and start the local backend in another terminal:

```powershell
python -m pip install -r backend/requirements.txt
python backend/server.py
```

For the built React app locally:

```powershell
npm run build
python backend/server.py
```

The backend prints that it is available at `http://127.0.0.1:8000`. The Screener browser/profile behavior is described above; a workbook upload does not require the backend.

## 11. Short handoff statement

**Ledger is a browser-first React/TypeScript financial workbook analyzer. It supports non-bank and bank analysis from `.xlsx` files with a `Data Sheet`, calculates the chosen user-defined metrics in `src/parseWorkbook.ts`, displays responsive overview tables and Recharts plots, and exports PDF/Excel in the browser. The optional Python/Playwright component is only a local Screener export helper; it is not a production-ready Render backend. For amalgamation, integrate the React upload/dashboard flow into the existing Vercel UI first, and treat remote Screener automation as a separate backend redesign.**
