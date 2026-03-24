'use client';

import { FAN_CANCEL_REASONS, PLATFORM_CANCEL_REASONS } from '@/lib/cancellationReasons';

interface ReasonCount {
  reason: string;
  count: number;
}

interface CancelReasonChartProps {
  reasons: ReasonCount[];
  context: 'fan' | 'platform';
  recentFreeform?: { text: string; date?: string; context?: string }[];
}

export default function CancelReasonChart({ reasons, context, recentFreeform }: CancelReasonChartProps) {
  const labelMap = (context === 'fan' ? FAN_CANCEL_REASONS : PLATFORM_CANCEL_REASONS)
    .reduce((acc, r) => { acc[r.key] = r.label; return acc; }, {} as Record<string, string>);

  if (!reasons || reasons.length === 0) {
    return (
      <div className="text-[#666] text-sm py-4 text-center">
        No cancellation feedback collected yet
      </div>
    );
  }

  const maxCount = Math.max(...reasons.map(r => r.count));

  return (
    <div className="space-y-4">
      {/* Bar chart */}
      <div className="space-y-2">
        {reasons.slice(0, 8).map((r) => (
          <div key={r.reason} className="flex items-center gap-3">
            <span className="text-xs text-[#ccc] w-40 truncate flex-shrink-0">
              {labelMap[r.reason] || r.reason}
            </span>
            <div className="flex-1 bg-[#0D0D0D] rounded-full h-5 overflow-hidden">
              <div
                className="h-full bg-red-500/30 rounded-full flex items-center justify-end pr-2"
                style={{ width: `${Math.max((r.count / maxCount) * 100, 10)}%` }}
              >
                <span className="text-[10px] text-red-400 font-medium">{r.count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent freeform feedback */}
      {recentFreeform && recentFreeform.length > 0 && (
        <div>
          <h4 className="text-xs text-[#666] font-medium mb-2 uppercase tracking-wider">Recent Feedback</h4>
          <div className="space-y-1.5">
            {recentFreeform.slice(0, 5).map((f, i) => (
              <div key={i} className="bg-[#0D0D0D] rounded-lg px-3 py-2">
                <p className="text-xs text-[#ccc] italic">&ldquo;{f.text}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
