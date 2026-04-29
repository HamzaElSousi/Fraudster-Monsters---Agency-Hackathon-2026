import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, MapPin, DollarSign, Fingerprint, Repeat, Users, ShieldAlert, FileSearch, ArrowRight } from 'lucide-react';
import { Organization, FLAGS } from '../types';

interface OrganizationModalProps {
  org: Organization | null;
  onClose: () => void;
}

const FLAG_ICONS: Record<string, any> = {
  zombie: Fingerprint,
  loop: Repeat,
  duplicate: ShieldAlert,
  governance: Users,
  'sole-source': FileSearch,
};

export const OrganizationModal: React.FC<OrganizationModalProps> = ({ org, onClose }) => {
  if (!org) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-brand-900/40 backdrop-blur-sm"
        />
        <motion.div
          layoutId={`org-${org.id}`}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-brand-bg rounded-3xl shadow-2xl border border-brand-border overflow-hidden flex flex-col md:flex-row max-h-[90vh]"
        >
          {/* Main Info */}
          <div className="flex-1 p-10 overflow-y-auto">
            <div className="flex justify-between items-start mb-8">
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-900 rounded-full transition-colors order-last"
              >
                <X className="w-6 h-6 text-slate-500" />
              </button>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Case #4029-X</span>
                <h2 className="font-display text-3xl font-bold text-white leading-tight">{org.name}</h2>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-10">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Risk Level</span>
                <div className={`text-3xl font-display font-bold ${org.riskScore > 80 ? 'text-red-500' : 'text-white'}`}>
                  {org.riskScore}/100
                </div>
              </div>
              <div className="space-y-1 text-right">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Funding</span>
                <div className="text-3xl font-display font-bold text-white">
                  ${(org.totalFunding / 1000000).toFixed(2)}M
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Active Flags</h3>
                <div className="flex flex-wrap gap-2">
                  {org.flags.length > 0 ? org.flags.map(f => {
                    const Icon = FLAG_ICONS[f];
                    return (
                      <div key={f} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/50 text-[11px] font-bold text-slate-300`}>
                        <Icon className="w-3.5 h-3.5" />
                        {FLAGS[f].label}
                      </div>
                    );
                  }) : (
                    <span className="text-sm text-slate-600 italic">No critical flags detected.</span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Investigation Summary</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {org.description}
                </p>
              </div>

              <div className="pt-6 border-t border-slate-800 flex items-center justify-between gap-6 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" />
                  {org.location}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Last Scan: {org.lastUpdated}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar / History */}
          <div className="w-full md:w-64 bg-slate-900/50 p-10 border-l border-brand-border flex flex-col">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest mb-6">Event Log</h3>
            <div className="space-y-8 flex-1">
              {org.history.length > 0 ? org.history.map((h, i) => (
                <div key={i} className="relative pl-6 pb-2 border-l border-slate-800 last:border-0 last:pb-0">
                  <div className="absolute left-[-5px] top-1 w-2 h-2 rounded-full bg-blue-500" />
                  <span className="block text-[9px] font-bold text-slate-500 uppercase mb-1">{h.date}</span>
                  <p className="text-[11px] text-slate-300 leading-tight font-medium">{h.event}</p>
                </div>
              )) : (
                <div className="text-xs text-slate-600 italic">No entry logs found.</div>
              )}
            </div>
            <button className="mt-8 bg-brand-accent text-white rounded-lg py-3 flex items-center justify-center gap-2 font-bold text-[11px] hover:bg-blue-500 transition-all uppercase tracking-wider">
              Verify Evidence
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
