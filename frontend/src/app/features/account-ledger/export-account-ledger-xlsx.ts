import * as XLSX from 'xlsx';
import type { AccountMovementRowDto } from '../../core/models/api.types';

export interface LedgerXlsxLabels {
  summarySheet: string;
  dealer: string;
  periodFrom: string;
  periodTo: string;
  closingBalanceLabel: string;
  lastRowBalanceLabel: string;
  colDate: string;
  colDescription: string;
  colKind: string;
  colInvoice: string;
  colDebit: string;
  colCredit: string;
  colBalance: string;
}

export function downloadAccountLedgerXlsx(params: {
  filename: string;
  labels: LedgerXlsxLabels;
  dealerName: string;
  dateFrom: string;
  dateTo: string;
  closingBalance: number | null;
  rows: AccountMovementRowDto[];
  kindLabel: (k: string) => string;
}): void {
  const { filename, labels, dealerName, dateFrom, dateTo, closingBalance, rows, kindLabel } = params;

  const lastPeriodBalance =
    rows.length > 0 ? rows[rows.length - 1]!.balance : null;

  const summary: (string | number)[][] = [
    [labels.dealer, dealerName],
    [labels.periodFrom, dateFrom || '—'],
    [labels.periodTo, dateTo || '—'],
    [labels.closingBalanceLabel, closingBalance !== null ? closingBalance : '—'],
    [labels.lastRowBalanceLabel, lastPeriodBalance !== null ? lastPeriodBalance : '—'],
    [],
  ];

  const header = [
    labels.colDate,
    labels.colDescription,
    labels.colKind,
    labels.colInvoice,
    labels.colDebit,
    labels.colCredit,
    labels.colBalance,
  ];

  const dataRows = rows.map((row) => [
    row.movementAt,
    row.description,
    kindLabel(row.kind),
    row.invoiceId ?? '',
    row.debit > 0 ? row.debit : '',
    row.credit > 0 ? row.credit : '',
    row.balance,
  ]);

  const aoa = [...summary, header, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, labels.summarySheet.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
