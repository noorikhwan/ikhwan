import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Command,
  CornerDownLeft,
  IdCard,
  LayoutGrid,
  Radio,
  Search,
  Server,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react';

export interface CommandPaletteItem {
  id: string;
  group: 'Quick Actions' | 'Modules' | 'Servers' | 'Racks & BMS Probes' | 'Tickets & Visitors';
  title: string;
  subtitle: string;
  keywords?: string;
  onSelect: () => void;
}

interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
  siteCode: string;
}

function GroupIcon({ group }: { group: CommandPaletteItem['group'] }) {
  switch (group) {
    case 'Quick Actions':
      return <Sparkles className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58] shrink-0" aria-hidden="true" />;
    case 'Modules':
      return <Command className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />;
    case 'Servers':
      return <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />;
    case 'Racks & BMS Probes':
      return <Radio className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />;
    case 'Tickets & Visitors':
      return <Ticket className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />;
    default:
      return <LayoutGrid className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />;
  }
}

export function CommandPaletteModal({
  open,
  onClose,
  items,
  siteCode,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items.slice(0, 14);
    }
    return items
      .filter((item) => {
        const hay = `${item.title} ${item.subtitle} ${item.group} ${item.keywords ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 16);
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const executeItem = (item: CommandPaletteItem) => {
    item.onSelect();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Palette"
      data-testid="command-palette-modal"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-slate-950/55 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#1B2026] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl overflow-hidden">
        {/* Search Input Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            data-testid="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((prev) =>
                  filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
                );
              } else if (e.key === 'Enter' && filtered[activeIndex]) {
                e.preventDefault();
                executeItem(filtered[activeIndex]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder={`Search ${siteCode} racks, servers, BMS probes, tickets, or run an action...`}
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[58vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No matching racks, servers, probes, or commands for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const active = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`cmd-item-${item.id}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => executeItem(item)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#009530]/[0.08] dark:bg-[#3DCD58]/[0.12]'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <GroupIcon group={item.group} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {item.group}
                    </span>
                    {active && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-[#009530] dark:text-[#3DCD58]" aria-hidden="true" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Keyboard Hints */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-[#14181D] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
          <span>↑↓ Navigate · Enter Select · Esc Close</span>
          <span className="inline-flex items-center gap-1">
            <IdCard className="w-3 h-3" aria-hidden="true" />
            Site {siteCode}
          </span>
        </div>
      </div>
    </div>
  );
}
