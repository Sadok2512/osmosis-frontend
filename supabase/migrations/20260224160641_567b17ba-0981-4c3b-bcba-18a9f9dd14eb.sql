
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create RAG documents table
CREATE TABLE public.rag_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding vector(768),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;

-- Public read/write for now (no auth in this app)
CREATE POLICY "RAG documents are publicly readable" ON public.rag_documents FOR SELECT USING (true);
CREATE POLICY "RAG documents are publicly insertable" ON public.rag_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "RAG documents are publicly deletable" ON public.rag_documents FOR DELETE USING (true);

-- Create similarity search function
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  filename TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rd.id,
    rd.filename,
    rd.content,
    1 - (rd.embedding <=> query_embedding) AS similarity
  FROM public.rag_documents rd
  WHERE rd.embedding IS NOT NULL
    AND 1 - (rd.embedding <=> query_embedding) > match_threshold
  ORDER BY rd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
