

# OTARIE — Telecom QoE Monitoring Dashboard

Rebuild your existing OTARIE application as a fully functional Lovable project with mock data, preserving all 9 views and the navigation structure.

## 1. Foundation & Data Layer
- Set up TypeScript types, constants, and a mock data service generating realistic telecom KPI data (sites, cells, time series, alerts, TCP metrics, etc.)
- No backend needed initially — all data will be generated client-side with realistic distributions

## 2. Navigation & Layout
- **Collapsible sidebar** with icon-based navigation across all views: Sites List, Map, Global Dashboard, Advanced Analytics (BI), Radio & Mobility, Traffic Types, Subscriber Experience, Alerts & RCA, Detector Console
- **Global filters bar** (date range, KPI, RAT, vendor, DOR, department, plaque) persisted across views
- Dark/light theme toggle

## 3. Sites List + Map View (Main View)
- **Left panel**: Searchable, filterable site inventory with expandable cards showing cell-level drill-down (sector grid with QoE color indicators)
- **Center**: Interactive map displaying cell locations with color-coded markers by selected KPI. Includes layer toggles (cells, sites, heatmap, sectors)
- **Right panel**: Cell detail dashboard (slides in on cell selection) with KPI summary cards, time-series chart, and tech breakdown

## 4. Global Dashboard
- Network-wide KPI cards (QoE score, DMS metrics, throughput, latency, sessions)
- Multi-KPI time-series charts with milestone markers and threshold lines
- Distribution charts (vendor breakdown, technology split, regional heatmap)

## 5. Advanced Analytics (BI Explorer)
- Flexible chart builder: choose X-axis KPI, Y-axis metrics, aggregation level, chart type (line, bar, area, scatter, stacked bar, table)
- Color-by and size-by dimensions for scatter plots
- Dynamic filter overrides per query

## 6. Radio & Mobility View
- Handover success rates and inter-RAT mobility analysis
- Mobility impact on QoE visualization
- Technology distribution breakdown (5G/4G/3G)

## 7. Traffic Types View
- Traffic breakdown by application type (streaming, gaming, web, social)
- Volume and session distribution charts
- Loss rate comparison across traffic categories

## 8. Subscriber Experience View
- Individual subscriber session timeline
- Session-level diagnostics (RTT, loss, status)
- Top application usage and global QoE per subscriber

## 9. Alerts & Root Cause Analysis
- Alert feed with severity levels (CRITIQUE, ELEVEE, MOYENNE, FAIBLE)
- Alert status management (NEW, ACK, RESOLVED, FALSE_POSITIVE)
- RCA results panel showing root cause, evidence, confidence score, and recommended actions

## 10. Detector Console
- Anomaly detector configuration panel
- List of detectors with enable/toggle, feature selection, and method config
- Last run status and detection history

## Design Style
- Clean, professional dark-on-light design with the existing slate/blue color palette
- Rounded cards (2rem radius), bold uppercase micro-labels, color-coded KPI indicators
- Smooth animations (slide-in panels, expand/collapse transitions)
- Recharts for all charting (converting from Chart.js) since it's already installed
- Simplified map view using styled div markers (no Leaflet dependency needed initially)

