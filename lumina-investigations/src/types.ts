/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LucideIcon } from 'lucide-react';

export type FlagType = 'zombie' | 'loop' | 'duplicate' | 'governance' | 'sole-source';

export interface Flag {
  type: FlagType;
  label: string;
  icon: string; // We'll map this to actual icons in components
  color: string;
}

export interface Organization {
  id: string;
  name: string;
  riskScore: number;
  totalFunding: number;
  lastUpdated: string;
  flags: FlagType[];
  description: string;
  location: string;
  history: {
    date: string;
    event: string;
  }[];
}

export const FLAGS: Record<FlagType, { label: string; color: string }> = {
  zombie: { label: 'Zombie Recipient', color: 'text-red-600 bg-red-50' },
  loop: { label: 'Funding Loop', color: 'text-orange-600 bg-orange-50' },
  duplicate: { label: 'Duplicative Funding', color: 'text-blue-600 bg-blue-50' },
  governance: { label: 'Network Risk', color: 'text-purple-600 bg-purple-50' },
  'sole-source': { label: 'Sole Source', color: 'text-amber-600 bg-amber-50' },
};

export const MOCK_ORGS: Organization[] = [
  {
    id: '1',
    name: 'Aethelgard Dynamics Corp',
    riskScore: 88,
    totalFunding: 12400000,
    lastUpdated: '2024-03-20',
    flags: ['zombie', 'governance'],
    location: 'Arlington, VA',
    description: 'A shell entity identified as potentially linked to a complex governance network spanning multiple districts with no active physical presence.',
    history: [
      { date: '2024-01-15', event: 'Initial flag: Missing reporting data' },
      { date: '2024-02-10', event: 'Elevated risk: Governance network correlation detected' }
    ]
  },
  {
    id: '2',
    name: 'Global Infra Solutions',
    riskScore: 45,
    totalFunding: 45000000,
    lastUpdated: '2024-03-21',
    flags: ['duplicate'],
    location: 'Houston, TX',
    description: 'High-volume infrastructure provider flagged for potential overlap in regional development grants across DOT and DOE.',
    history: [
      { date: '2024-02-01', event: 'Audit triggered: Cross-agency funding overlap' }
    ]
  },
  {
    id: '3',
    name: 'Veridia Tech Systems',
    riskScore: 92,
    totalFunding: 8200000,
    lastUpdated: '2024-03-18',
    flags: ['zombie', 'loop', 'sole-source'],
    location: 'San Jose, CA',
    description: 'Primary recipient of environmental tech grants showing signs of inactive staff registers and revolving funding loops.',
    history: [
      { date: '2023-12-01', event: 'Red flag: Board member overlap with granting agency' }
    ]
  },
  {
    id: '4',
    name: 'Northstar Logistics',
    riskScore: 12,
    totalFunding: 1500000,
    lastUpdated: '2024-03-25',
    flags: [],
    location: 'Chicago, IL',
    description: 'Logistics provider with consistent reporting metrics and low relational risk.',
    history: []
  },
  {
    id: '5',
    name: 'Sentinel Data Group',
    riskScore: 76,
    totalFunding: 19800000,
    lastUpdated: '2024-03-22',
    flags: ['governance', 'sole-source'],
    location: 'Denver, CO',
    description: 'Data management firm with high concentration of sole-source contracts within specifically scoped municipal networks.',
    history: [
      { date: '2024-01-20', event: 'Contract flagged: Non-competitive bid sequence' }
    ]
  }
];
