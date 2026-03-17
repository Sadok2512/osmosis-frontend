import { useState } from 'react';
import { Plus, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandItem,
  CommandList,
  CommandInput,
} from '@/components/ui/command';
import type { ActiveFilter, FilterDefinition } from '@/hooks/useSitesFilters';

interface Props {
  filterDefs: FilterDefinition[];
  activeFilters: ActiveFilter[];
  availableToAdd: FilterDefinition[];
  onAdd: (id: string) => void;
  onToggle: (filterId: string, value: string) => void;
  onRemove: (filterId: string) => void;
  onClearAll: () => void;
}

export function SitesFilterBar({
  filterDefs,
  activeFilters,
  availableToAdd,
  onAdd,
  onToggle,
  onRemove,
  onClearAll,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 px-4 border-b border-border bg-background/50">
      {/* Active filter chips */}
      {activeFilters.map(filter => {
        const def = filterDefs.find(d => d.id === filter.id);
        return (
          <FilterChip
            key={filter.id}
            filter={filter}
            availableValues={def?.values || []}
            onToggle={val => onToggle(filter.id, val)}
            onRemove={() => onRemove(filter.id)}
          />
        );
      })}

      {/* Add filter button */}
      {availableToAdd.length > 0 && (
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Plus className="h-3 w-3" />
              Ajouter filtre
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-0" align="start">
            <Command>
              <CommandList>
                {availableToAdd.map(d => (
                  <CommandItem
                    key={d.id}
                    onSelect={() => {
                      onAdd(d.id);
                      setAddOpen(false);
                    }}
                  >
                    {d.label}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {d.values.length}
                    </span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Clear all */}
      {activeFilters.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-destructive"
          onClick={onClearAll}
        >
          <X className="h-3 w-3 mr-1" />
          Effacer tout
        </Button>
      )}

      {/* Active count */}
      {activeFilters.length > 0 && (
        <span className="text-xs text-muted-foreground ml-auto">
          {activeFilters.filter(f => f.selectedValues.length > 0).length} filtre(s) actif(s)
        </span>
      )}
    </div>
  );
}

// ── FilterChip ─────────────────────────────────────────────
function FilterChip({
  filter,
  availableValues,
  onToggle,
  onRemove,
}: {
  filter: ActiveFilter;
  availableValues: string[];
  onToggle: (val: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = filter.selectedValues;

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Badge
            variant={selected.length > 0 ? 'default' : 'secondary'}
            className="cursor-pointer gap-1 pr-1 h-7 rounded-r-none border-r-0"
          >
            <span className="text-xs font-normal opacity-70">{filter.label}:</span>
            <span className="text-xs font-medium">
              {selected.length === 0
                ? 'Tous'
                : selected.length === 1
                  ? selected[0]
                  : `${selected.length} sélectionnés`}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder={`Filtrer ${filter.label}...`} />
            <CommandList className="max-h-52">
              {availableValues.map(val => (
                <CommandItem key={val} onSelect={() => onToggle(val)} className="gap-2">
                  <div
                    className={`h-4 w-4 rounded border flex items-center justify-center ${
                      selected.includes(val)
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input'
                    }`}
                  >
                    {selected.includes(val) && (
                      <span className="text-[10px] font-bold">✓</span>
                    )}
                  </div>
                  <span className="text-sm">{val}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="h-7 px-1.5 rounded-l-none rounded-r-md border border-l-0 border-border bg-secondary hover:bg-destructive hover:text-destructive-foreground transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
