import { Skull, Repeat2, Banknote, Users, Bot, AlertTriangle, FileText, Circle } from 'lucide-react';

export default function Methodology() {
  return (
    <div className="animate-in" style={{ maxWidth: 860 }}>

      {/* Intro */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          FraudsterMonsters surfaces funding anomalies across 23M+ government records. This page explains exactly how it works —
          what data we use, how risk scores are calculated, what AI does, and what the tool does not claim.
        </p>
      </div>

      {/* 1. Data Sources */}
      <div className="methodology-section">
        <h2>📂 Data Sources</h2>
        <table className="methodology-table">
          <thead><tr><th>Source</th><th>Contents</th><th>Coverage</th></tr></thead>
          <tbody>
            <tr>
              <td>CRA T3010 Charity Filings</td>
              <td>Annual financial filings from registered charities — revenue, government funding, program spending, directors, transfers between organizations</td>
              <td>~91,000 charities · all years</td>
            </tr>
            <tr>
              <td>Federal Proactive Disclosure</td>
              <td>Grants and contributions from 51+ federal departments — recipient name, amount, purpose, fiscal year</td>
              <td>1.27M records</td>
            </tr>
            <tr>
              <td>Alberta Open Data</td>
              <td>Alberta sole-source contracts and grants — vendor, amount, ministry, amendment history</td>
              <td>15,533 records · $18.2B total</td>
            </tr>
            <tr>
              <td>Entity Resolution Layer</td>
              <td>Cross-dataset matching that links the same organization across CRA, federal, and Alberta data using Business Number normalization and fuzzy name matching</td>
              <td>All datasets</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 2. Risk Scoring */}
      <div className="methodology-section">
        <h2>How Risk Scoring Works</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
          Every organization receives a transparent 0–100 risk score built from four independent components.
          The breakdown is always shown so auditors can see exactly why an organization scored what it did.
          A high score indicates risk signals — not proof of wrongdoing.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { label: 'Zombie', Icon: Skull, max: 40, color: 'var(--status-critical)' },
            { label: 'Loop', Icon: Repeat2, max: 25, color: 'var(--accent-purple)' },
            { label: 'Duplicate', Icon: Banknote, max: 20, color: '#60a5fa' },
            { label: 'Governance', Icon: Users, max: 15, color: '#fb923c' },
          ].map(c => (
            <div key={c.label} style={{ padding: '8px 16px', background: 'var(--bg-tertiary)', border: `1px solid ${c.color}44`, borderRadius: 'var(--radius-md)', textAlign: 'center', minWidth: 120 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><c.Icon size={13} />{c.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>max {c.max} pts</div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><Skull size={14} /> Zombie Score (max 40 points)</h3>
        <table className="methodology-table" style={{ marginBottom: 20 }}>
          <thead><tr><th>Condition</th><th>Points</th></tr></thead>
          <tbody>
            <tr><td>Government funding &gt; 90% of total revenue</td><td>+20</td></tr>
            <tr><td>Government funding &gt; 70% of total revenue</td><td>+15</td></tr>
            <tr><td>CRA filings ceased by 2022</td><td>+20</td></tr>
            <tr><td>Total government funding received &gt; $1M</td><td>+10 bonus</td></tr>
            <tr><td>Total government funding received &gt; $500K</td><td>+5 bonus</td></tr>
          </tbody>
        </table>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><Repeat2 size={14} /> Loop Score (max 25 points)</h3>
        <table className="methodology-table" style={{ marginBottom: 20 }}>
          <thead><tr><th>Condition</th><th>Points</th></tr></thead>
          <tbody>
            <tr><td>Appears in any CRA pre-computed circular funding loop</td><td>+10</td></tr>
            <tr><td>Loop involves &gt; $500K total annual flow</td><td>+10 additional</td></tr>
            <tr><td>Loop chain length &gt; 3 organizations</td><td>+5 bonus</td></tr>
          </tbody>
        </table>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><Banknote size={14} /> Duplicate Funding Score (max 20 points)</h3>
        <table className="methodology-table" style={{ marginBottom: 20 }}>
          <thead><tr><th>Condition</th><th>Points</th></tr></thead>
          <tbody>
            <tr><td>Funded by both federal government AND Alberta government</td><td>+10</td></tr>
            <tr><td>Combined dual-source funding &gt; $250K</td><td>+5 bonus</td></tr>
            <tr><td>Combined dual-source funding &gt; $1M</td><td>+5 additional</td></tr>
          </tbody>
        </table>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={14} /> Governance Score (max 15 points)</h3>
        <table className="methodology-table">
          <thead><tr><th>Condition</th><th>Points</th></tr></thead>
          <tbody>
            <tr><td>A director sits on 5+ government-funded charity boards</td><td>+15</td></tr>
            <tr><td>A director sits on 3–4 government-funded charity boards</td><td>+8</td></tr>
          </tbody>
        </table>

        <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Risk Tiers:</strong>{' '}
          <span style={{ color: 'var(--status-critical)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Circle size={9} fill="var(--status-critical)" /> Critical (80–100)</span> ·{' '}
          <span style={{ color: 'var(--status-high)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Circle size={9} fill="var(--status-high)" /> High (60–79)</span> ·{' '}
          <span style={{ color: 'var(--status-medium)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Circle size={9} fill="var(--status-medium)" /> Medium (40–59)</span> ·{' '}
          <span style={{ color: 'var(--status-low)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Circle size={9} fill="var(--status-low)" /> Low (0–39)</span>
        </div>
      </div>

      {/* 3. What AI Does */}
      <div className="methodology-section">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bot size={18} /> What the AI Does</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
          FraudsterMonsters uses AI in two ways: generating investigation briefs and answering natural-language questions about the data.
        </p>
        <table className="methodology-table">
          <thead><tr><th>Feature</th><th>What goes in</th><th>What comes out</th><th>AI Provider</th></tr></thead>
          <tbody>
            <tr>
              <td>Entity Case File Brief</td>
              <td>Organization name, funding history, loop count, zombie status, director data</td>
              <td>2–4 sentence investigation summary explaining the most significant risk signals</td>
              <td>Gemini 2.0 Flash / Claude (hackathon day)</td>
            </tr>
            <tr>
              <td>Ask AI Chat</td>
              <td>Natural language question, context about available datasets</td>
              <td>Answer + relevant data cards + follow-up suggestions</td>
              <td>AWS Bedrock (Claude) / Anthropic direct</td>
            </tr>
            <tr>
              <td>Duplicative Funding Summary</td>
              <td>Top dual-funded orgs, director network data</td>
              <td>Page-level investigative narrative for the duplicative funding analysis</td>
              <td>Gemini 2.0 Flash</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6 }}>
          AI output is generated from structured data queries — not hallucinated. All dollar figures, loop counts, and BNs in AI output are sourced from the underlying database.
          If no AI key is configured, briefs fall back to data-driven template responses.
        </p>
      </div>

      {/* 4. Limitations */}
      <div className="methodology-section">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={18} /> Limitations</h2>
        <ul style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 2, paddingLeft: 20, margin: 0 }}>
          <li><strong style={{ color: 'var(--text-primary)' }}>Risk signals, not proof.</strong> A high risk score means an organization warrants closer inspection — not that fraud has occurred. All findings require human verification before action.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Name-based director matching.</strong> Director cross-referencing uses name matching, which may produce false positives for common names (e.g. "John Smith") across different individuals. Use with appropriate skepticism.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Data coverage.</strong> The dataset covers charities registered with CRA, federal grants disclosed under the Proactive Disclosure policy, and Alberta Open Data. Provincial data outside Alberta is not included.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Fiscal year alignment.</strong> CRA T3010 data and federal grant data use different fiscal year conventions — year-over-year comparisons may be off by one year in some cases.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Zombie definition.</strong> "Zombie recipient" is defined as: government funding ≥ 70% of revenue, minimum $100K received, and CRA filings ceased by 2022. Organizations that legitimately wound down after completing their mandate are captured by the same definition.</li>
        </ul>
      </div>

      {/* 5. How to Read a Case File */}
      <div className="methodology-section">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={18} /> How to Read a Case File</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { step: '1', title: 'Check the Risk Score', desc: 'The 0–100 badge in the header tells you how many risk signals were triggered. Critical (80+) means multiple serious flags aligned.' },
            { step: '2', title: 'Read the AI Brief', desc: 'The brief above the tabs synthesizes the most important findings. It names specific dollar amounts and patterns, not generic warnings.' },
            { step: '3', title: 'Examine Risk Flags', desc: 'The Risk Flags tab shows exactly which criteria triggered, with the actual data point from the filing. This is the evidence for any referral.' },
            { step: '4', title: 'Review Funding History', desc: 'The chart shows government funding by year. Look for sudden spikes followed by cessation of filings — a classic zombie pattern.' },
            { step: '5', title: 'Check Loop Map', desc: 'If the organization appears in circular funding loops, this tab shows the chains. Same-year loops (highlighted) are higher risk.' },
            { step: '6', title: 'Add Notes and Escalate', desc: 'Use the Case Notes tab to record findings. The case status (Open → Escalated) persists in your browser.' },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                {s.step}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
