
CREATE TABLE public.dump_parameter (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dn text,
  enodeb_id integer,
  mrbts_id integer,
  gnodeb_id integer,
  cell_dn text,
  cell_name text,
  vendor text,
  dor text,
  omc text,
  plaque text,
  longitude double precision,
  latitude double precision,
  site_name text,
  freq_downlink double precision,
  bande text,
  ur text,
  dr text,
  zone_arcep text,
  tgv integer,
  city text,
  parameter text NOT NULL,
  version text,
  value text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.dump_parameter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dump_parameter publicly readable" ON public.dump_parameter FOR SELECT USING (true);
CREATE POLICY "dump_parameter publicly insertable" ON public.dump_parameter FOR INSERT WITH CHECK (true);
CREATE POLICY "dump_parameter publicly updatable" ON public.dump_parameter FOR UPDATE USING (true);
CREATE POLICY "dump_parameter publicly deletable" ON public.dump_parameter FOR DELETE USING (true);
