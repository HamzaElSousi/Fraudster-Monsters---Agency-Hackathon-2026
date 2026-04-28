import React from 'react';
import { 
  LayoutDashboard, 
  Search, 
  Fingerprint, 
  Users, 
  ShieldAlert, 
  Repeat, 
  FileSearch, 
  Bot, 
  Info,
  ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';

const navItems = [
  { group: 'Main', items: [
    { label: 'Dashboard', icon: LayoutDashboard, id: 'dashboard' },
  ]},
  { group: 'Investigations', items: [
    { label: 'Multi-flag Returns', icon: ShieldAlert, id: 'multi-flag' },
    { label: 'Zombie Recipients', icon: Fingerprint, id: 'zombies' },
    { label: 'Governance Networks', icon: Users, id: 'networks' },
    { label: 'Sole Source', icon: FileSearch, id: 'sole-source' },
  ]},
  { group: 'Cross Gov Analysis', items: [
    { label: 'Duplicative Funding', icon: Repeat, id: 'duplicative' },
  ]},
  { group: 'Intelligence', items: [
    { label: 'AI Assistant', icon: Bot, id: 'ai' },
    { label: 'Methodology', icon: Info, id: 'methodology' },
  ]},
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="fixed left-0 top-0 h-screen w-72 bg-brand-sidebar border-r border-brand-border flex flex-col z-40">
      {/* Logo & Brand */}
      <div className="p-8 border-b border-brand-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-accent rounded-lg flex items-center justify-center text-white font-display font-bold text-xl">
            V
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-white uppercase">
            Vigilant
          </span>
        </div>
      </div>

      {/* Global Sidebar Search */}
      <div className="px-6 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-secondary" />
          <input 
            type="text" 
            placeholder="Search investigations..." 
            className="w-full bg-[#0a0a0a] border border-brand-border rounded-lg py-2 pl-10 pr-4 text-xs text-brand-text-primary focus:outline-none focus:ring-1 focus:ring-brand-accent transition-all"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {navItems.map((group) => (
          <div key={group.group}>
            <h3 className="px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">
              {group.group}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                    item.id === 'dashboard' 
                    ? 'bg-slate-800 text-brand-accent' 
                    : 'text-brand-text-secondary hover:bg-slate-900 hover:text-brand-text-primary'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-40 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-6 border-t border-brand-border">
        <button className="text-xs text-slate-500 hover:text-slate-300 font-medium flex items-center gap-2 transition-colors">
          <Info className="w-3 h-3" />
          Methodology & About
        </button>
      </div>
    </aside>
  );
};
