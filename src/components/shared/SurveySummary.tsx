'use client';

import { FAN_LOYALTY_REASONS, PLATFORM_LOYALTY_REASONS } from '@/lib/cancellationReasons';

interface SurveySummaryProps {
  data: {
    count: number;
    whyStayed: { reason: string; count: number }[];
    avgNps: number | null;
    recentFreeform: string[];
  };
  context: 'fan' | 'artist';
}

function npsColor(score: number): string {
  if (score >= 9) return 'text-green-400';
  if (score >= 7) return 'text-yellow-400';
  return 'text-red-400';
}

function npsLabel(score: number): string {
  if (score >= 9) return 'Promoters';
  if (score >= 7) return 'Passive';
  return 'Detractors';
}

export default function SurveySummary({ data, context }: SurveySummaryProps) {
  const labelMap = (context === 'fan' ? FAN_LOYALTY_REASONS : PLATFORM_LOYALTY_REASONS)
    .reduce((acc, r) => { acc[r.key] = r.label; return acc; }, {} as Record<string, string>);

  if (!data || data.count === 0) {
    return (
      <div className="text-[#666] text-sm py-4 text-center">
        No survey responses yet. Responses will appear here once fans complete loyalty surveys.
      </div>
    );
  }

  const maxCount = data.whyStayed.length > 0 ? Math.max(...data.whyStayed.map(r => r.count)) : 1;

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex items-center gap-6">
        <div>
          <p className="text-[#666] text-xs">Responses</p>
          <p className="text-lg font-bold text-white">{data.count}</p>
        </div>
        {data.avgNps !== null && (
          <div>
            <p className="text-[#666] text-xs">Avg NPS</p>
            <p className={`text-lg font-bold ${npsColor(data.avgNps)}`}>
              {data.avgNps} <span className="text-xs font-normal text-[#666]">/ 10 ({npsLabel(data.avgNps)})</span>
            </p>
          </div>
        )}
      </div>

      {/* Why they stayed */}
      {data.whyStayed.length > 0 && (
        <div>
          <h4 className="text-xs text-[#666] font-medium mb-2 uppercase tracking-wider">Why They Stay</h4>
          <div className="space-y-1.5">
            {data.whyStayed.slice(0, 7).map((r) => (
              <div key={r.reason} className="flex items-center gap-3">
                <span className="text-xs text-[#ccc] w-44 truncate flex-shrink-0">
                  {labelMap[r.reason] || r.reason}
                </span>
                <div className="flex-1 bg-[#0D0D0D] rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-[#D4AF37]/30 rounded-full flex items-center justify-end pr-2"
                    style={{ width: `${Math.max((r.count / maxCount) * 100, 10)}%` }}
                  >
                    <span className="text-[10px] text-[#D4AF37] font-medium">{r.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent freeform */}
      {data.recentFreeform.length > 0 && (
        <div>
          <h4 className="text-xs text-[#666] font-medium mb-2 uppercase tracking-wider">What They Said</h4>
          <div className="space-y-1.5">
            {data.recentFreeform.slice(0, 3).map((text, i) => (
              <div key={i} className="bg-[#0D0D0D] rounded-lg px-3 py-2">
                <p className="text-xs text-[#ccc] italic">&ldquo;{text}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
