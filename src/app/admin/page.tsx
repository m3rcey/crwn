'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, BarChart3, Users, Zap, Mail } from 'lucide-react';
import AdminDashboard from '@/components/admin/AdminDashboard';
import PipelineView from '@/components/admin/PipelineView';
import PlatformSequences from '@/components/admin/PlatformSequences';
import EmailHealth from '@/components/admin/EmailHealth';

type AdminTab = 'dashboard' | 'pipeline' | 'sequences' | 'email';

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const supabase = createBrowserSupabaseClient();
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.role === 'admin') {
          setIsAdmin(true);
        } else {
          router.push('/home');
        }
        setChecking(false);
      });
  }, [user, authLoading, router]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!isAdmin || !user) return null;

  return (
    <div className="min-h-screen bg-[#0D0D0D]">
      {/* Admin tab nav */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-1 bg-crwn-card rounded-full p-1 w-fit mb-6">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'dashboard' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'pipeline' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Users className="w-4 h-4" />
            Pipeline
          </button>
          <button
            onClick={() => setActiveTab('sequences')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'sequences' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Zap className="w-4 h-4" />
            Sequences
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'email' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Mail className="w-4 h-4" />
            Email Health
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && <AdminDashboard userId={user.id} />}
      {activeTab === 'pipeline' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <PipelineView />
        </div>
      )}
      {activeTab === 'sequences' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <PlatformSequences />
        </div>
      )}
      {activeTab === 'email' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <EmailHealth userId={user.id} />
        </div>
      )}
    </div>
  );
}
