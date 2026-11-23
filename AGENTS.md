<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (StockVision AI)

- Market data comes only from `src/lib/market/*.server.ts` via server functions in `src/lib/market.functions.ts`; never call the provider from the browser (keeps headers/host fallback server-side and avoids CORS).
- Live/delayed/unavailable labeling is decided solely by `deriveDataStatus` in `src/lib/market/status.ts`; "live" requires a provider flagged real-time, so swapping providers only means flipping that flag.
- All technical analysis (`src/lib/analysis/`) is pure and deterministic, shared by the browser and the AI server function, so the chart, panels and AI see identical detections.
- The AI assessment re-fetches data and recomputes analysis on the server, and drops any AI-cited price not matching a computed level (`filterGroundedLevels`), so the model cannot invent prices.
- Chart code (`PriceChart.tsx`) imports lightweight-charts and must stay behind `React.lazy` + `<ClientOnly>`; chart colors are read from CSS tokens at runtime.
- Market data is fetched client-side with React Query (no route loader) because the router has no SSR query dehydration; a loader prefetch caused hydration mismatches.
- Buy/sell alerts use the rule-based consensus (`src/lib/alerts/rules.ts`) on completed bars only, never the AI, so alerts are deterministic and free; they are checked in the browser while a tab is open and stored in localStorage because the app has no accounts.
