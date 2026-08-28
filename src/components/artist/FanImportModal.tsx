'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/shared/Toast';
import { Upload, X, Loader2, FileSpreadsheet, ArrowRight, CheckCircle, Megaphone } from 'lucide-react';
import { IMPORT_ATTESTATION_TEXT } from '@/lib/fanImportConsent';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { IMPORT_SOURCE_OPTIONS } from '@/lib/fanImportSource';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  detectPatreonCsv,
  parsePatreonRows,
  patreonTierBreakdown,
  suggestCrwnTier,
  patreonTags,
  type PatreonMember,
  type CrwnTierOption,
} from '@/lib/patreonImport';

interface FanImportModalProps {
  artistId: string;
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

// 'patreon' is the recognized-export review step (Launch Wizard Stage 7): the
// artist sees who is coming over, filters to active patrons, and gets a
// suggested CRWN tier per Patreon tier before anything imports.
type Step = 'upload' | 'map' | 'patreon' | 'preview' | 'importing' | 'done';

const KNOWN_FIELDS = ['email', 'name', 'phone', 'city', 'state', 'country'] as const;
type FieldName = typeof KNOWN_FIELDS[number];

export function FanImportModal({ artistId, isOpen, onClose, onImported }: FanImportModalProps) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, FieldName | ''>>({}); // csv header → field
  // What this list IS. Stored as a contact tag so the artist can send to it later; the whole
  // point of a membership launch is going to proven buyers FIRST, and an untagged import makes
  // that audience unbuildable. Optional: an unlabeled list still imports.
  const [sourceTag, setSourceTag] = useState<string>('');
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; invalid: number } | null>(null);
  const [attested, setAttested] = useState(false);

  // Patreon path state: the parsed members, the active-only filter, and the
  // artist's tiers (for the "lands closest to" suggestions).
  const [patreonMembers, setPatreonMembers] = useState<PatreonMember[]>([]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [crwnTiers, setCrwnTiers] = useState<CrwnTierOption[]>([]);

  useEffect(() => {
    if (!isOpen || step !== 'patreon' || crwnTiers.length > 0) return;
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('subscription_tiers')
      .select('name, price')
      .eq('artist_id', artistId)
      .not('is_active', 'is', false)
      .order('price', { ascending: true })
      .then(({ data }) => {
        if (data) setCrwnTiers(data.map((t) => ({ name: t.name, price: Number(t.price) || 0 })));
      });
  }, [isOpen, step, crwnTiers.length, artistId]);

  if (!isOpen) return null;

  const reset = () => {
    setStep('upload');
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMap({});
    setImportResult(null);
    setAttested(false);
    setPatreonMembers([]);
    setActiveOnly(true);
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

      // A Patreon Relationship Manager export is recognized automatically and
      // gets its own review step: status filter, tier + pledge, CRWN tier
      // suggestions. No manual column mapping to fumble.
      if (detectPatreonCsv(headers)) {
        const members = parsePatreonRows(headers, rows);
        if (members.length > 0) {
          setPatreonMembers(members);
          setStep('patreon');
          return;
        }
      }

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

    if (!attested) {
      showToast('Confirm these fans gave you permission first', 'error');
      return;
    }

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
        body: JSON.stringify({
          artistId,
          rows: sourceTag ? mappedRows.map(r => ({ ...r, tags: [sourceTag] })) : mappedRows,
          attestedPermission: true,
        }),
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

  // Import the reviewed Patreon members: same endpoint, same attestation rule,
  // plus segmentation tags (patreon / patreon-tier:X / patreon-inactive) so the
  // artist can target "my old $25 patrons" in a campaign later.
  const handleImportPatreon = async () => {
    if (!attested) {
      showToast('Confirm these fans gave you permission first', 'error');
      return;
    }
    const members = activeOnly ? patreonMembers.filter((m) => m.active) : patreonMembers;
    if (members.length === 0) {
      showToast('No members match that filter', 'error');
      return;
    }
    setStep('importing');
    try {
      const res = await fetch('/api/fan-contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId,
          attestedPermission: true,
          rows: members.map((m) => ({
            email: m.email,
            name: m.name || undefined,
            phone: m.phone || undefined,
            city: m.city || undefined,
            state: m.state || undefined,
            country: m.country || undefined,
            tags: patreonTags(m),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      setImportResult({ imported: json.imported, skipped: json.skipped, invalid: json.invalid || 0 });
      setStep('done');
      onImported();
    } catch (err: any) {
      showToast(err.message || 'Import failed', 'error');
      setStep('patreon');
    }
  };

  const activeCount = patreonMembers.filter((m) => m.active).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={handleClose}>
      <div className="bg-crwn-surface rounded-2xl border border-crwn-elevated p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-crwn-text">Import Fans</h2>
          <button onClick={handleClose} className="p-1 text-crwn-text-secondary hover:text-crwn-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: Upload — the import hub. Every source funnels into one CSV
            picker; a Patreon export is recognized automatically. */}
        {step === 'upload' && (
          <div className="py-2">
            <p className="text-sm text-crwn-text mb-4">
              Where are your fans right now? Export them as a CSV and bring the list you own home.
            </p>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full text-left px-4 py-4 rounded-xl border border-crwn-gold/40 bg-crwn-gold/5 hover:border-crwn-gold transition-colors"
              >
                <p className="font-medium text-crwn-text">Patreon members</p>
                <p className="text-xs text-crwn-text-secondary mt-0.5">
                  Patreon → Audience → Relationship Manager → Download CSV. CRWN recognizes the file, keeps each
                  member&apos;s tier and pledge, and suggests where they land on your ladder.
                </p>
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full text-left px-4 py-4 rounded-xl border border-crwn-elevated hover:border-crwn-gold/40 transition-colors"
              >
                <p className="font-medium text-crwn-text">Any other list (Mailchimp, Shopify, Gumroad, a spreadsheet)</p>
                <p className="text-xs text-crwn-text-secondary mt-0.5">
                  Any CSV with an email column works. You map the columns on the next step.
                </p>
              </button>
            </div>
            <p className="text-xs text-crwn-text-secondary mt-4 flex items-center gap-2">
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              Max 5,000 rows per import. Importing never messages anyone; invites are a separate step you review.
            </p>
          </div>
        )}

        {/* Step: Patreon review — who is coming over, and where they land. */}
        {step === 'patreon' && (
          <div className="space-y-4">
            <div className="border border-crwn-gold/40 bg-crwn-gold/5 rounded-xl p-4">
              <p className="font-medium text-crwn-text">Patreon export recognized</p>
              <p className="text-xs text-crwn-text-secondary mt-1">
                {patreonMembers.length} members found: {activeCount} active,{' '}
                {patreonMembers.length - activeCount} former or inactive.
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs text-crwn-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="mt-0.5 accent-[#D4AF37]"
              />
              <span>
                Only import active patrons ({activeCount}). Uncheck to also bring former patrons; they import
                tagged, so you can win them back with a separate message.
              </span>
            </label>

            <div>
              <p className="text-xs text-crwn-text-secondary mb-2">Where each Patreon tier lands on your ladder:</p>
              <div className="space-y-1.5">
                {patreonTierBreakdown(activeOnly ? patreonMembers.filter((m) => m.active) : patreonMembers).map(
                  (g) => {
                    const suggestion = suggestCrwnTier(g.pledgeCents, crwnTiers);
                    return (
                      <div
                        key={`${g.tierName}:${g.pledgeCents}`}
                        className="flex items-center gap-2 text-xs bg-crwn-bg border border-crwn-elevated rounded-lg px-3 py-2"
                      >
                        <span className="text-crwn-text truncate">
                          {g.tierName}
                          {g.pledgeCents > 0 && (
                            <span className="text-crwn-text-secondary"> (${(g.pledgeCents / 100).toFixed(0)}/mo)</span>
                          )}
                        </span>
                        <span className="text-crwn-text-secondary shrink-0">· {g.count}</span>
                        <ArrowRight className="w-3 h-3 text-crwn-text-secondary shrink-0 ml-auto" />
                        <span className="text-crwn-gold shrink-0">
                          {suggestion
                            ? `${suggestion.name}${suggestion.price > 0 ? ` $${(suggestion.price / 100).toFixed(0)}/mo` : ' (free)'}`
                            : 'No matching tier yet'}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
              <p className="text-[11px] text-crwn-text-secondary mt-2">
                Suggestions only: each member picks their own tier when they claim their place. Members import with
                their Patreon tier as a tag, so you can invite each group separately.
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs text-crwn-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 accent-[#D4AF37]"
              />
              <span>{IMPORT_ATTESTATION_TEXT}</span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={reset}
                className="px-4 py-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImportPatreon}
                disabled={!attested || (activeOnly ? activeCount : patreonMembers.length) === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
              >
                Import {activeOnly ? activeCount : patreonMembers.length} Members
              </button>
            </div>
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
                              {colIdx >= 0 ? row[colIdx] || '–' : '–'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Where this list came from. One tag, chosen once for the whole file, because the
                launch order that works is proven buyers first and then outward: without a label
                every import lands in one undifferentiated pile and that order cannot be run. */}
            <div className="mt-4">
              <p className="text-xs text-crwn-text-secondary mb-2">
                Where did these contacts come from? <span className="opacity-70">(optional)</span>
              </p>
              <OptionSelect
                options={IMPORT_SOURCE_OPTIONS}
                value={sourceTag || null}
                onChange={setSourceTag}
                placeholder="No label"
              />
              <p className="text-[11px] text-crwn-text-secondary mt-2">
                This becomes a tag on every contact in this file, so you can email just this group later.
              </p>
            </div>

            {/* Permission attestation. Importing a file never creates consent by itself; what
                CRWN records is this explicit, versioned attestation, and the invite path
                refuses contacts imported without it. */}
            <label className="flex items-start gap-2 mt-4 text-xs text-crwn-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={attested}
                onChange={e => setAttested(e.target.checked)}
                className="mt-0.5 accent-[#D4AF37]"
              />
              <span>{IMPORT_ATTESTATION_TEXT}</span>
            </label>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={reset}
                className="px-4 py-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={!Object.values(columnMap).includes('email') || !attested}
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
            {importResult.imported > 0 && (
              <div className="mt-5 text-left border border-crwn-gold/40 bg-crwn-gold/5 rounded-xl p-4">
                <p className="text-sm font-medium text-crwn-text">
                  Imported fans do not know your page exists yet.
                </p>
                <p className="text-xs text-crwn-text-secondary mt-1">
                  Next: invite them to claim their place. You write it, you review it, every email carries an
                  unsubscribe link, and nothing sends until you press send.
                </p>
                <Link
                  prefetch
                  href="/studio/fans?view=campaigns"
                  className="inline-flex items-center gap-2 mt-3 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
                >
                  <Megaphone className="w-4 h-4" />
                  Create the invite
                </Link>
              </div>
            )}
            <button
              onClick={handleClose}
              className="mt-4 px-6 py-2.5 border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text rounded-full text-sm font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
