import React, { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, Trash2, Database, Loader2, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RAGFile {
  filename: string;
  chunks: number;
  created_at: string;
}

const RAGManager: React.FC = () => {
  const [files, setFiles] = useState<RAGFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('rag-embed', {
        body: { action: 'list' },
      });
      if (error) throw error;
      setFiles(data?.files || []);
    } catch (e) {
      console.error('Failed to fetch RAG files:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const getDownloadUrl = (filename: string) => {
    const { data } = supabase.storage.from('rag-files').getPublicUrl(filename);
    return data?.publicUrl || '';
  };

  const BINARY_EXTENSIONS = ['pptx', 'docx', 'xlsx'];
  
  const processFile = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const isBinary = BINARY_EXTENSIONS.includes(ext);

    setUploading(true);
    try {
      // Upload original file to storage
      const { error: storageError } = await supabase.storage
        .from('rag-files')
        .upload(file.name, file, { upsert: true });
      if (storageError) {
        console.warn('Storage upload warning:', storageError.message);
      }

      let body: Record<string, string>;

      if (isBinary) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        body = { filename: file.name, base64 };
      } else {
        const text = await file.text();
        if (!text.trim()) {
          toast.error(`Le fichier ${file.name} est vide`);
          setUploading(false);
          return;
        }
        body = { filename: file.name, content: text };
      }

      const { data, error } = await supabase.functions.invoke('rag-embed', { body });
      if (error) throw error;
      toast.success(`${file.name} indexé : ${data.chunks} chunks créés`);
      fetchFiles();
    } catch (e: any) {
      toast.error(`Erreur: ${e.message || 'Upload échoué'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      await processFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    for (const file of Array.from(e.dataTransfer.files)) {
      await processFile(file);
    }
  };

  const deleteFile = async (filename: string) => {
    try {
      // Delete from storage too
      await supabase.storage.from('rag-files').remove([filename]);
      await supabase.functions.invoke('rag-embed', {
        body: { action: 'delete', filename },
      });
      toast.success(`${filename} supprimé`);
      fetchFiles();
    } catch (e: any) {
      toast.error(`Erreur: ${e.message}`);
    }
  };

  const getFileExtBadge = (filename: string) => {
    const ext = filename.split('.').pop()?.toUpperCase() || '?';
    const colors: Record<string, string> = {
      PPTX: 'bg-orange-500/10 text-orange-600',
      DOCX: 'bg-blue-500/10 text-blue-600',
      XLSX: 'bg-green-500/10 text-green-600',
      CSV: 'bg-emerald-500/10 text-emerald-600',
      TXT: 'bg-muted text-muted-foreground',
      MD: 'bg-muted text-muted-foreground',
      JSON: 'bg-yellow-500/10 text-yellow-600',
      XML: 'bg-purple-500/10 text-purple-600',
    };
    return (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors[ext] || 'bg-muted text-muted-foreground'}`}>
        {ext}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-auto">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">RAG Knowledge Base</h1>
            <p className="text-sm text-muted-foreground">Importez des documents pour enrichir l'assistant IA</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6 max-w-4xl">
        {/* Upload Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
            dragOver
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : 'border-border hover:border-primary/50 hover:bg-muted/30'
          }`}
        >
          <input
            type="file"
            multiple
            accept=".txt,.md,.csv,.json,.xml,.log,.html,.css,.js,.ts,.py,.pptx,.docx,.xlsx"
            onChange={handleFileInput}
            className="absolute inset-0 opacity-0 cursor-pointer"
            disabled={uploading}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm font-medium text-foreground">Indexation en cours...</p>
              <p className="text-xs text-muted-foreground">Découpage et embedding des chunks</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Glissez vos fichiers ici ou <span className="text-primary underline">parcourez</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Formats supportés : TXT, MD, CSV, JSON, XML, PPTX, DOCX, XLSX
              </p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-2xl font-bold text-foreground">{files.length}</p>
            <p className="text-xs text-muted-foreground">Documents indexés</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-2xl font-bold text-foreground">
              {files.reduce((s, f) => s + f.chunks, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Chunks totaux</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <p className="text-sm font-medium text-foreground">pgvector actif</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Recherche sémantique</p>
          </div>
        </div>

        {/* File List */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Documents indexés</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Chargement...</span>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucun document indexé</p>
              <p className="text-xs mt-1">Uploadez des fichiers pour commencer</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div
                  key={f.filename}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 group hover:border-primary/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-primary/70" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{f.filename}</p>
                        {getFileExtBadge(f.filename)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {f.chunks} chunks • {new Date(f.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={getDownloadUrl(f.filename)}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={f.filename}
                      className="p-2 rounded-lg hover:bg-primary/10 text-primary opacity-0 group-hover:opacity-100 transition-all"
                      title="Télécharger le document original"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => deleteFile(f.filename)}
                      className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Comment fonctionne le RAG ?</p>
            <p>Les documents sont découpés en chunks, enrichis de mots-clés par IA, puis stockés avec des embeddings vectoriels dans pgvector. L'assistant QOEBIT peut ensuite chercher dans cette base pour enrichir ses réponses. Les fichiers originaux sont conservés et téléchargeables.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RAGManager;
