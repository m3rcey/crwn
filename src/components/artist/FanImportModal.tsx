'use client';

import { useState, useRef } from 'react';
import { useToast } from '@/components/shared/Toast';
import { Upload, X, Loader2, FileSpreadsheet, ArrowRight, CheckCircle } from 'lucide-react';

interface FanImportModalProps {
  artistId: string;
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done';

const KNOWN_FIELDS = ['email', 'name', 'phone', 'city', 'state', 'country'] as const;
type FieldName = typeof KNOWN_FIELDS[number];

export function FanImportModal({ artistId, isOpen, onClose, onImported }: FanImportModalProps) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, FieldName | ''>>({}); // csv header → field
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; invalid: number } | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setStep('upload');
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMap({});
    setImportResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const parseCSV = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine);
    return { headers, rows };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      showToast('Please upload a CSV file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0) {
        showToast('Could not parse CSV. Check the file format.', 'error');
        return;
      }

      if (rows.length > 5000) {
        showToast('Maximum 5,000 rows per import', 'error');
        return;
      }

      setCsvHeaders(headers);
      setCsvRows(rows);

      // Auto-map columns by matching header names
      const autoMap: Record<string, FieldName | ''> = {};
      headers.forEach(h => {
        const lower = h.toLowerCase().replace(/[^a-z]/g, '');
        if (lower.includes('email') || lower === 'emailaddress') autoMap[h] = 'email';
        else if (lower === 'name' || lower === 'fullname' || lower === 'firstname') autoMap[h] = 'name';
        else if (lower.includes('phone') || lower === 'mobile' || lower === 'cell') autoMap[h] = 'phone';
        else if (lower === 'city' || lower === 'town') autoMap[h] = 'city';
        else if (lower === 'state' || lower === 'province' || lower === 'region') autoMap[h] = 'state';
        else if (lower === 'country') autoMap[h] = 'country';
        else autoMap[h] = '';
      });

      setColumnMap(autoMap);
      setStep('map');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    // Build rows from column mapping
    const emailCol = Object.entries(columnMap).find(([, v]) => v === 'email')?.[0];
    if (!emailCol) {
      showToast('Map at least the email column', 'error');
      return;
    }

    const headerIndex: Record<string, number> = {};
    csvHeaders.forEach((h, i) => { headerIndex[h] = i; });

    const mappedRows = csvRows.map(row => {
      const record: Record<string, string> = {};
      Object.entries(columnMap).forEach(([csvHeader, field]) => {
        if (field && headerIndex[csvHeader] !== undefined) {
          record[field] = row[headerIndex[csvHeader]] || '';
        }
      });
      return record;
    });

    setStep('importing');

    try {
      const res = await fetch('/api/fan-contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, rows: mappedRows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');

      setImportResult({
        imported: json.imported,
        skipped: json.skipped,
        invalid: json.invalid || 0,
      });
      setStep('done');
      onImported();
    } catch (err: any) {
      showToast(err.message || 'Import failed', 'error');
      setStep('map');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={handleClose}>
      <div className="bg-crwn-card rounded-2xl border border-crwn-elevated p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-crwn-text">Import Fans</h2>
          <button onClick={handleClose} className="p-1 text-crwn-text-secondary hover:text-crwn-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="text-center py-8">
            <FileSpreadsheet className="w-12 h-12 text-crwn-text-secondary mx-auto mb-4" />
            <p className="text-sm text-crwn-text mb-1">Upload a CSV file with fan contacts</p>
            <p className="text-xs text-crwn-text-secondary mb-6">Max 5,000 rows. Must include an email column.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 mx-auto px-6 py-3 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Choose File
            </button>
          </div>
        )}

        {/* Step: Column Mapping */}
        {step === 'map' && (
          <div className="space-y-4">
            <p className="text-sm text-crwn-text-secondary">
              {csvRows.length} rows found. Map your CSV columns to fan fields:
            </p>

            <div className="space-y-2">
              {csvHeaders.map(header => (
                <div key={header} className="flex items-center gap-3">
                  <span className="text-xs text-crwn-text font-mono w-32 truncate">{header}</span>
                  <ArrowRight className="w-3 h-3 text-crwn-text-secondary shrink-0" />
                  <select
                    value={columnMap[header] || ''}
                    onChange={e => setColumnMap({ ...columnMap, [header]: e.target.value as FieldName | '' })}
                    className="flex-1 px-3 py-1.5 bg-crwn-elevated border border-crwn-elevated rounded-lg text-xs text-crwn-text focus:outline-none focus:border-crwn-gold/50"
                  >
                    <option value="">Skip</option>
                    {KNOWN_FIELDS.map(f => (
                      <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div className="mt-4">
              <p className="text-xs text-crwn-text-secondary mb-2">Preview (first 3 rows):</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {KNOWN_FIELDS.filter(f => Object.values(columnMap).includes(f)).map(f => (
                        <th key={f} className="px-2 py-1 text-left text-crwn-text-secondary">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {KNOWN_FIELDS.filter(f => Object.values(columnMap).includes(f)).map(field => {
                          const csvHeader = Object.entries(columnMap).find(([, v]) => v === field)?.[0];
                          const colIdx = csvHeader ? csvHeaders.indexOf(csvHeader) : -1;
                          return (
                            <td key={field} className="px-2 py-1 text-crwn-text">
                              {colIdx >= 0 ? row[colIdx] || '—' : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={reset}
                className="px-4 py-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={!Object.values(columnMap).includes('email')}
                className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
              >
                Import {csvRows.length} Contacts
              </button>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-crwn-gold mx-auto mb-4" />
            <p className="text-sm text-crwn-text">Importing contacts...</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && importResult && (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <p className="text-lg font-semibold text-crwn-text mb-2">Import Complete</p>
            <div className="space-y-1 text-sm text-crwn-text-secondary">
              <p><span className="text-crwn-text font-medium">{importResult.imported}</span> contacts imported</p>
              {importResult.skipped > 0 && <p>{importResult.skipped} duplicates skipped</p>}
              {importResult.invalid > 0 && <p>{importResult.invalid} rows without valid email</p>}
            </div>
            <button
              onClick={handleClose}
              className="mt-6 px-6 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
