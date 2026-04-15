---
name: Apply-only backend execution
description: Aucune requête backend de données ni mise à jour du graphe/table ne doit se déclencher sans clic explicite sur Appliquer.
type: constraint
---
**Règle stricte** : tout changement de configuration (filtres, dates, sélection KPI/compteurs, granularité, split, ou tout autre paramètre) doit rester en état « pending » jusqu'au clic sur **Appliquer**.

Interdit :
- Auto-fetch de timeseries, counters, KPI compute, worst cells, breakdown, ou histogramme sur changement de config
- Auto-fetch de `fetchKpiDimensions`, `pm/counters/dimension-values`, ou `fetchKpisWithData` sur changement de filtres/KPIs
- Reset du graphe ou de la vue table avant clic Appliquer

Autorisé au montage uniquement (une seule fois) :
- Chargement du catalogue KPI (liste des KPIs disponibles)
- Chargement du catalogue de compteurs
- Chargement des options de split/filtre (dimensions disponibles)
- Chargement des valeurs de filtres statiques (DOR, PLAQUE, BAND) via le filter cache

**Seule exception** : le drill-down (`inst.name.startsWith('Drill:')`) peut déclencher un auto-apply unique au premier montage.
