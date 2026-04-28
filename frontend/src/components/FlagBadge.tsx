import { Skull, Repeat2, Banknote, Users, AlertTriangle } from 'lucide-react';

type FlagType = 'zombie' | 'loop' | 'duplicate' | 'governance';

interface FlagBadgeProps {
  type: FlagType;
}

const FLAG_META: Record<FlagType, { Icon: React.ElementType; label: string }> = {
  zombie:     { Icon: Skull,    label: 'Zombie' },
  loop:       { Icon: Repeat2,  label: 'Loop' },
  duplicate:  { Icon: Banknote, label: 'Duplicate' },
  governance: { Icon: Users,    label: 'Governance' },
};

export default function FlagBadge({ type }: FlagBadgeProps) {
  const meta = FLAG_META[type] || { Icon: AlertTriangle, label: type };
  const { Icon, label } = meta;
  return (
    <span className={`flag-badge ${type}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Icon size={11} />
      {label}
    </span>
  );
}
