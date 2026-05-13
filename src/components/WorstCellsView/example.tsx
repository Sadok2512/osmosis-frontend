import React from "react";
import { WorstCellsView } from "./WorstCellsView";
import type { WorstCellsResponse } from "./types";

// Mock payload — illustrates the expected shape and serves as a visual smoke test.
const MOCK: WorstCellsResponse = {
  view_type: "ranked_list_with_map",
  title: "Top 5 worst cells",
  scope: { type: "region", name: "NANTES" },
  metric: {
    name: "DCR VoLTE",
    unit: "%",
    direction: "lower_is_better",
    thresholds: { critical: 9, severe: 5, warning: 2 },
  },
  map: {
    center: { lat: 47.218, lon: -1.553 },
    zoom: 12,
    bounds: { north: 47.30, south: 47.13, east: -1.40, west: -1.70 },
    healthy_sites_count: 142,
  },
  cells: [
    {
      rank: 1, cell_id: "NANTES_INDRET_ENB1_H1",
      cell_display: "Osm Naval Group", cell_tech_label: "Indret · eNB1 · H1",
      site_id: "NTE-087", coords: { lat: 47.205, lon: -1.638 },
      metric_value: 9.64, delta_vs_baseline: 9.14, vendor: "Nokia 4G",
      severity: "critical",
      drill_down_prompt: "Audit de la cellule Osm Naval Group Indret eNB1 H1",
    },
    {
      rank: 2, cell_id: "NANTES_REZE_ENB1_E2",
      cell_display: "Reze Semitan", cell_tech_label: "eNB1 · E2",
      site_id: "NTE-088", coords: { lat: 47.196, lon: -1.553 },
      metric_value: 9.35, delta_vs_baseline: 8.85, vendor: "Nokia 4G",
      severity: "critical",
      drill_down_prompt: "Audit de la cellule Reze Semitan eNB1 E2",
    },
    {
      rank: 3, cell_id: "NANTES_POMMERAYE_ENB1_V1",
      cell_display: "Ind Pdv Nantes Pommeraye", cell_tech_label: "eNB1 · V1",
      site_id: "NTE-101", coords: { lat: 47.213, lon: -1.557 },
      metric_value: 7.72, delta_vs_baseline: 7.22, vendor: "Nokia 4G",
      severity: "severe",
      drill_down_prompt: "Audit de la cellule Pommeraye eNB1 V1",
    },
    {
      rank: 4, cell_id: "NANTES_AEROPORT_ENB2_S3",
      cell_display: "Nantes Aéroport", cell_tech_label: "eNB2 · S3",
      site_id: "NTE-115", coords: { lat: 47.158, lon: -1.612 },
      metric_value: 6.41, delta_vs_baseline: 5.91, vendor: "Nokia 4G",
      severity: "severe",
      drill_down_prompt: "Audit Nantes Aéroport eNB2 S3",
    },
    {
      rank: 5, cell_id: "NANTES_CATINA_ENB1_A2",
      cell_display: "Nantes Catina", cell_tech_label: "eNB1 · A2",
      site_id: "NTE-128", coords: { lat: 47.240, lon: -1.510 },
      metric_value: 5.88, delta_vs_baseline: 5.38, vendor: "Nokia 4G",
      severity: "severe",
      drill_down_prompt: "Audit Nantes Catina eNB1 A2",
    },
  ],
  common_pattern: {
    label: "Pattern commun",
    description: "5/5 cellules Nokia 4G — investigation au niveau parc recommandée",
    severity: "warning",
    drill_down_prompt: "Investiguer profil Nokia 4G sur NANTES",
  },
  actions: [
    { label: "Top 10", prompt: "Voir top 10 worst cells DCR VoLTE NANTES", type: "prompt" },
    { label: "Export CSV", type: "export_csv" },
  ],
};

export function WorstCellsExample() {
  return (
    <div style={{ padding: 20, background: "#FAFAFA", minHeight: "100vh" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 18, marginBottom: 14 }}>WorstCellsView — exemple</h1>
        <WorstCellsView
          data={MOCK}
          onSendPrompt={p => console.log("[example] sendPrompt:", p)}
        />
      </div>
    </div>
  );
}

export default WorstCellsExample;
