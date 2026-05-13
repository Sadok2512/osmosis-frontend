# WorstCellsView

Composant React pour afficher un classement « Top N worst cells » avec carte SVG + tableau pro + footer pattern, dans le chat OSMOSIS.

## Usage standalone

```tsx
import { WorstCellsView } from "@/components/WorstCellsView";

<WorstCellsView
  data={payload}
  onSendPrompt={text => mySendChatMessage(text)}
/>
```

Props :
- `data` : payload `WorstCellsResponse` (cf. `types.ts`)
- `onSendPrompt` : optionnel, fonction appelée quand l'utilisateur clique sur un drill-down (marker map, bouton `→` ligne table, action toolbar, footer pattern)

## Wiring dans le chat OSMOSIS

L'agent OSMOSIS émet un bloc fenced ` ```worst_cells ` contenant le JSON.
`parseVisualizationBlocks()` reconnaît le bloc, `AIAssistantPage` rend
`<WorstCellsView>` automatiquement (au-dessus du KitAgentResponse).

Pour que l'agent émette ce bloc, le system prompt doit contenir une règle
explicite : « pour un top N de cellules dégradées, émets ` ```worst_cells `
JSON conforme au schéma ci-dessous ». Schéma backend miroir : voir `types.ts`.

## Exemple visuel

Une page de démo standalone est dans `example.tsx` — importable :

```tsx
import { WorstCellsExample } from "@/components/WorstCellsView/example";
<WorstCellsExample />
```

## Design system

- Pas de Tailwind (CSS-in-JS inline + variables CSS)
- Pas de shadow, pas de gradient
- Couleurs sévérité : critical/severe/warning/success/info — alignées avec le kit `osmosis-ui-kit/lib/theme.ts`
- Font mono pour IDs techniques (`SF Mono`, `Menlo`)
- Animations Framer Motion ≤ 0.3s

## Accessibilité

- `<table>` HTML sémantique (`<thead>`, `<tbody>`, `<th scope>`)
- `aria-label` sur boutons et markers SVG
- Tabulation logique
- Pas d'absolute hardcoded — responsive via `overflow-x: auto` sur le wrapper
