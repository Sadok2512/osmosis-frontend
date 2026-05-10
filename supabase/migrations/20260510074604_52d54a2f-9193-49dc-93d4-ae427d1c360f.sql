-- 1. Add visibility column
ALTER TABLE public.investigators
ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
CHECK (visibility IN ('private','public'));

CREATE INDEX IF NOT EXISTS idx_investigators_visibility ON public.investigators(visibility);