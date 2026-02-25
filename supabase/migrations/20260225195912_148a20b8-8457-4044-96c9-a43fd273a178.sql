
-- Create storage bucket for RAG original files
INSERT INTO storage.buckets (id, name, public) VALUES ('rag-files', 'rag-files', true);

-- Allow public read access
CREATE POLICY "RAG files are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'rag-files');

-- Allow public insert
CREATE POLICY "RAG files are publicly insertable"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'rag-files');

-- Allow public delete
CREATE POLICY "RAG files are publicly deletable"
ON storage.objects FOR DELETE
USING (bucket_id = 'rag-files');
