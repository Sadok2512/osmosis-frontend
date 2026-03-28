import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow
} from "@/components/ui/table";
import {
  AlertTriangle, Layers, Wifi, GitBranch,
  Radio, HelpCircle, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVpsProxyUrl, getVpsProxyHeaders } from "@/lib/apiConfig";

const vpsUrl = (path: string) => getVpsProxyUrl('parser', `/api/v1${path}`);

const DIM_COLORS: Record<string, string> = {
  profile_type: "bg-purple-100 text-purple-800 border-purple-200",
  profile_id:   "bg-purple-100 text-purple-800 border-purple-200",
  qci:          "bg-blue-100 text-blue-800 border-blue-200",
  arp:          "bg-indigo-100 text-indigo-800 border-indigo-200",
  carel_id:     "bg-green-100 text-green-800 border-green-200",
  scell_id:     "bg-emerald-100 text-emerald-800 border-emerald-200",
  neighbor_id:  "bg-orange-100 text-orange-800 border-orange-200",
  earfcn:       "bg-yellow-100 text-yellow-800 border-yellow-200",
  pci:          "bg-amber-100 text-amber-800 border-amber-200",
  band:         "bg-red-100 text-red-800 border-red-200",
  carrier:      "bg-pink-100 text-pink-800 border-pink-200",
  bwp:          "bg-cyan-100 text-cyan-800 border-cyan-200",
  slice_id:     "bg-teal-100 text-teal-800 border-teal-200",
  sst:          "bg-violet-100 text-violet-800 border-violet-200",
  sd:           "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
};

const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  profile_type: "PM profile type (e.g. PM_QCI_ARP_Profile)",
  profile_id:   "PM profile identifier (e.g. PMQAP-1)",
  qci:          "QoS Class Identifier (0-9)",
  arp:          "Allocation and Retention Priority (1-15)",
  carel_id:     "Carrier Aggregation Relation ID",
  scell_id:     "Secondary Cell ID (CA)",
  neighbor_id:  "Neighbor cell relation ID",
  earfcn:       "E-UTRA Absolute Radio Frequency Channel Number",
  pci:          "Physical Cell Identity",
  band:         "Radio frequency band",
  carrier:      "Carrier identifier",
  bwp:          "Bandwidth Part (5G NR)",
  slice_id:     "Network Slice ID (5G)",
  sst:          "Slice/Service Type",
  sd:           "Slice Differentiator",
};

interface DimType {
  dim_name:        string;
  count:           number;
  distinct_values: number;
  sample_min:      string;
  sample_max:      string;
}

interface DimRecord {
  vendor:             string;
  rat:                string;
  end_time:           string;
  cell_id:            string;
  counter_name:       string;
  normalized_counter: string;
  value:              number;
  family:             string;
  object_type:        string;
  dim_name:           string;
  dim_value:          string;
}

interface UnknownPattern {
  vendor:       string;
  family:       string;
  pattern_type: string;
  reason:       string;
  source_file:  string;
  created_at:   string;
}

interface Stats {
  total_counters:     number;
  counters_with_dims: number;
  dimension_types:    DimType[];
  unknown_patterns:   number;
  distinct_families:  number;
  date_from:          string;
  date_to:            string;
}

export function SpecificDimensionsSection() {
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [dimTypes, setDimTypes] = useState<DimType[]>([]);
  const [unknowns, setUnknowns] = useState<UnknownPattern[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [activeTab,    setActiveTab]    = useState("profiles");
  const [dimRecords,   setDimRecords]   = useState<DimRecord[]>([]);
  const [loadingDims,  setLoadingDims]  = useState(false);

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    fetchDimsByTab(activeTab);
  }, [activeTab]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const hdrs = getVpsProxyHeaders();
      const [statsRes, dimTypesRes, unknownsRes] = await Promise.all([
        fetch(vpsUrl(`/pm/nokia/v2/stats`), { headers: hdrs }),
        fetch(vpsUrl(`/pm/nokia/v2/dimension-types`), { headers: hdrs }),
        fetch(vpsUrl(`/pm/nokia/v2/unknowns?limit=30`), { headers: hdrs }),
      ]);
      if (statsRes.ok)    setStats(await statsRes.json());
      if (dimTypesRes.ok) {
        const dt = await dimTypesRes.json();
        setDimTypes(Array.isArray(dt) ? dt : []);
      }
      if (unknownsRes.ok) {
        const uk = await unknownsRes.json();
        setUnknowns(Array.isArray(uk) ? uk : []);
      }
    } catch (e) {
      console.error("Error fetching PM V2 data:", e);
    }
    setLoading(false);
  };

  const fetchDimsByTab = async (tab: string) => {
    const tabDimMap: Record<string, string[]> = {
      profiles:  ["profile_id", "profile_type"],
      qci:       ["qci", "arp"],
      carel:     ["carel_id", "scell_id"],
      neighbors: ["neighbor_id", "earfcn", "pci"],
      bands:     ["band", "carrier", "bwp", "slice_id", "sst"],
    };

    const dims = tabDimMap[tab];
    if (!dims) return;

    setLoadingDims(true);
    try {
      // Fetch for each dim name and combine
      const hdrs = getVpsProxyHeaders();
      const results = await Promise.all(
        dims.map(dn =>
          fetch(vpsUrl(`/pm/nokia/v2/dimensions?dim_name=${dn}&limit=50`), { headers: hdrs })
            .then(r => r.ok ? r.json() : { items: [] })
            .then(d => d.items || [])
        )
      );
      setDimRecords(results.flat());
    } catch (e) {
      console.error(e);
    }
    setLoadingDims(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        Loading specific dimensions data...
      </div>
    );
  }

  const noData = !stats || stats.total_counters === 0;

  if (noData) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
        <Layers className="h-8 w-8 opacity-30" />
        <p className="text-sm">No PM V2 data available.</p>
        <p className="text-xs">Run the PM V2 parser first to populate specific dimensions.</p>
        <Button size="sm" variant="outline" onClick={fetchAll}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold tabular-nums">
              {stats?.counters_with_dims?.toLocaleString() ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Counters with dimensions
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold tabular-nums">
              {dimTypes.length}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dimension types detected
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold tabular-nums">
              {stats?.distinct_families ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              PM families
            </p>
          </CardContent>
        </Card>
        <Card className={
          (stats?.unknown_patterns ?? 0) > 0 ? "border-orange-300" : ""
        }>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold tabular-nums ${
              (stats?.unknown_patterns ?? 0) > 0 ? "text-orange-500" : ""
            }`}>
              {stats?.unknown_patterns ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Unknown patterns
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dimension type pills */}
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm font-medium">
            Detected Dimension Types
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="flex flex-wrap gap-1.5">
            {dimTypes.map(dt => (
              <Badge
                key={dt.dim_name}
                variant="outline"
                className={`cursor-default text-xs ${DIM_COLORS[dt.dim_name] ?? "bg-gray-100 text-gray-700"}`}
              >
                {dt.dim_name}
                <span className="ml-1 opacity-60">
                  {dt.count.toLocaleString()}
                </span>
              </Badge>
            ))}
            {dimTypes.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No dimensions parsed yet
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={v => { setActiveTab(v); }}
      >
        <TabsList className="h-auto flex-wrap gap-0.5">
          <TabsTrigger value="profiles">Profiles (PMQAP)</TabsTrigger>
          <TabsTrigger value="qci">QCI / ARP</TabsTrigger>
          <TabsTrigger value="carel">Carrier Aggregation</TabsTrigger>
          <TabsTrigger value="neighbors">Neighbors</TabsTrigger>
          <TabsTrigger value="bands">Band / Carrier / Slice</TabsTrigger>
          <TabsTrigger value="unknown" className="relative">
            Unknown Patterns
            {unknowns.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold w-4 h-4">
                {unknowns.length > 9 ? "9+" : unknowns.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="dictionary">Dictionary</TabsTrigger>
        </TabsList>

        {/* Profiles */}
        <TabsContent value="profiles">
          <DimensionDataTable
            records={dimRecords}
            loading={loadingDims}
            title="PM_QCI_ARP_Profile / PMQAP Counters"
            emptyText="No profile-based counters found"
          />
        </TabsContent>

        {/* QCI / ARP */}
        <TabsContent value="qci">
          <DimensionDataTable
            records={dimRecords}
            loading={loadingDims}
            title="QCI / ARP Counters"
            emptyText="No QCI/ARP counters found"
          />
        </TabsContent>

        {/* CAREL */}
        <TabsContent value="carel">
          <DimensionDataTable
            records={dimRecords}
            loading={loadingDims}
            title="Carrier Aggregation (CAREL) Counters"
            emptyText="No carrier aggregation counters found"
          />
        </TabsContent>

        {/* Neighbors */}
        <TabsContent value="neighbors">
          <DimensionDataTable
            records={dimRecords}
            loading={loadingDims}
            title="Neighbor Relation Counters"
            emptyText="No neighbor counters found"
          />
        </TabsContent>

        {/* Bands */}
        <TabsContent value="bands">
          <DimensionDataTable
            records={dimRecords}
            loading={loadingDims}
            title="Band / Carrier / Slice Counters (5G)"
            emptyText="No band/carrier/slice counters found"
          />
        </TabsContent>

        {/* Unknown Patterns */}
        <TabsContent value="unknown">
          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Unrecognized LDN Patterns — Parser Improvement Backlog
              </CardTitle>
            </CardHeader>
            <CardContent>
              {unknowns.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 text-sm">
                  ✅ Parser covers all detected patterns — no unknowns
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Family</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Source File</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unknowns.map((u, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant="outline">{u.vendor}</Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate">
                          {u.family}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {u.pattern_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-orange-600 max-w-[200px] truncate">
                          {u.reason}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.source_file}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.created_at?.slice(0, 10)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dictionary */}
        <TabsContent value="dictionary">
          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm font-medium">
                Recognized Dynamic Dimensions — Taxonomy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dimension</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Distinct Values</TableHead>
                    <TableHead>Sample</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dimTypes.length > 0 ? (
                    dimTypes.map(dt => (
                      <TableRow key={dt.dim_name}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${DIM_COLORS[dt.dim_name] ?? ""}`}
                          >
                            {dt.dim_name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {DIMENSION_DESCRIPTIONS[dt.dim_name] ?? "Dynamic dimension"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {dt.count?.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {dt.distinct_values}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {dt.sample_min}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    // Show full taxonomy even if no data parsed yet
                    Object.entries(DIMENSION_DESCRIPTIONS).map(([dim, desc]) => (
                      <TableRow key={dim}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${DIM_COLORS[dim] ?? ""}`}
                          >
                            {dim}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {desc}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                        <TableCell className="text-xs text-muted-foreground">—</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Reusable dimension data table ────────────────────────────
function DimensionDataTable({
  records,
  loading,
  title,
  emptyText,
}: {
  records:   DimRecord[];
  loading:   boolean;
  title:     string;
  emptyText: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground text-sm gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : records.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 text-sm">
            {emptyText}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>RAT</TableHead>
                <TableHead>Cell</TableHead>
                <TableHead>Counter</TableHead>
                <TableHead>Normalized</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Dimension</TableHead>
                <TableHead>Dim Value</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.slice(0, 100).map((r, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{r.vendor}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.rat}</TableCell>
                  <TableCell className="font-mono text-xs">{r.cell_id}</TableCell>
                  <TableCell className="font-mono text-xs">{r.counter_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.normalized_counter ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs font-semibold">
                    {r.value?.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${DIM_COLORS[r.dim_name] ?? ""}`}
                    >
                      {r.dim_name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-mono">
                      {r.dim_value}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {r.end_time?.slice(0, 16).replace("T", " ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
