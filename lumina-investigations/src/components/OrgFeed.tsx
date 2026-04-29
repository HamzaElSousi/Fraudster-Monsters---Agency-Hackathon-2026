import React, { useState } from 'react';
import { 
  Filter, 
  ChevronDown, 
  AlertCircle, 
  ArrowUpRight, 
  ShieldAlert, 
  Fingerprint, 
  Repeat, 
  Users,
  FileSearch,
  Activity,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MOCK_ORGS, Organization, FLAGS, FlagType } from '../types';

const FLAG_ICONS: Record<string, any> = {
  zombie: Fingerprint,
  loop: Repeat,
  duplicate: ShieldAlert,
  governance: Users,
  'sole-source': FileSearch,
};

interface OrgFeedProps {
  onSelect: (org: Organization) => void;
}

export const OrgFeed: React.FC<OrgFeedProps> = ({ onSelect }) => {
  const [filter, setFilter] = useState<FlagType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'risk' | 'funding' | 'recent'>('risk');

  const filteredOrgs = MOCK_ORGS
    .filter(org => filter === 'all' || org.flags.includes(filter as FlagType))
    .sort((a, b) => {
      if (sortBy === 'risk') return b.riskScore - a.riskScore;
      if (sortBy === 'funding') return b.totalFunding - a.totalFunding;
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    });

  return (
    <section className="py-12">
      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Avg Risk', value: '64.2%', icon: Activity },
          { label: 'Total Scoped', value: '$242M', icon: DollarSign },
          { label: 'Active Flags', value: '1,204', icon: AlertCircle },
          { label: 'Analyzed Orgs', value: '12,500', icon: Users },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-900/40 border border-brand-border rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</p>
              <p className="text-lg font-display font-bold text-white">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter/Sort Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <h2 className="font-display text-xl font-bold text-white">Priority Case Feed</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900 border border-brand-border rounded-lg p-1">
            <button 
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded text-[10px] uppercase font-bold transition-all ${filter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              All
            </button>
            {(Object.keys(FLAGS) as FlagType[]).map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded text-[10px] uppercase font-bold transition-all ${filter === f ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="relative group">
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none bg-slate-900 border border-brand-border rounded-lg px-3 py-2 pr-8 text-[10px] uppercase font-bold text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-accent transition-all cursor-pointer"
            >
              <option value="risk">Risk Score</option>
              <option value="funding">Funding</option>
              <option value="recent">Recency</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode='popLayout'>
          {filteredOrgs.map((org) => (
            <motion.div
              key={org.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="group bg-[#0A0A0A] border border-brand-border rounded-xl p-6 hover:bg-slate-900/50 transition-all cursor-pointer flex flex-col h-full"
              onClick={() => onSelect(org)}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-white text-sm tracking-tight truncate group-hover:text-blue-400 transition-colors">
                    {org.name}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wide">
                    {org.location}
                  </p>
                </div>
                <div className={`px-2 py-1 rounded text-[11px] font-bold border ${
                  org.riskScore > 80 ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                  org.riskScore > 50 ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 
                  'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                }`}>
                  {org.riskScore} Risk
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2 mb-6">
                {org.flags.map(f => (
                  <span key={f} className="px-1.5 py-0.5 bg-slate-800 text-slate-400 text-[9px] rounded uppercase font-bold">
                    {f}
                  </span>
                ))}
              </div>

              <div className="space-y-2 mt-auto">
                <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  <span>Funding Volume</span>
                  <span className="text-slate-300">${(org.totalFunding / 1000000).toFixed(1)}M</span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (org.totalFunding / 50000000) * 100)}%` }}
                    className="h-full bg-blue-600" 
                  />
                </div>
              </div>

              <button className="w-full mt-6 py-2 bg-brand-accent hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-2">
                Open Case File <span>→</span>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
};
