
-- Drop existing parameter_dump table and recreate with new schema
DROP TABLE IF EXISTS public.parameter_dump;

CREATE TABLE public.parameter_dump (
    dn            text,
    cell_dn       text,
    cell_name     text,
    site_name     text,
    parameter     text NOT NULL,
    value         text,
    version       text,
    vendor        text,
    netact        text,
    mrbts_id      integer,
    enodeb_id     integer,
    gnodeb_id     integer,
    bande         text,
    latitude      double precision,
    longitude     double precision,
    dor           text,
    plaque        text,
    zone_arcep    text
);

-- Re-enable RLS
ALTER TABLE public.parameter_dump ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parameter_dump publicly readable" ON public.parameter_dump FOR SELECT USING (true);
CREATE POLICY "parameter_dump publicly insertable" ON public.parameter_dump FOR INSERT WITH CHECK (true);
CREATE POLICY "parameter_dump publicly updatable" ON public.parameter_dump FOR UPDATE USING (true);
CREATE POLICY "parameter_dump publicly deletable" ON public.parameter_dump FOR DELETE USING (true);
