interface RiskBadgeProps {
  score: number;
  tier: string;
}

const TIER_LABELS: Record<string, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

export default function RiskBadge({ score, tier }: RiskBadgeProps) {
  const t = (tier || 'low').toLowerCase();
  return (
    <span className={`risk-badge ${t}`}>
      {score}<span style={{ opacity: 0.6, fontSize: 11 }}>/100</span>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
        {TIER_LABELS[t] || t.toUpperCase()}
      </span>
    </span>
  );
}
