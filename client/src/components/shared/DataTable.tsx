import { useReactTable, getCoreRowModel, flexRender, type ColumnDef, type SortingState, type OnChangeFn } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[] | undefined;
  loading?: boolean;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  rowClassName?: (row: T) => string | undefined;
  footer?: React.ReactNode;
}

/** Server-side paginated table (TanStack Table in manual mode). */
export function DataTable<T>({
  columns, data, loading, page = 1, pageSize = 25, total, onPageChange, sorting, onSortingChange, onRowClick, emptyText, rowClassName, footer,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    state: { sorting: sorting ?? [] },
    onSortingChange,
    enableSorting: !!onSortingChange,
  });
  const totalPages = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <Table>
        <THead>
          {table.getHeaderGroups().map((hg) => (
            <TR key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => {
                const sortable = h.column.getCanSort() && !!onSortingChange;
                const dir = h.column.getIsSorted();
                return (
                  <TH key={h.id} style={{ width: h.column.columnDef.size !== 150 ? h.column.columnDef.size : undefined }} className={(h.column.columnDef.meta as { className?: string } | undefined)?.className}>
                    {sortable ? (
                      <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : null}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TH>
                );
              })}
            </TR>
          ))}
        </THead>
        <TBody>
          {loading && !data?.length
            ? Array.from({ length: 6 }).map((_, i) => (
                <TR key={i}>
                  {columns.map((_c, j) => (
                    <TD key={j}><Skeleton className="h-4 w-full max-w-[160px]" /></TD>
                  ))}
                </TR>
              ))
            : table.getRowModel().rows.map((row) => (
                <TR
                  key={row.id}
                  className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row.original); } : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TD key={cell.id} className={(cell.column.columnDef.meta as { className?: string } | undefined)?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TD>
                  ))}
                </TR>
              ))}
        </TBody>
        {footer}
      </Table>
      {!loading && !data?.length && (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
          <Inbox className="h-8 w-8 opacity-40" />
          {emptyText ?? t('common.noResults')}
        </div>
      )}
      {total !== undefined && onPageChange && total > 0 && (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">{t('common.results', { count: total })}</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground tabular">
              {t('common.page')} {page} {t('common.of')} {totalPages}
            </span>
            <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={t('common.previous')}>
              <ChevronLeft className="flip-rtl" />
            </Button>
            <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label={t('common.next')}>
              <ChevronRight className="flip-rtl" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
