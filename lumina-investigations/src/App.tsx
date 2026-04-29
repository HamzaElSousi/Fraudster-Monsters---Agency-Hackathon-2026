/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { OrgFeed } from './components/OrgFeed';
import { OrganizationModal } from './components/OrganizationModal';
import { Organization } from './types';
import { motion } from 'motion/react';

 export default function App() {
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
 
  return (
    <div className="min-h-screen bg-brand-bg text-brand-text-secondary">
      <Sidebar />
      
      <main className="pl-72 focus:outline-none">
        <div className="max-w-7xl mx-auto px-12 py-8">
          <header className="flex items-center justify-between mb-12 py-4 border-b border-brand-border">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white bg-slate-900 border border-slate-800 px-2.5 py-1 rounded">Secure Shell</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Network v4.0.2</span>
            </div>
            <div className="flex items-center gap-6">
              <button className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-white transition-colors">Documentation</button>
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-white">
                MJ
              </div>
            </div>
          </header>
 
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Dashboard />
            <div className="my-24 h-px bg-brand-border" />
            <OrgFeed onSelect={setSelectedOrg} />
          </motion.div>
          
          <footer className="mt-24 pt-12 pb-24 border-t border-brand-border text-center">
            <p className="font-display font-medium text-white mb-2 uppercase tracking-[0.2em] text-xs">Vigilant Investigations Protocol</p>
            <p className="text-[10px] text-slate-600 uppercase tracking-widest leading-relaxed">
              Proprietary data analysis system. Unauthorized access is strictly monitored. <br />
              © 2026 Jurisdictional Forensic Division.
            </p>
          </footer>
        </div>
      </main>
 
      <OrganizationModal 
        org={selectedOrg} 
        onClose={() => setSelectedOrg(null)} 
      />
    </div>
  );
}

