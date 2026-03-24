'use client';

interface CohortData {
  month: string;
  cohortSize: number;
  retention: number[];
}

interface CohortRetentionChartProps {
  data: CohortData[];
  title?: string;
}

function retentionColor(pct: number): string {
  if (pct >= 90) return 'bg-green-500/30 text-green-400';
  if (pct >= 70) return 'bg-green-500/15 text-green-400';
  if (pct >= 50) return 'bg-yellow-500/15 text-yellow-400';
  if (pct >= 30) return 'bg-orange-500/15 text-orange-400';
  return 'bg-red-500/15 text-red-400';
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function CohortRetentionChart({ data, title }: CohortRetentionChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="text-[#666] text-sm py-4 text-center">
        Not enough data for cohort analysis yet
      </div>
    );
  }

  // Find the max number of retention months across all cohorts
  const maxMonths = Math.max(...data.map(d => d.retention.length));

  return (
    <div>
      {title && <h3 className="text-sm font-medium text-[#999] mb-3">{title}</h3>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left text-[#666] font-normal py-2 pr-3 whitespace-nowrap">Cohort</th>
              <th className="text-center text-[#666] font-normal py-2 px-1 whitespace-nowrap">Size</th>
              {Array.from({ length: Math.min(maxMonths, 12) }, (_, i) => (
                <th key={i} className="text-center text-[#666] font-normal py-2 px-1 whitespace-nowrap">
                  M{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((cohort) => (
              <tr key={cohort.month} className="border-t border-[#1a1a1a]">
                <td className="text-[#ccc] py-1.5 pr-3 whitespace-nowrap font-medium">
                  {formatMonth(cohort.month)}
                </td>
                <td className="text-center text-[#999] py-1.5 px-1">
                  {cohort.cohortSize}
                </td>
                {Array.from({ length: Math.min(maxMonths, 12) }, (_, i) => {
                  const pct = cohort.retention[i];
                  if (pct === undefined) {
                    return <td key={i} className="py-1.5 px-1" />;
                  }
                  return (
                    <td key={i} className="py-1.5 px-1">
                      <div className={`rounded px-1.5 py-0.5 text-center font-medium ${retentionColor(pct)}`}>
                        {pct}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-[#666]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/30" /> 90%+</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/15" /> 70-89%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/15" /> 50-69%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500/15" /> 30-49%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/15" /> &lt;30%</span>
      </div>
    </div>
  );
}
