'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Users, Search, Loader2, ArrowUpDown, Upload, X, Plus,
  StickyNote, Tag, ChevronDown, ListIcon, UserPlus,
} from 'lucide-react';

interface CrmContact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  instagram: string | null;
  source: string;
  status: string;
  tags: string[];
  notes: string | null;
  list_id: string | null;
  artist_profile_id: string | null;
  imported_at: string | null;
  created_at: string;
  artist_data: {
    revenue: number;
    subscribers: number;
    pipeline_stage: string;
    platform_tier: string;
  } | null;
}

interface CrmList {
  id: string;
  name: string;
  description: string | null;
  contact_count: number;
  created_at: string;
}

const STATUSES = [
  { id: 'lead', label: 'Lead', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { id: 'contacted', label: 'Contacted', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { id: 'onboarding', label: 'Onboarding', color: 'text-crwn-gold', bg: 'bg-crwn-gold/10' },
  { id: 'active', label: 'Active', color: 'text-green-400', bg: 'bg-green-400/10' },
  { id: 'churned', label: 'Churned', color: 'text-red-400', bg: 'bg-red-400/10' },
];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function CrmView() {
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [lists, setLists] = useState<CrmList[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'status'>('created_at');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Detail drawer
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [newNote, setNewNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [newTag, setNewTag] = useState('');

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importCsv, setImportCsv] = useState('');
  const [importListName, setImportListName] = useState('');
  const [importSelectedList, setImportSelectedList] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; failed: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadContacts = async () => {
    try {
      const params = listFilter ? `?listId=${listFilter}` : '';
      const res = await fetch(`/api/admin/crm${params}`);
      const json = await res.json();
      setContacts(json.contacts || []);
      setLists(json.lists || []);
      setStatusCounts(json.statusCounts || {});
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadContacts(); }, [listFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  const handleStatusChange = async (contactId: string, status: string) => {
    await fetch('/api/admin/crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', contactId, status }),
    });
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status } : c));
    if (selectedContact?.id === contactId) setSelectedContact(prev => prev ? { ...prev, status } : null);
  };

  const handleSaveNote = async () => {
    if (!selectedContact || !newNote.trim()) return;
    setIsSavingNote(true);
    try {
      await fetch('/api/admin/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_note', contactId: selectedContact.id, note: newNote.trim() }),
      });
      const timestamp = new Date().toISOString().split('T')[0];
      const updatedNotes = `[${timestamp}] ${newNote.trim()}\n${selectedContact.notes || ''}`;
      setSelectedContact(prev => prev ? { ...prev, notes: updatedNotes } : null);
      setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, notes: updatedNotes } : c));
      setNewNote('');
    } catch { /* silent */ }
    finally { setIsSavingNote(false); }
  };

  const handleAddTag = async () => {
    if (!selectedContact || !newTag.trim()) return;
    const tag = newTag.trim().toLowerCase();
    if (selectedContact.tags.includes(tag)) { setNewTag(''); return; }
    const updatedTags = [...selectedContact.tags, tag];
    await fetch('/api/admin/crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_tags', contactId: selectedContact.id, tags: updatedTags }),
    });
    setSelectedContact(prev => prev ? { ...prev, tags: updatedTags } : null);
    setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, tags: updatedTags } : c));
    setNewTag('');
  };

  const handleRemoveTag = async (tag: string) => {
    if (!selectedContact) return;
    const updatedTags = selectedContact.tags.filter(t => t !== tag);
    await fetch('/api/admin/crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_tags', contactId: selectedContact.id, tags: updatedTags }),
    });
    setSelectedContact(prev => prev ? { ...prev, tags: updatedTags } : null);
    setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, tags: updatedTags } : c));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportCsv(ev.target?.result as string || '');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importCsv.trim()) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/admin/crm/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv: importCsv,
          listName: importSelectedList ? undefined : importListName,
          listId: importSelectedList || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult({ imported: data.imported, skipped: data.skipped, failed: data.failed, total: data.total });
        await loadContacts();
      } else {
        setImportResult({ imported: 0, skipped: 0, failed: 0, total: 0 });
      }
    } catch { /* silent */ }
    finally { setIsImporting(false); }
  };

  // Filter + sort
  let filtered = contacts;
  if (statusFilter) filtered = filtered.filter(c => c.status === statusFilter);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.instagram && c.instagram.toLowerCase().includes(q)) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  filtered = [...filtered].sort((a, b) => {
    const aVal = a[sortBy] ?? '';
    const bVal = b[sortBy] ?? '';
    return sortDir === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-crwn-text">CRM</h2>
          <p className="text-sm text-crwn-text-secondary mt-0.5">{contacts.length} contacts across {lists.length} lists</p>
        </div>
        <button
          onClick={() => { setShowImport(true); setImportCsv(''); setImportListName(''); setImportSelectedList(''); setImportResult(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-crwn-card border border-crwn-elevated text-sm text-crwn-text hover:border-crwn-gold/50 transition"
        >
          <Upload className="w-4 h-4" />
          Import List
        </button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-5 gap-2">
        {STATUSES.map(status => {
          const count = statusCounts[status.id] || 0;
          const isSelected = statusFilter === status.id;
          return (
            <button
              key={status.id}
              onClick={() => setStatusFilter(isSelected ? '' : status.id)}
              className={`bg-crwn-card rounded-xl p-3 text-left transition-all border ${
                isSelected ? 'border-crwn-gold' : 'border-transparent hover:border-crwn-elevated'
              }`}
            >
              <div className={`text-xs font-medium mb-1 ${status.color}`}>{status.label}</div>
              <p className="text-lg font-bold text-crwn-text">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Lists filter */}
      {lists.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <ListIcon className="w-4 h-4 text-crwn-text-secondary" />
          <button
            onClick={() => setListFilter('')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              !listFilter ? 'bg-crwn-gold text-black' : 'bg-crwn-card text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            All
          </button>
          {lists.map(list => (
            <button
              key={list.id}
              onClick={() => setListFilter(listFilter === list.id ? '' : list.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                listFilter === list.id ? 'bg-crwn-gold text-black' : 'bg-crwn-card text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              {list.name} ({list.contact_count})
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-crwn-text-secondary" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, Instagram, or tags..."
          className="w-full pl-10 pr-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-full text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
        />
      </div>

      {/* Table + drawer */}
      <div className="flex gap-6">
        <div className={`${selectedContact ? 'flex-1' : 'w-full'} bg-crwn-card rounded-xl border border-crwn-elevated overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-crwn-elevated">
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase cursor-pointer" onClick={() => handleSort('name')}>
                    <div className="flex items-center gap-1">Contact <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Tags</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Platform</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase cursor-pointer" onClick={() => handleSort('created_at')}>
                    <div className="flex items-center gap-1">Added <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-crwn-text-secondary text-sm">No contacts match your filters.</td></tr>
                ) : (
                  filtered.map(contact => {
                    const status = STATUSES.find(s => s.id === contact.status);
                    return (
                      <tr
                        key={contact.id}
                        onClick={() => { setSelectedContact(contact); setNewNote(''); setNewTag(''); }}
                        className={`border-b border-crwn-elevated/50 cursor-pointer transition-colors ${
                          selectedContact?.id === contact.id ? 'bg-crwn-elevated/40' : 'hover:bg-crwn-elevated/20'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="min-w-[160px]">
                            <p className="text-sm font-medium text-crwn-text truncate">{contact.name}</p>
                            <p className="text-xs text-crwn-text-secondary truncate">{contact.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status?.color} ${status?.bg}`}>
                            {status?.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-crwn-text-secondary capitalize">
                          {contact.source}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap max-w-[200px]">
                            {contact.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 rounded bg-crwn-elevated text-[10px] text-crwn-text-secondary">{tag}</span>
                            ))}
                            {contact.tags.length > 3 && (
                              <span className="text-[10px] text-crwn-text-secondary">+{contact.tags.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {contact.artist_profile_id ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium text-green-400 bg-green-400/10">
                              On Platform
                            </span>
                          ) : (
                            <span className="text-xs text-crwn-text-secondary">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-crwn-text-secondary whitespace-nowrap">
                          {timeAgo(contact.created_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Contact detail drawer */}
        {selectedContact && (
          <div className="w-80 shrink-0 bg-crwn-card rounded-xl border border-crwn-elevated p-4 space-y-4 self-start sticky top-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-crwn-text">{selectedContact.name}</h3>
              <button onClick={() => setSelectedContact(null)} className="text-xs text-crwn-text-secondary hover:text-crwn-text">Close</button>
            </div>

            <div className="text-xs text-crwn-text-secondary space-y-1">
              <p>{selectedContact.email}</p>
              {selectedContact.phone && <p>{selectedContact.phone}</p>}
              {selectedContact.instagram && <p>@{selectedContact.instagram}</p>}
              <p>Source: {selectedContact.source}</p>
              <p>Added {new Date(selectedContact.created_at).toLocaleDateString()}</p>
              {selectedContact.imported_at && <p>Imported {new Date(selectedContact.imported_at).toLocaleDateString()}</p>}
            </div>

            {/* Status select */}
            <div>
              <label className="text-xs text-crwn-text-secondary block mb-1">Status</label>
              <div className="relative">
                <select
                  value={selectedContact.status}
                  onChange={e => handleStatusChange(selectedContact.id, e.target.value)}
                  className="w-full px-3 py-1.5 bg-crwn-elevated border border-crwn-elevated rounded-lg text-xs text-crwn-text appearance-none focus:outline-none focus:border-crwn-gold/50"
                >
                  {STATUSES.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-crwn-text-secondary pointer-events-none" />
              </div>
            </div>

            {/* Artist data if linked */}
            {selectedContact.artist_data && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-crwn-elevated rounded-lg p-2.5">
                  <div className="text-xs text-crwn-text-secondary">Revenue</div>
                  <div className="text-lg font-bold text-crwn-text">${(selectedContact.artist_data.revenue / 100).toFixed(0)}</div>
                </div>
                <div className="bg-crwn-elevated rounded-lg p-2.5">
                  <div className="text-xs text-crwn-text-secondary">Fans</div>
                  <div className="text-lg font-bold text-crwn-text">{selectedContact.artist_data.subscribers}</div>
                </div>
                <div className="bg-crwn-elevated rounded-lg p-2.5">
                  <div className="text-xs text-crwn-text-secondary">Stage</div>
                  <div className="text-xs font-medium text-crwn-text capitalize">{selectedContact.artist_data.pipeline_stage}</div>
                </div>
                <div className="bg-crwn-elevated rounded-lg p-2.5">
                  <div className="text-xs text-crwn-text-secondary">Tier</div>
                  <div className="text-xs font-medium text-crwn-text capitalize">{selectedContact.artist_data.platform_tier}</div>
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="border-t border-crwn-elevated pt-3">
              <h4 className="text-xs font-medium text-crwn-text-secondary mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tags
              </h4>
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedContact.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-crwn-elevated text-xs text-crwn-text-secondary">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-400 transition">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                  placeholder="Add tag..."
                  className="flex-1 px-2.5 py-1.5 bg-crwn-elevated border border-crwn-elevated rounded-lg text-xs text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                />
                <button
                  onClick={handleAddTag}
                  disabled={!newTag.trim()}
                  className="px-2.5 py-1.5 bg-crwn-elevated rounded-lg text-xs text-crwn-text-secondary hover:text-crwn-text disabled:opacity-40"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Notes */}
            <div className="border-t border-crwn-elevated pt-3">
              <h4 className="text-xs font-medium text-crwn-text-secondary mb-2 flex items-center gap-1">
                <StickyNote className="w-3 h-3" /> Notes
              </h4>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveNote()}
                  placeholder="Add a note..."
                  className="flex-1 px-2.5 py-1.5 bg-crwn-elevated border border-crwn-elevated rounded-lg text-xs text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                />
                <button
                  onClick={handleSaveNote}
                  disabled={isSavingNote || !newNote.trim()}
                  className="px-2.5 py-1.5 bg-crwn-gold text-crwn-bg rounded-lg text-xs font-semibold disabled:opacity-40"
                >
                  {isSavingNote ? '...' : 'Add'}
                </button>
              </div>
              {selectedContact.notes && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {selectedContact.notes.split('\n').filter(Boolean).map((line, i) => (
                    <div key={i} className="bg-crwn-elevated rounded-lg p-2">
                      <p className="text-xs text-crwn-text">{line}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-crwn-card border border-crwn-elevated rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-crwn-text flex items-center gap-2">
                <Upload className="w-5 h-5 text-crwn-gold" />
                Import Contacts
              </h3>
              <button onClick={() => setShowImport(false)} className="text-crwn-text-secondary hover:text-crwn-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* List selection */}
              <div>
                <label className="text-xs text-crwn-text-secondary block mb-1">Add to list</label>
                <div className="flex gap-2">
                  <select
                    value={importSelectedList}
                    onChange={e => { setImportSelectedList(e.target.value); if (e.target.value) setImportListName(''); }}
                    className="flex-1 px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text appearance-none focus:outline-none focus:border-crwn-gold/50"
                  >
                    <option value="">New list...</option>
                    {lists.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                {!importSelectedList && (
                  <input
                    type="text"
                    value={importListName}
                    onChange={e => setImportListName(e.target.value)}
                    placeholder="New list name (e.g. Instagram DMs March)"
                    className="mt-2 w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                  />
                )}
              </div>

              {/* CSV upload */}
              <div>
                <label className="text-xs text-crwn-text-secondary block mb-1">CSV file</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-4 py-8 border-2 border-dashed border-crwn-elevated rounded-xl text-sm text-crwn-text-secondary hover:border-crwn-gold/30 hover:text-crwn-text transition text-center"
                >
                  {importCsv ? (
                    <span className="text-green-400">CSV loaded ({importCsv.split('\n').length - 1} rows)</span>
                  ) : (
                    <>Click to upload CSV</>
                  )}
                </button>
              </div>

              {/* Or paste */}
              <div>
                <label className="text-xs text-crwn-text-secondary block mb-1">Or paste CSV</label>
                <textarea
                  value={importCsv}
                  onChange={e => setImportCsv(e.target.value)}
                  placeholder="name,email,instagram,source,tags&#10;John Doe,john@email.com,@johndoe,instagram,hip-hop;producer"
                  rows={4}
                  className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-xs text-crwn-text font-mono placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50 resize-none"
                />
              </div>

              <p className="text-[10px] text-crwn-text-secondary">
                Columns: name, email (required), phone, instagram, source, tags (semicolon-separated), notes. Duplicate emails are skipped.
              </p>

              {importResult && (
                <div className="bg-crwn-elevated rounded-lg p-3 text-xs">
                  <p className="text-green-400">Imported {importResult.imported} contacts</p>
                  {importResult.skipped > 0 && <p className="text-crwn-text-secondary">{importResult.skipped} skipped (duplicates)</p>}
                  {importResult.failed > 0 && <p className="text-red-400">{importResult.failed} failed</p>}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowImport(false)}
                className="px-4 py-2 rounded-full bg-crwn-elevated text-sm text-crwn-text-secondary hover:text-crwn-text transition"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting || !importCsv.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-crwn-gold text-black text-sm font-medium hover:brightness-110 transition disabled:opacity-50"
              >
                {isImporting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Import</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
