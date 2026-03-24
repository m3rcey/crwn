interface Insight {
  priority: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  body: string;
  metric: string;
}

export function adminDailyBriefingEmail(data: {
  insights: Insight[];
  metricsSnapshot: {
    lgpCacRatio: number;
    totalMRR: number;
    artistChurnRate: number;
    healthCheckRatio: number;
    healthCheckPassing: boolean;
    totalActiveFans: number;
    artistNetGrowth: number;
    fanChurned: number;
  };
  analyzedAt: string;
}): string {
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const criticals = data.insights.filter(i => i.priority === 'critical');
  const warnings = data.insights.filter(i => i.priority === 'warning');
  const infos = data.insights.filter(i => i.priority === 'info');

  const insightBlock = (insights: Insight[], color: string, label: string) => {
    if (insights.length === 0) return '';
    return `
      <div style="margin:0 0 20px;">
        <p style="color:${color};font-size:12px;font-weight:700;text-transform:uppercase;margin:0 0 8px;letter-spacing:1px;">${label}</p>
        ${insights.map(i => `
          <div style="background:#1A1A1A;border-left:3px solid ${color};border-radius:8px;padding:12px 16px;margin:0 0 8px;">
            <p style="color:#FFFFFF;font-size:14px;font-weight:600;margin:0 0 4px;">${i.title}</p>
            <p style="color:#A0A0A0;font-size:13px;line-height:1.5;margin:0;">${i.body}</p>
            <p style="color:#555;font-size:11px;margin:4px 0 0;">${i.category} | ${i.metric}</p>
          </div>
        `).join('')}
      </div>
    `;
  };

  const m = data.metricsSnapshot;
  const ratioColor = m.lgpCacRatio >= 10 ? '#10B981' : m.lgpCacRatio >= 5 ? '#D4AF37' : m.lgpCacRatio >= 3 ? '#F59E0B' : '#E53935';
  const churnColor = m.artistChurnRate <= 2 ? '#10B981' : m.artistChurnRate <= 5 ? '#D4AF37' : '#E53935';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#D4AF37;font-size:32px;margin:0;">CRWN</h1>
      <p style="color:#666;font-size:14px;margin:8px 0 0;">Daily Command Center Briefing</p>
    </div>

    <div style="background-color:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #333;">
      <!-- Key Metrics Snapshot -->
      <div style="display:flex;gap:12px;margin:0 0 24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:120px;background:#141414;border-radius:12px;padding:12px;text-align:center;">
          <p style="color:#666;font-size:10px;text-transform:uppercase;margin:0 0 4px;">LGP:CAC</p>
          <p style="color:${ratioColor};font-size:24px;font-weight:700;margin:0;">${m.lgpCacRatio === Infinity ? '∞' : m.lgpCacRatio}:1</p>
        </div>
        <div style="flex:1;min-width:120px;background:#141414;border-radius:12px;padding:12px;text-align:center;">
          <p style="color:#666;font-size:10px;text-transform:uppercase;margin:0 0 4px;">MRR</p>
          <p style="color:#D4AF37;font-size:24px;font-weight:700;margin:0;">${fmt(m.totalMRR)}</p>
        </div>
        <div style="flex:1;min-width:120px;background:#141414;border-radius:12px;padding:12px;text-align:center;">
          <p style="color:#666;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Churn</p>
          <p style="color:${churnColor};font-size:24px;font-weight:700;margin:0;">${m.artistChurnRate}%</p>
        </div>
        <div style="flex:1;min-width:120px;background:#141414;border-radius:12px;padding:12px;text-align:center;">
          <p style="color:#666;font-size:10px;text-transform:uppercase;margin:0 0 4px;">30d Health</p>
          <p style="color:${m.healthCheckPassing ? '#10B981' : '#E53935'};font-size:24px;font-weight:700;margin:0;">${m.healthCheckRatio}x</p>
        </div>
      </div>

      <!-- Scoreboard Quick -->
      <div style="display:flex;gap:12px;margin:0 0 24px;">
        <div style="flex:1;background:#141414;border-radius:12px;padding:12px;text-align:center;">
          <p style="color:#666;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Artist Net Growth</p>
          <p style="color:${m.artistNetGrowth >= 0 ? '#10B981' : '#E53935'};font-size:20px;font-weight:700;margin:0;">${m.artistNetGrowth >= 0 ? '+' : ''}${m.artistNetGrowth}</p>
        </div>
        <div style="flex:1;background:#141414;border-radius:12px;padding:12px;text-align:center;">
          <p style="color:#666;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Fans Churned</p>
          <p style="color:${m.fanChurned > 0 ? '#E53935' : '#10B981'};font-size:20px;font-weight:700;margin:0;">${m.fanChurned}</p>
        </div>
        <div style="flex:1;background:#141414;border-radius:12px;padding:12px;text-align:center;">
          <p style="color:#666;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Active Fans</p>
          <p style="color:#D4AF37;font-size:20px;font-weight:700;margin:0;">${m.totalActiveFans}</p>
        </div>
      </div>

      <!-- Insights -->
      <h2 style="color:#FFFFFF;font-size:18px;margin:0 0 16px;">Agent Insights</h2>

      ${criticals.length === 0 && warnings.length === 0 && infos.length === 0
        ? '<p style="color:#10B981;font-size:14px;">All systems healthy. No action items today.</p>'
        : `
          ${insightBlock(criticals, '#E53935', 'Critical: Act Now')}
          ${insightBlock(warnings, '#D4AF37', 'Warnings')}
          ${insightBlock(infos, '#3B82F6', 'Info')}
        `
      }
    </div>

    <div style="text-align:center;margin-top:24px;">
      <a href="https://thecrwn.app/admin" style="display:inline-block;background:#D4AF37;color:#000;text-decoration:none;padding:12px 32px;border-radius:999px;font-weight:600;font-size:14px;">Open Command Center</a>
    </div>

    <p style="color:#444;font-size:11px;text-align:center;margin:24px 0 0;">
      CRWN Command Center | Analyzed ${data.analyzedAt}
    </p>
  </div>
</body>
</html>
  `.trim();
}
