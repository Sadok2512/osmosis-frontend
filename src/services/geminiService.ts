
import { CellDetails, Alert, RCAResult, TCPAnalyticsData, KPIType } from "../types";

// Mock Gemini service — returns realistic simulated RCA responses.
// To enable real AI, connect Lovable Cloud and add a Gemini edge function.

export const getCellRCA = async (cellDetails: CellDetails): Promise<string> => {
  await new Promise(r => setTimeout(r, 1200));
  
  const { kpi } = cellDetails;
  const issues: string[] = [];
  
  if (kpi.dms_dl_30 < 50) issues.push(`DMS DL ≥30 Mbps compliance is critically low at ${kpi.dms_dl_30.toFixed(0)}%, indicating insufficient throughput capacity`);
  if (kpi.p95_rtt_ms > 40) issues.push(`elevated P95 RTT of ${kpi.p95_rtt_ms.toFixed(0)}ms suggests backhaul congestion or suboptimal routing`);
  if (kpi.loss_dn_sum > 0.03) issues.push(`downstream loss rate of ${(kpi.loss_dn_sum * 100).toFixed(1)}% points to radio layer interference`);
  if (kpi.windowfull_dn_sum > 1) issues.push(`window full ratio of ${kpi.windowfull_dn_sum.toFixed(1)}% indicates TCP-level congestion, likely due to receiver-side bottleneck`);
  
  if (issues.length === 0) {
    return `Cell ${cellDetails.cell.cell_id} (${cellDetails.cell.techno}) operates within nominal parameters. QoE score of ${kpi.qoe_score_avg.toFixed(1)}% is satisfactory with all DMS thresholds met.`;
  }
  
  return `Root cause analysis for ${cellDetails.cell.cell_id} (${cellDetails.cell.techno}): ${issues.join('. ')}. Recommended action: prioritize ${kpi.dms_dl_30 < 50 ? 'capacity expansion' : 'network optimization'} for this cell.`;
};

export const getTCPRCA = async (data: TCPAnalyticsData, selectedMetric: KPIType): Promise<RCAResult> => {
  await new Promise(r => setTimeout(r, 1500));
  
  const rootCauses = ['Radio congestion', 'Backhaul saturation', 'Core routing issue', 'CDN performance', 'Device mix impact'];
  const selectedCause = rootCauses[Math.floor(Math.random() * rootCauses.length)];
  
  return {
    root_cause_class: selectedCause,
    summary: [
      `TCP congestion index at ${data.congestion_index}/100 indicates ${data.congestion_index > 60 ? 'significant' : 'moderate'} network stress.`,
      `Primary contributor: ${selectedCause.toLowerCase()} affecting ${selectedMetric} metric.`,
      `Impact concentrated on ${data.cards.find(c => c.status !== 'Nominal')?.label || 'multiple'} indicators.`
    ],
    evidence: [
      `${data.cards[0]?.label}: ${data.cards[0]?.value}% (${data.cards[0]?.delta > 0 ? '+' : ''}${data.cards[0]?.delta}% vs baseline)`,
      `Impacted sessions: ${data.cards.reduce((a, c) => a + c.impacted_sessions, 0).toLocaleString()} / ${data.cards[0]?.total_sessions.toLocaleString()}`,
      `Congestion pattern consistent with ${selectedCause.toLowerCase()} degradation profile`
    ],
    recommended_actions: [
      `Monitor ${selectedMetric} trend over next 48h for persistence`,
      `Verify ${selectedCause.toLowerCase()} capacity and utilization levels`,
      `Cross-reference with radio KPIs to isolate root cause layer`,
      `Escalate to ${selectedCause.includes('Radio') ? 'RAN' : 'transport'} team if degradation persists`
    ],
    confidence: 0.72 + Math.random() * 0.2
  };
};

export const getAlertRCA = async (alert: Alert): Promise<RCAResult> => {
  await new Promise(r => setTimeout(r, 1500));
  
  const isDMSRelated = alert.primary_kpi.toLowerCase().includes('dms');
  const rootCause = isDMSRelated ? 'Regulatory compliance breach' : 
    alert.delta_pct < -20 ? 'Sudden capacity degradation' : 'Progressive performance erosion';
  
  return {
    root_cause_class: rootCause,
    summary: [
      `${alert.scope_type} ${alert.scope_name}: ${alert.primary_kpi} dropped ${Math.abs(alert.delta_pct).toFixed(0)}% from baseline ${alert.baseline} to ${alert.current}.`,
      `Anomaly score of ${alert.anomaly_score.toFixed(1)} with ${(alert.confidence * 100).toFixed(0)}% confidence indicates ${alert.anomaly_score > 7 ? 'critical' : 'notable'} deviation.`,
      isDMSRelated ? 'DMS regulatory threshold breach detected — immediate action required per ARCEP compliance.' : 'QoE degradation pattern suggests infrastructure-level issue.'
    ],
    evidence: [
      `Baseline: ${alert.baseline}, Current: ${alert.current} (Δ ${alert.delta_pct.toFixed(1)}%)`,
      `Anomaly score: ${alert.anomaly_score.toFixed(1)}/10`,
      `Detection confidence: ${(alert.confidence * 100).toFixed(0)}%`,
      ...Object.entries(alert.evidence_signals).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    ],
    recommended_actions: [
      `Acknowledge alert and begin investigation within ${alert.severity === 'CRITIQUE' ? '1h' : '4h'}`,
      `Check correlated alerts on adjacent cells/sites`,
      isDMSRelated ? 'Prepare ARCEP compliance report with mitigation timeline' : 'Review capacity planning for affected scope',
      `Schedule post-incident review after resolution`
    ],
    confidence: alert.confidence
  };
};
