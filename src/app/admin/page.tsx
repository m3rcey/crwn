'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, BarChart3, Users, Mail, Filter, Instagram, Megaphone, LifeBuoy, Banknote, Radar } from 'lucide-react';
// The old 1,000-line dashboard (AdminDashboard.tsx) is preserved in the repo, unmounted: it read
// LGP:CAC, per-tier Hormozi economics, payback period, cohort retention and projections over nine
// artists. The Dashboard tab now renders the 90-day experiment scorecard instead.
import ExperimentScorecard from '@/components/admin/ExperimentScorecard';
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
// AgentInsights (CRWN's OWN autonomous business agent) is hidden from every admin tab by the
// 2026-08-13 surface reduction. HIDE + disable the schedule, not delete: the routes, signature
// scheme, coordination lock and tables all remain, so re-enabling is a UI change.
import ApprovalsManager from '@/components/admin/ApprovalsManager';
import AcquisitionView from '@/components/admin/AcquisitionView';
import SupportChatView from '@/components/admin/SupportChatView';
import MoneyModelView from '@/components/admin/MoneyModelView';
import DistributionFinder from '@/components/admin/DistributionFinder';
// ManagerOpsView (ARTIST-facing Manager telemetry) was removed from admin navigation by the
// 2026-08-13 surface reduction: it reports on a system with 7 actions and 7 insights all time,
// whose scheduled half is being deleted and whose artist-facing half is hidden. The component
// and its API remain in the repo.

type AdminTab =
  | 'dashboard' | 'acquisition' | 'leadmagnets' | 'distribution' | 'funnel' | 'pipeline' | 'support' | 'moneymodel' | 'email'
  | 'avatars' | 'experiments' | 'crm' | 'partners' | 'access' | 'sequences';

/** The nine buttons. Order is the founder's reading order, not alphabetical.
 *  Distribution joined 2026-08-24 by founder request: it is used immediately
 *  before publishing each carousel, so it earns a button. */
const PRIMARY_TABS: { id: AdminTab; label: string; Icon: typeof BarChart3 }[] = [
  { id: 'dashboard',   label: 'Dashboard',   Icon: BarChart3 },
  { id: 'acquisition', label: 'Acquisition', Icon: Instagram },
  { id: 'leadmagnets', label: 'Lead Magnets', Icon: Megaphone },
  { id: 'distribution', label: 'Distribution', Icon: Radar },
  { id: 'funnel',      label: 'Funnel',      Icon: Filter },
  { id: 'pipeline',    label: 'Pipeline',    Icon: Users },
  { id: 'support',     label: 'Support',     Icon: LifeBuoy },
  { id: 'moneymodel',  label: 'Money Model', Icon: Banknote },
  { id: 'email',       label: 'Email Health', Icon: Mail },
];

/**
 * Reachable at /admin?tab=<id>, deliberately WITHOUT a button.
 *
 * Not deleted, because each still answers a real question occasionally: Avatars (which avatar did
 * the qualified leads belong to) and Sequences (is prospect nurture enrolling) get promoted back
 * the moment they have data to show. CRM and Partners duplicate Pipeline and a program with zero
 * referrals. Access holds the invite codes for concierge onboarding while artist_gate is OFF.
 * Experiments is one experiment and four events, which cannot decide anything yet.
 */
const SECONDARY_TABS: AdminTab[] = ['avatars', 'experiments', 'crm', 'partners', 'access', 'sequences'];

const TAB_IDS: AdminTab[] = [...PRIMARY_TABS.map((t) => t.id), ...SECONDARY_TABS];

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
      {/* Admin tab nav.
          PRE-PMF SURFACE REDUCTION, 2026-08-13. Fifteen buttons became EIGHT
          (Distribution joined later as the ninth, by founder request 2026-08-24).
          The founder should not operate a nine-artist business through a mature-SaaS cockpit.
          The eight left answer, in reading order: is acquisition working (Acquisition, Lead
          Magnets), where are the artists in activation (Funnel, Pipeline), what did my
          intervention cost (Money Model), and is anything on fire (Support, Email Health).
          Everything removed is still reachable at /admin?tab=<id> — see SECONDARY_TABS. */}
      <div className="max-w-7xl mx-auto px-4 pt-4 overflow-x-auto">
        <div className="flex items-center gap-1 bg-crwn-surface rounded-full p-1 w-fit mb-6">
          {PRIMARY_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === id ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'dashboard' && <ExperimentScorecard userId={user.id} />}
      {activeTab === 'pipeline' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <PipelineView />
        </div>
      )}
      {activeTab === 'partners' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <PartnersView />
        </div>
      )}
      {activeTab === 'funnel' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <FunnelView />
        </div>
      )}
      {activeTab === 'sequences' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <PlatformSequences />
          <ProspectNurtureView />
        </div>
      )}
      {activeTab === 'crm' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <CrmView />
        </div>
      )}
      {activeTab === 'email' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
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
          <ApprovalsManager />
        </div>
      )}

      {activeTab === 'support' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <SupportChatView />
        </div>
      )}

      {activeTab === 'moneymodel' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <MoneyModelView />
        </div>
      )}

      {activeTab === 'distribution' && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <DistributionFinder />
        </div>
      )}

    </div>
  );
}
