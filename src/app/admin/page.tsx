'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, BarChart3, Users, Zap, Mail, Handshake, Filter, Contact, KeyRound, Instagram, Megaphone, FlaskConical, LifeBuoy } from 'lucide-react';
import AdminDashboard from '@/components/admin/AdminDashboard';
import LeadMagnetsView from '@/components/admin/LeadMagnetsView';
import AvatarCohortsView from '@/components/admin/AvatarCohortsView';
import ExperimentsView from '@/components/admin/ExperimentsView';
import PipelineView from '@/components/admin/PipelineView';
import FunnelView from '@/components/admin/FunnelView';
import PlatformSequences from '@/components/admin/PlatformSequences';
import ProspectNurtureView from '@/components/admin/ProspectNurtureView';
import EmailHealth from '@/components/admin/EmailHealth';
import PartnersView from '@/components/admin/PartnersView';
import CrmView from '@/components/admin/CrmView';
import AgentInsights from '@/components/admin/AgentInsights';
import ApprovalsManager from '@/components/admin/ApprovalsManager';
import AcquisitionView from '@/components/admin/AcquisitionView';
import SupportChatView from '@/components/admin/SupportChatView';

type AdminTab = 'dashboard' | 'pipeline' | 'partners' | 'funnel' | 'sequences' | 'email' | 'crm' | 'access' | 'acquisition' | 'leadmagnets' | 'avatars' | 'experiments' | 'support';

const TAB_IDS: AdminTab[] = ['dashboard', 'pipeline', 'partners', 'funnel', 'sequences', 'email', 'crm', 'access', 'acquisition', 'leadmagnets', 'avatars', 'experiments', 'support'];

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  // ?tab= deep link, so escalation emails can land straight on the Support tab.
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const t = new URLSearchParams(window.location.search).get('tab') as AdminTab | null;
    return t && TAB_IDS.includes(t) ? t : 'dashboard';
  });

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
      <div className="max-w-7xl mx-auto px-4 pt-4 overflow-x-auto">
        <div className="flex items-center gap-1 bg-crwn-surface rounded-full p-1 w-fit mb-6">
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
            onClick={() => setActiveTab('partners')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'partners' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Handshake className="w-4 h-4" />
            Partners
          </button>
          <button
            onClick={() => setActiveTab('funnel')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'funnel' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Filter className="w-4 h-4" />
            Funnel
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
            onClick={() => setActiveTab('crm')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'crm' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Contact className="w-4 h-4" />
            CRM
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
          <button
            onClick={() => setActiveTab('acquisition')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'acquisition' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Instagram className="w-4 h-4" />
            Acquisition
          </button>
          <button
            onClick={() => setActiveTab('leadmagnets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'leadmagnets' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            Lead Magnets
          </button>
          <button
            onClick={() => setActiveTab('avatars')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'avatars' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            Avatars
          </button>
          <button
            onClick={() => setActiveTab('experiments')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'experiments' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <FlaskConical className="w-4 h-4" />
            Experiments
          </button>
          <button
            onClick={() => setActiveTab('access')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'access' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Access
          </button>
          <button
            onClick={() => setActiveTab('support')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'support' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <LifeBuoy className="w-4 h-4" />
            Support
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && <AdminDashboard userId={user.id} />}
      {activeTab === 'pipeline' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <AgentInsights userId={user.id} scope="pipeline" />
          <PipelineView />
        </div>
      )}
      {activeTab === 'partners' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <AgentInsights userId={user.id} scope="partners" />
          <PartnersView />
        </div>
      )}
      {activeTab === 'funnel' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <AgentInsights userId={user.id} scope="funnel" />
          <FunnelView />
        </div>
      )}
      {activeTab === 'sequences' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <AgentInsights userId={user.id} scope="sequences" />
          <PlatformSequences />
          <ProspectNurtureView />
        </div>
      )}
      {activeTab === 'crm' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <AgentInsights userId={user.id} scope="crm" />
          <CrmView />
        </div>
      )}
      {activeTab === 'email' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <AgentInsights userId={user.id} scope="email" />
          <EmailHealth userId={user.id} />
        </div>
      )}
      {activeTab === 'acquisition' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <AcquisitionView />
        </div>
      )}

      {activeTab === 'leadmagnets' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <LeadMagnetsView />
        </div>
      )}

      {activeTab === 'avatars' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <AvatarCohortsView />
        </div>
      )}

      {activeTab === 'experiments' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <ExperimentsView />
        </div>
      )}

      {activeTab === 'access' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <ApprovalsManager userId={user.id} />
        </div>
      )}

      {activeTab === 'support' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <SupportChatView />
        </div>
      )}
    </div>
  );
}
