type FlagType = 'zombie' | 'loop' | 'duplicate' | 'governance';

interface FlagBadgeProps {
  type: FlagType;
}

const FLAG_META: Record<FlagType, { emoji: string; label: string }> = {
  zombie:     { emoji: '🧟', label: 'Zombie' },
  loop:       { emoji: '🔄', label: 'Loop' },
  duplicate:  { emoji: '💰', label: 'Duplicate' },
  governance: { emoji: '👥', label: 'Governance' },
};

export default function FlagBadge({ type }: FlagBadgeProps) {
  const meta = FLAG_META[type] || { emoji: '⚠️', label: type };
  return (
    <span className={`flag-badge ${type}`}>
      {meta.emoji} {meta.label}
    </span>
  );
}
