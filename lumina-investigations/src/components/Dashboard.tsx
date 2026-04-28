import React from 'react';
import { Search, ArrowRight, ShieldAlert, Fingerprint, Repeat, Users } from 'lucide-react';
import { motion } from 'motion/react';

const problemCards = [
  {
    title: 'Neutralizing Zombies',
    desc: 'How we identify inactive shell entities to restore fiscal integrity.',
    icon: Fingerprint,
    color: 'bg-red-50 text-red-600',
    id: 'zombies'
  },
  {
    title: 'Ending Loops',
    desc: 'Tracing revolving funding cycles to prevent resource leakage.',
    icon: Repeat,
    color: 'bg-orange-50 text-orange-600',
    id: 'loops'
  },
  {
    title: 'Mapping Networks',
    desc: 'Unmasking hidden governance networks through relational data.',
    icon: Users,
    color: 'bg-purple-50 text-purple-600',
    id: 'networks'
  },
  {
    title: 'Verifying Variance',
    desc: 'Eliminating duplicative funding through cross-agency sync.',
    icon: ShieldAlert,
    color: 'bg-blue-50 text-blue-600',
    id: 'duplicate'
  },
];

export const Dashboard: React.FC = () => {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative pt-12 pb-8 flex flex-col items-center text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl"
        >
          <h1 className="font-display text-6xl font-bold tracking-tighter text-white leading-[1.1] mb-6">
            Integrity Through <br /> 
            <span className="text-brand-accent">Precision Analysis.</span>
          </h1>
          <p className="text-lg text-brand-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
            The most advanced platform for identifying institutional fraud, monitoring zombie entities, and unmasking hidden governance networks.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <div className="relative flex-1 min-w-[400px] group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-brand-accent transition-colors" />
              <input 
                type="text" 
                placeholder="Search investigations, entities, or tax IDs..." 
                className="w-full bg-slate-900/50 border border-brand-border rounded-full py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-accent transition-all"
              />
            </div>
            <button className="bg-brand-accent text-white px-8 py-4 rounded-full font-bold flex items-center gap-2 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20">
              Launch Intelligence
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </section>

      {/* Problem Solving Strip */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-xl font-bold text-white tracking-tight">Mission Parameters</h2>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-1 bg-slate-900/50 rounded-full border border-brand-border">Operational Focus</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {problemCards.map((card, idx) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              className="group p-6 rounded-xl bg-slate-900/40 border border-brand-border hover:border-brand-border-hover transition-all cursor-pointer relative overflow-hidden"
            >
              <div className={`w-10 h-10 rounded-lg ${card.color.replace('bg-', 'bg-opacity-10 bg-')} bg-opacity-10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <card.icon className="w-5 h-5" />
              </div>
              <h3 className="font-display font-semibold text-white mb-2">
                {card.title}
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {card.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA Box */}
      <section className="bg-[#080808] border border-brand-border rounded-2xl p-12 flex flex-col items-center text-center">
        <h2 className="font-display text-2xl font-bold text-white mb-4">Advance Your Investigations</h2>
        <p className="text-sm text-brand-text-secondary max-w-xl mb-8">
          Join the elite network of auditors using Vigilant to secure public funding and streamline agency transparency across all jurisdictions.
        </p>
        <div className="flex items-center gap-4">
          <button className="text-slate-400 px-6 py-2 rounded-lg font-bold text-sm hover:text-white transition-colors">
            View Methodology
          </button>
          <button className="bg-brand-accent text-white px-8 py-3 rounded-xl font-bold text-sm hover:bg-blue-500 transition-colors shadow-lg">
            Request Secure Access
          </button>
        </div>
      </section>
    </div>
  );
};
