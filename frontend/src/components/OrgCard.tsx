import { useNavigate } from 'react-router-dom';
import RiskBadge from './RiskBadge';
import FlagBadge from './FlagBadge';
import { formatCurrency } from '../api';

export interface FlaggedOrg {
  bn_root: string;
  canonical_name: string;
  city?: string;
  province?: string;
  risk_score: number;
  tier: string;
  flags: string[];
  last_funded?: number;
  fed_total?: number;
  ab_total?: number;
  combined_funding?: number;
}

interface OrgCardProps {
  org: FlaggedOrg;
}

export default function OrgCard({ org }: OrgCardProps) {
  const navigate = useNavigate();
  const combined = org.combined_funding ?? ((org.fed_total ?? 0) + (org.ab_total ?? 0));
  const location = [org.city, org.province].filter(Boolean).join(', ');

  return (
    <div className="org-card" onClick={() => navigate(`/entity/${encodeURIComponent(org.bn_root)}`)}>
      <div className="org-card-header">
        <div>
          <div className="org-card-name">{org.canonical_name}</div>
          <div className="org-card-meta">
            {org.bn_root}
            {location ? ` · ${location}` : ''}
          </div>
        </div>
        <RiskBadge score={org.risk_score ?? 0} tier={org.tier ?? 'low'} />
      </div>

      {org.flags && org.flags.length > 0 && (
        <div className="org-card-flags">
          {org.flags.map((f) => (
            <FlagBadge key={f} type={f as any} />
          ))}
        </div>
      )}

      <div className="org-card-footer">
        <div className="org-card-funding">
          {combined > 0 && (
            <span>{formatCurrency(combined)} combined{org.last_funded ? ` · last funded ${org.last_funded}` : ''}</span>
          )}
        </div>
        <button
          className="org-card-cta"
          onClick={(e) => { e.stopPropagation(); navigate(`/entity/${encodeURIComponent(org.bn_root)}`); }}
        >
          Open Case File →
        </button>
      </div>
    </div>
  );
}
