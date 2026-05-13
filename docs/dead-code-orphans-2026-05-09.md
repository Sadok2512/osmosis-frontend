# Orphan files — `osmosis-frontend/src` audit · 2026-05-09

**Method:** scan every `.ts`/`.tsx` under `src/`, derive its possible
import specifiers (relative + `@/` alias, with/without ext, with/without
`/index` suffix), and flag any file that no other source file imports.
Excluded from the orphan check: entry points (`main.tsx`, `App.tsx`,
`vite-env.d.ts`), folder index files, test files, type declaration
files, and files referenced from build configs (e.g. `vitest.config.ts`
→ `src/test/setup.ts`).

**Result:** 353 source files scanned · **63 orphans** · ~13 200 lines
of dead code.

> ⚠️ A handful of orphans may still be reached via lazy imports built
> from template literals or via webpack-style bare aliases. The list
> below is a starting point — review before bulk-deleting.

---

## Summary by module

| Module | Orphan files | Lines | Notes |
|---|---:|---:|---|
| `kpi-monitor` | 19 | 5 382 | Largest payoff. Mostly old workspace/widget variants superseded by `KpiReferenceWorkspace2`. |
| `ui` (shadcn) | 18 | 2 137 | shadcn primitives never wired to a screen. Safe to drop. |
| `otarie` | 8 | 1 766 | Old QoE/RCA panels + a duplicate `SiteFilterModal` (live one is in `sites-monitor/`). |
| `documentation` | 3 | 1 207 | Wizard fragments not referenced by `DocumentationPage` or `ClusterBuilderWizard`. |
| `hooks` | 3 | 208 | `useLOSComputation`, `useSites`, `useTopologyConfig` not consumed anywhere. |
| `precision-architect` | 2 | 501 | `StatSettingsPanel` (older, replaced by namesake under `components/`); `TableWidget` superseded by `PATableWidget`. |
| `pages` | 2 | 280 | `AdminLogin.tsx`, `AdminPanel.tsx` — replaced by SPA UserLogin + BackendAdmin. |
| `bi`, `investigator`, `pm-dashboard`, `sentinel`, `services`, `shared`, `types` | 7 | 1 580 | One file each, see detail. |
| `components/NavLink.tsx` | 1 | 28 | Legacy router link, not used. |

**Total: 63 files · ~13.1 k lines.**

---

## Detail (line counts in front)

### `kpi-monitor/` — 19 files / 5 382 lines

These are all earlier versions of the workspace/widget panels. The
live page is `KpiReferenceWorkspace2.tsx`; everything below is the
v1 generation that no other module imports.

```
 14  KpiMonitorWorkspace.tsx
 14  mockKpiData.ts
 63  KPITableView.tsx
 74  AxesPopover.tsx
 89  SummaryTilesRow.tsx
102  GraphPopover.tsx
109  WidgetExplainPanel.tsx
131  D3EmptyState.tsx
146  KPIExplainPanel.tsx
231  PremiumGraphCard.tsx
262  DashboardConfigPanel.tsx
280  KPICatalogImport.tsx
398  GlobalFilterBar.tsx
417  KpiWidgetConfigPanel.tsx
429  CounterSelectorModal.tsx
495  D3TimeSeries.tsx
559  EChartsTimeSeries.tsx
734  KpiReferenceWorkspace.tsx     ← v1 superseded by KpiReferenceWorkspace2
835  InlineGraphConfig.tsx
```

### `ui/` — 18 files / 2 137 lines

shadcn primitives generated at scaffold time but never wired to a
screen. Safe to delete; if a future feature needs one, `shadcn-ui add`
brings it back in seconds.

```
  3  use-toast.ts
  5  aspect-ratio.tsx
  9  collapsible.tsx
 27  hover-card.tsx
 36  radio-group.tsx
 37  resizable.tsx
 38  avatar.tsx
 43  alert.tsx
 61  input-otp.tsx
 81  pagination.tsx
 87  drawer.tsx
 90  breadcrumb.tsx
120  navigation-menu.tsx
129  form.tsx
207  menubar.tsx
224  carousel.tsx
303  chart.tsx
637  sidebar.tsx                   ← shadcn sidebar; otarie has its own AppSidebar
```

### `otarie/` — 8 files / 1 766 lines

```
136  TrafficTypes.tsx              ← old type module, no consumers
139  map/topoStats.ts
150  QoEChart.tsx
160  map/mapColors.ts
216  CellHistogramPanel.tsx
248  AlertsRCA.tsx                 ← case 'alerts': returns null; never rendered
330  ParametersPage.tsx            ← live one is parameter-hub/ParameterHubPage
387  SiteFilterModal.tsx           ← duplicate of sites-monitor/CreateViewModal flow
```

### `documentation/` — 3 files / 1 207 lines

```
331  TopologyStep.tsx
367  KpiDetailPanel.tsx
509  CreateFilterWizard.tsx
```

### `hooks/` — 3 files / 208 lines

```
 25  useSites.ts
 27  useLOSComputation.ts
156  useTopologyConfig.ts
```

### `precision-architect/` — 2 files / 501 lines

```
 50  components/TableWidget.tsx        ← superseded by PATableWidget
451  components/StatSettingsPanel.tsx  ← superseded by the kpi-monitor namesake
```

### `pages/` — 2 files / 280 lines

```
129  AdminLogin.tsx                ← replaced by /login → UserLogin
151  AdminPanel.tsx                ← replaced by otarie/BackendAdmin tab
```

### One-offs

```
 28  src/components/NavLink.tsx
150  src/components/bi/BIChartCard.tsx
183  src/components/investigator/KPIFormulaCards.tsx
281  src/components/sentinel/pages/SentinelTemporal.tsx
442  src/components/shared/CrashRepro.tsx        ← dev-only crash reproducer
445  src/components/pm-dashboard/PmLiveMonitor.tsx
 81  src/services/geminiService.ts                ← unused Gemini client
 94  src/types/contextOnDemand.ts
```

---

## Recommended action

Bulk-delete in **3 staged commits** so each is independently revertable:

| Stage | Scope | Files | Lines | Risk |
|---|---|---:|---:|---|
| **1** | `ui/` orphans (shadcn primitives) | 18 | 2 137 | None — easily restored via `shadcn-ui add` |
| **2** | `kpi-monitor/` v1 workspace + widgets | 19 | 5 382 | Low — `KpiReferenceWorkspace2` replaces them, but spot-check `KpiWidgetConfigPanel` and `CounterSelectorModal` since their names are similar to live files |
| **3** | The rest (otarie, hooks, pages, etc.) | 26 | ~5 700 | Low–medium — requires a TypeScript build pass to confirm nothing breaks |

After each stage: `tsc --noEmit && vite build` to confirm the build
still passes; if it fails, the stage is reverted and the regression
is investigated.

---

## What I want from you before deleting

Pick one:

- **(A)** "go" — I run all three stages back-to-back, with a build
  check between each. Total cleanup ~13 100 lines.
- **(B)** "stage 1 only" — I drop only the shadcn UI orphans (safest,
  ~2 100 lines) and stop.
- **(C)** "give me the file list, I'll review" — I paste the 63 paths
  for manual review, no deletions.
