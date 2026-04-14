import { useEffect, useState, useCallback } from "react";
import { getVpsProxyUrl } from "@/lib/apiConfig";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  FileText,
  AlertTriangle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FileLog {
  id: number;
  file_name: string;
  status: "pending" | "processing" | "done" | "failed";
  rows_inserted: number;
  file_size: number | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
}

interface ServiceData {
  status: string;
  last_run_at: string | null;
  files_today: number;
  errors_today: number;
  error_message: string | null;
  is_enabled?: boolean;
}

interface Summary {
  total_done: number;
  total_failed: number;
  total_processing: number;
  total_pending?: number;
  total_rows_inserted: number;
}

interface ProgressData {
  service: ServiceData | null;
  summary: Summary;
  files: FileLog[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatSize(bytes: number | null) {
  if (!bytes) return "--";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function formatDuration(start: string | null, end: string | null) {
  if (!start) return "--";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.round((e - s) / 1000);
  if (diff < 0) return "--";
  if (diff < 60) return diff + "s";
  return Math.floor(diff / 60) + "m " + (diff % 60) + "s";
}

function formatTs(ts: string | null) {
  if (!ts) return "--";
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) +
      " " +
      d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts.substring(0, 16);
  }
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  processing: <Loader2 className="w-3.5 h-3.5 text-yellow-500 animate-spin" />,
  pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
};

const STATUS_BADGE: Record<string, string> = {
  done: "bg-green-500/15 text-green-400 border-green-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  processing: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  pending: "bg-muted text-muted-foreground border-border",
};

/* ------------------------------------------------------------------ */
/*  Vendors                                                            */
/* ------------------------------------------------------------------ */

const VENDORS = [
  { value: "nokia",    label: "Nokia" },
  { value: "ericsson", label: "Ericsson" },
  { value: "huawei",   label: "Huawei" },
  { value: "samsung",  label: "Samsung" },
  { value: "zte",      label: "ZTE" },
] as const;

const RAT_OPTIONS = [
  { value: "",    label: "All RATs" },
  { value: "2g",  label: "2G (GSM)" },
  { value: "3g",  label: "3G (UMTS)" },
  { value: "4g",  label: "4G (LTE)" },
  { value: "5g",  label: "5G (NR)" },
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  defaultVendor?: string;
}

export function PmLiveMonitor({ defaultVendor = "nokia" }: Props) {
  const [vendor, setVendor] = useState(defaultVendor);
  const [rat, setRat] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(false);

  /* ── Fetch ── */
  const fetchProgress = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status_filter = statusFilter;
      const url = getVpsProxyUrl("parser", `/api/v1/pm/${vendor}/progress`, params);
      const r = await fetch(url);
      if (!r.ok) return;
      const d: ProgressData = await r.json();
      setData(d);
    } catch {
      /* ignore */
    }
  }, [vendor, statusFilter]);

  /* ── Poll every 4s ── */
  useEffect(() => {
    setLoading(true);
    fetchProgress().finally(() => setLoading(false));
    const timer = setInterval(fetchProgress, 4000);
    return () => clearInterval(timer);
  }, [fetchProgress]);

  /* ── Derived state ── */
  const svc = data?.service;
  const sum = data?.summary ?? { total_done: 0, total_failed: 0, total_processing: 0, total_rows_inserted: 0, total_pending: 0 };
  const errCount = sum.total_failed + sum.total_processing;

  let displayStatus = "READY";
  let statusColor = "text-blue-400";
  let badgeCls = "bg-blue-500/15 text-blue-400 border-blue-500/30";

  if (!svc) {
    displayStatus = "OFFLINE";
    statusColor = "text-muted-foreground";
    badgeCls = "bg-muted text-muted-foreground border-border";
  } else if (svc.status === "running" || sum.total_processing > 0) {
    displayStatus = "RUNNING";
    statusColor = "text-green-400";
    badgeCls = "bg-green-500/15 text-green-400 border-green-500/30";
  } else if (svc.status === "error") {
    displayStatus = "ERROR";
    statusColor = "text-red-400";
    badgeCls = "bg-red-500/15 text-red-400 border-red-500/30";
  } else if ((sum.total_pending ?? 0) > 0) {
    displayStatus = "PENDING";
    statusColor = "text-yellow-400";
    badgeCls = "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  }

  /* ── Filter files client-side ── */
  let files = data?.files ?? [];
  if (dateFilter) {
    files = files.filter((f) => {
      const ts = f.started_at || f.finished_at || "";
      return ts.startsWith(dateFilter);
    });
  }
  // RAT filter: match filename patterns like _2G_, _3G_, _LTE_, _NR_
  if (rat) {
    const ratPatterns: Record<string, RegExp> = {
      "2g": /[_.](?:2[Gg]|GSM|BSC)/i,
      "3g": /[_.](?:3[Gg]|UMTS|WCDMA|RNC)/i,
      "4g": /[_.](?:4[Gg]|LTE|eNB|LNBTS)/i,
      "5g": /[_.](?:5[Gg]|NR|gNB|NRBTS)/i,
    };
    const re = ratPatterns[rat];
    if (re) files = files.filter((f) => re.test(f.file_name));
  }

  /* ── Retry handler ── */
  const retryFailed = async () => {
    try {
      const url = getVpsProxyUrl("parser", `/api/v1/pm/${vendor}/retry-failed`);
      await fetch(url, { method: "POST" });
      setTimeout(fetchProgress, 1000);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      {/* ── Vendor + RAT selector ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Vendor</span>
          <div className="flex gap-1">
            {VENDORS.map((v) => (
              <button
                key={v.value}
                onClick={() => { setVendor(v.value); setData(null); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  vendor === v.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground font-medium">RAT</span>
          <Select value={rat} onValueChange={setRat}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue placeholder="All RATs" />
            </SelectTrigger>
            <SelectContent>
              {RAT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value || "_all"}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Status cards ── */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-[11px] text-muted-foreground mb-1">Status</div>
          <div className={`text-base font-bold ${statusColor}`}>
            {displayStatus}
          </div>
          {svc?.status === "running" && (
            <Loader2 className="w-3 h-3 animate-spin mx-auto mt-1 text-green-400" />
          )}
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-[11px] text-muted-foreground mb-1">Files Processed</div>
          <div className="text-base font-bold text-green-400">{sum.total_done}</div>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-[11px] text-muted-foreground mb-1">Rows Inserted</div>
          <div className="text-base font-bold text-blue-400">
            {sum.total_rows_inserted.toLocaleString()}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-[11px] text-muted-foreground mb-1">Errors</div>
          <div className="text-base font-bold text-red-400">{sum.total_failed}</div>
        </div>
      </div>

      {/* ── Service message ── */}
      {svc?.error_message && (
        <div className="bg-card border rounded-md px-3 py-2 text-xs text-muted-foreground font-mono">
          {svc.error_message}
        </div>
      )}

      {/* ── Badge + Filters ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={badgeCls}>
          {displayStatus === "RUNNING" ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Activity className="w-3 h-3 mr-1" />
          )}
          {vendor.charAt(0).toUpperCase() + vendor.slice(1)} PM
        </Badge>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-7 text-xs">
            <SelectValue placeholder="All Files" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Files</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="w-[150px] h-7 text-xs"
        />
        {dateFilter && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDateFilter("")}>
            <XCircle className="w-3 h-3" />
          </Button>
        )}

        {errCount > 0 && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={retryFailed}>
            <RefreshCw className="w-3 h-3" />
            Retry Failed
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── File table ── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10 border-b">
              <tr className="text-muted-foreground">
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left">File</th>
                <th className="px-3 py-2 text-left w-[90px]">Status</th>
                <th className="px-3 py-2 text-left w-[110px]">Timestamp</th>
                <th className="px-3 py-2 text-right w-[80px]">Rows</th>
                <th className="px-3 py-2 text-right w-[70px]">Size</th>
                <th className="px-3 py-2 text-right w-[80px]">Duration</th>
                <th className="px-3 py-2 text-left w-[200px]">Error</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {loading ? "Loading..." : "No files found"}
                  </td>
                </tr>
              )}
              {files.map((f, i) => (
                <tr
                  key={f.id}
                  className={`border-b border-border/50 hover:bg-muted/30 ${
                    f.status === "failed" ? "bg-red-500/5" : ""
                  }`}
                >
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5 font-mono truncate max-w-[300px]" title={f.file_name}>
                    {f.file_name}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_BADGE[f.status] || ""}`}>
                      {STATUS_ICON[f.status]}
                      {f.status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {formatTs(f.started_at || f.finished_at)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {f.rows_inserted > 0 ? f.rows_inserted.toLocaleString() : "--"}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {formatSize(f.file_size)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {formatDuration(f.started_at, f.finished_at)}
                  </td>
                  <td className="px-3 py-1.5 text-red-400 truncate max-w-[200px]" title={f.error_message || ""}>
                    {f.error_message ? (
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        {f.error_message.replace("INVALID_FILE: ", "")}
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
