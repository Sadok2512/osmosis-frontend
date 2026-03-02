CREATE TABLE IF NOT EXISTS public.parameter_dump (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dn text,
    cell_dn text,
    cell_name text,
    site_name text,
    parameter text NOT NULL,
    value text,
    version text,
    vendor text,
    mrbts_id integer,
    enodeb_id integer,
    gnodeb_id integer,
    bande text,
    freq_downlink double precision,
    tgv integer,
    latitude double precision,
    longitude double precision,
    city text,
    dr text,
    ur text,
    dor text,
    plaque text,
    omc text,
    zone_arcep text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.parameter_dump ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parameter_dump publicly readable" ON public.parameter_dump FOR SELECT USING (true);
CREATE POLICY "parameter_dump publicly insertable" ON public.parameter_dump FOR INSERT WITH CHECK (true);
CREATE POLICY "parameter_dump publicly updatable" ON public.parameter_dump FOR UPDATE USING (true);
CREATE POLICY "parameter_dump publicly deletable" ON public.parameter_dump FOR DELETE USING (true);