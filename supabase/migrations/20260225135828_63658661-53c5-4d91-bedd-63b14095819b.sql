CREATE TABLE IF NOT EXISTS public.qoe_metrics (
  id BIGSERIAL PRIMARY KEY,
  cell_id TEXT NOT NULL,
  site_id TEXT,
  dt DATE NOT NULL,
  service TEXT NOT NULL DEFAULT 'ALL',
  techno TEXT,
  bande TEXT,
  qoe_score_avg DOUBLE PRECISION,
  p50_thr_dn_mbps DOUBLE PRECISION,
  p50_thr_up_mbps DOUBLE PRECISION,
  p95_rtt_ms DOUBLE PRECISION,
  dms_dl_3 DOUBLE PRECISION,
  dms_dl_8 DOUBLE PRECISION,
  dms_dl_30 DOUBLE PRECISION,
  dms_ul_3 DOUBLE PRECISION,
  loss_dn_sum DOUBLE PRECISION,
  traffic_dn_bytes DOUBLE PRECISION,
  traffic_up_bytes DOUBLE PRECISION,
  sessions INTEGER,
  window_full_ratio DOUBLE PRECISION,
  retransmission_rate DOUBLE PRECISION,
  tcp_loss_rate DOUBLE PRECISION,
  out_of_order_rate DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cell_id, dt, service)
);

CREATE INDEX IF NOT EXISTS idx_qoe_cell_dt ON public.qoe_metrics(cell_id, dt);
CREATE INDEX IF NOT EXISTS idx_qoe_dt ON public.qoe_metrics(dt);
CREATE INDEX IF NOT EXISTS idx_qoe_service ON public.qoe_metrics(service);

ALTER TABLE public.qoe_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "QoE metrics are publicly readable" ON public.qoe_metrics FOR SELECT USING (true);
CREATE POLICY "QoE metrics are publicly insertable" ON public.qoe_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "QoE metrics are publicly updatable" ON public.qoe_metrics FOR UPDATE USING (true);
CREATE POLICY "QoE metrics are publicly deletable" ON public.qoe_metrics FOR DELETE USING (true);