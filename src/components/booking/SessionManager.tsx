'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { BookingSession } from '@/types';
import { Loader2, Plus, Pencil, Trash2, X } from 'lucide-react';

interface SessionManagerProps {
  artistId: string;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export function SessionManager({ artistId }: SessionManagerProps) {
  const supabase = createBrowserSupabaseClient();
  const { user } = useAuth();
  
  const [sessions, setSessions] = useState<BookingSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState<BookingSession | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState(0);
  const [calendlyEventUrl, setCalendlyEventUrl] = useState('');

  useEffect(() => {
    loadSessions();
  }, [artistId]);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('booking_sessions')
        .select('*')
        .eq('artist_id', artistId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDuration(30);
    setPrice(0);
    setCalendlyEventUrl('');
    setEditingSession(null);
    setShowForm(false);
  };

  const handleEdit = (session: BookingSession) => {
    setTitle(session.title);
    setDescription(session.description || '');
    setDuration(session.duration_minutes);
    setPrice(session.price / 100); // Convert cents to dollars for display
    setCalendlyEventUrl(session.calendly_event_url || '');
    setEditingSession(session);
    setShowForm(true);
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;

    try {
      await supabase
        .from('booking_sessions')
        .update({ is_active: false })
        .eq('id', sessionId);
      loadSessions();
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const handleSave = async () => {
    if (!user || !title.trim()) return;

    setIsSaving(true);
    try {
      const sessionData = {
        artist_id: artistId,
        title: title.trim(),
        description: description.trim() || null,
        duration_minutes: duration,
        price: Math.round(price * 100), // Convert dollars to cents
        calendly_event_url: calendlyEventUrl.trim() || null,
      };

      if (editingSession) {
        const { error } = await supabase
          .from('booking_sessions')
          .update(sessionData)
          .eq('id', editingSession.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('booking_sessions')
          .insert(sessionData);
        if (error) throw error;
      }

      resetForm();
      loadSessions();
    } catch (error) {
      console.error('Error saving session:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="neu-raised rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-crwn-text">Shop Sessions</h2>
        <button
          onClick={() => setShowForm(true)}
          className="neu-button-accent px-4 py-2 rounded-xl flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Session
        </button>
      </div>

      {/* Session Form */}
      {showForm && (
        <div className="neu-inset p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-crwn-text font-medium">
              {editingSession ? 'Edit Session' : 'New Session'}
            </h3>
            <button onClick={resetForm} className="text-crwn-text-dim hover:text-crwn-text">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-crwn-text-dim text-sm mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="30-Minute Vocal Coaching"
                className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-crwn-text-dim text-sm mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What the session includes..."
                rows={3}
                className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-crwn-text-dim text-sm mb-1">Duration (min)</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                  className="neu-inset w-full px-3 py-2 text-crwn-text focus:outline-none"
                >
                  {DURATION_OPTIONS.map(d => (
                    <option key={d} value={d}>{d} min</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-crwn-text-dim text-sm mb-1">Price ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  className="neu-inset w-full px-3 py-2 text-crwn-text focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-crwn-text-dim text-sm mb-1">Calendly Event URL (optional)</label>
              <input
                type="url"
                value={calendlyEventUrl}
                onChange={(e) => setCalendlyEventUrl(e.target.value)}
                placeholder="https://calendly.com/your-username/30-min"
                className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={!title.trim() || isSaving}
              className="neu-button-accent w-full py-2 rounded-xl font-semibold disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save Session'}
            </button>
          </div>
        </div>
      )}

      {/* Sessions List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
        </div>
      ) : sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map(session => (
            <div key={session.id} className="neu-inset p-4 flex items-center justify-between">
              <div>
                <h4 className="text-crwn-text font-medium">{session.title}</h4>
                <div className="flex items-center gap-3 mt-1 text-crwn-text-dim text-sm">
                  <span>⏱ {session.duration_minutes} min</span>
                  <span>•</span>
                  <span className="text-crwn-gold font-semibold">${session.price / 100}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(session)}
                  className="neu-icon-button p-2"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(session.id)}
                  className="neu-icon-button p-2 text-crwn-error"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-crwn-text-dim text-center py-8">No sessions yet. Add one to sell 1-on-1 sessions!</p>
      )}
    </div>
  );
}
