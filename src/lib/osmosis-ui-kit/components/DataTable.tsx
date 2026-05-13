import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { Search, ArrowUpDown, Download } from "lucide-react";
import type { TableData, TableColumn } from "../lib/types";
import { colors } from "../lib/theme";

interface Props {
  table: TableData;
  onExport?: (format: string) => void;
}

export function DataTable({ table: tableData, onExport }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      tableData.columns.map((col) => ({
        accessorKey: col.key,
        header: col.label,
        enableSorting: col.sortable !== false,
        cell: (info) => renderCell(col, info.getValue()),
        size: col.width ? parseInt(col.width) : undefined,
        // Stash the full column descriptor so render-time alignment knows the type.
        meta: { col } as { col: TableColumn },
      })),
    [tableData.columns]
  );

  const table = useReactTable({
    data: tableData.rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: tableData.page_size || 10 } },
  });

  const features = tableData.features || [];

  return (
    <div
      style={{
        background: "var(--bg-primary)",
        border: "0.5px solid var(--border-tertiary)",
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          background: "var(--bg-secondary)",
          borderBottom: "0.5px solid var(--border-tertiary)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 500 }}>📋 {tableData.title}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {features.includes("search") && (
            <div style={{ position: "relative" }}>
              <Search size={12} style={{ position: "absolute", left: 8, top: 6, color: "var(--text-tertiary)" }} />
              <input
                type="text"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Filtrer..."
                style={{
                  fontSize: 11,
                  padding: "3px 8px 3px 24px",
                  border: "0.5px solid var(--border-tertiary)",
                  borderRadius: 4,
                  background: "var(--bg-primary)",
                  width: 120,
                }}
              />
            </div>
          )}
          {features.includes("export") && onExport && (
            <button
              onClick={() => onExport("csv")}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                border: "0.5px solid var(--border-tertiary)",
                background: "var(--bg-primary)",
                borderRadius: 4,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Download size={11} /> CSV
            </button>
          )}
        </div>
      </div>

      {/* Helper: right-align numeric/progress columns at <th>/<td> level so
          the spacing is consistent (the cell renderer's inner span alignment
          alone left labels still left-aligned in the cell, producing
          mis-aligned columns visible on narrow chat layouts). Removed
          tableLayout:"fixed" + cells too narrow → numbers wrapped to multiple
          lines, which is what produced the stacked-vertical look. */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 360 }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ background: "var(--bg-secondary)" }}>
                {headerGroup.headers.map((header) => {
                  const meta = (header.column.columnDef.meta || {}) as { col?: TableColumn };
                  const colType = meta.col?.type;
                  const isNumeric = colType === "number" || colType === "progress_bar";
                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      style={{
                        textAlign: isNumeric ? "right" : "left",
                        whiteSpace: "nowrap",
                        padding: "8px 12px",
                        fontWeight: 500,
                        color: "var(--text-secondary)",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                        cursor: header.column.getCanSort() ? "pointer" : "default",
                        userSelect: "none",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() && <ArrowUpDown size={10} />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const profile = (row.original as any).profile as { status?: string } | undefined;
              const isAnomaly = profile?.status === "warning" || profile?.status === "danger";
              return (
                <tr
                  key={row.id}
                  style={{
                    borderTop: "0.5px solid var(--border-tertiary)",
                    background: isAnomaly ? `${colors.status.warning.bg}40` : undefined,
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = (cell.column.columnDef.meta || {}) as { col?: TableColumn };
                    const colType = meta.col?.type;
                    const isNumeric = colType === "number" || colType === "progress_bar";
                    return (
                      <td
                        key={cell.id}
                        style={{
                          padding: "9px 12px",
                          textAlign: isNumeric ? "right" : "left",
                          whiteSpace: isNumeric ? "nowrap" : undefined,
                          fontVariantNumeric: isNumeric ? "tabular-nums" : undefined,
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {features.includes("paginate") && table.getPageCount() > 1 && (
        <div
          style={{
            padding: "8px 14px",
            background: "var(--bg-secondary)",
            fontSize: 11,
            color: "var(--text-secondary)",
            borderTop: "0.5px solid var(--border-tertiary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              style={paginationBtn(table.getCanPreviousPage())}
            >
              ◀
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              style={paginationBtn(table.getCanNextPage())}
            >
              ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function paginationBtn(enabled: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    padding: "3px 8px",
    border: "0.5px solid var(--border-tertiary)",
    background: "var(--bg-primary)",
    borderRadius: 4,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.4,
  };
}

// Cell renderer: handles all column types
function renderCell(col: TableColumn, value: unknown): React.ReactNode {
  if (value == null) return <span style={{ color: "var(--text-tertiary)" }}>—</span>;

  switch (col.type) {
    case "link":
      return <span style={{ color: colors.status.info.fg, fontWeight: 500, cursor: "pointer" }}>{String(value)}</span>;

    case "number":
      return (
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500, textAlign: "right", display: "block" }}>
          {Number(value).toLocaleString("fr-FR")}
        </span>
      );

    case "progress_bar": {
      const ratio = Number(value);
      return (
        <div style={{ height: 5, background: "var(--bg-secondary)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${ratio * 100}%`, height: "100%", background: colors.brand.primaryLight }} />
        </div>
      );
    }

    case "badge": {
      const v = value as { value: string; status: keyof typeof colors.status };
      const status = colors.status[v.status] || colors.status.neutral;
      return (
        <span
          style={{
            background: status.bg,
            color: status.fg,
            padding: "2px 6px",
            borderRadius: 8,
            fontSize: 10,
            fontWeight: 500,
            display: "inline-block",
          }}
        >
          {v.value}
        </span>
      );
    }

    case "tag": {
      const v = value as { label: string; status: keyof typeof colors.status };
      const status = colors.status[v.status] || colors.status.neutral;
      return (
        <span
          style={{
            background: status.bg,
            color: status.fg,
            padding: "2px 6px",
            borderRadius: 8,
            fontSize: 10,
            fontWeight: 500,
            display: "inline-block",
          }}
        >
          {v.status === "warning" && "⚠ "}
          {v.label}
        </span>
      );
    }

    case "html":
      // For top_hw column: array of { name, pct, dominant }
      if (Array.isArray(value)) {
        return (
          <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>
            {value.map((item: any, i: number) => (
              <React.Fragment key={i}>
                <span style={{ color: item.dominant ? colors.brand.primaryLight : "inherit", fontWeight: item.dominant ? 500 : 400 }}>
                  {item.name} {item.pct}%
                </span>
                {i < value.length - 1 && " · "}
              </React.Fragment>
            ))}
          </span>
        );
      }
      return <span dangerouslySetInnerHTML={{ __html: String(value) }} />;

    case "sparkline":
      if (Array.isArray(value)) {
        return <MiniSparkline data={value as number[]} />;
      }
      return null;

    default:
      return <span>{String(value)}</span>;
  }
}

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 60},${12 - ((v - min) / range) * 10}`)
    .join(" ");
  return (
    <svg width={60} height={12} viewBox="0 0 60 12">
      <polyline points={points} fill="none" stroke={colors.brand.primaryLight} strokeWidth="1.2" />
    </svg>
  );
}
