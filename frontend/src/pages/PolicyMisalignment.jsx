import { useState, useEffect } from 'react';
import { fetchPolicyMisalignment, fmtDollars } from '../api';

function MethodologyPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 24, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '12px 20px',
          background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
        }}
      >
        <span>How we detected this — Challenge #7 Policy Misalignment</span>
        <span style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Data source:</strong> Federal Proactive Disclosure dataset — 1.27M grant/contribution records from 51+ departments.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Approach:</strong> We aggregate federal spending by department and use AI to compare actual spending patterns
            against Canada's stated policy priorities: climate action, affordable housing, healthcare capacity, Indigenous reconciliation, and defence modernization.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Why it matters:</strong> Governments publish budgets and mandate letters declaring their priorities.
            The question is whether the actual flow of grant and contribution dollars matches those declarations.
            Gaps between rhetoric and allocation represent either policy failure or deliberate misdirection.
          </p>
        </div>
      )}
    </div>
  );
}

export default function PolicyMisalignment() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchPolicyMisalignment(30)
      .then(d => setData(d))
      .catch(err => setError(err?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const departments = data?.departments || [];
  const analysis = data?.analysis || '';
  const totalSpending = departments.reduce((s, d) => s + (d.total_spending || 0), 0);

  return (
    <div className="animate-in">
      <div style={{
        marginBottom: 24, padding: '24px 28px',
        background: 'rgba(59,130,246,0.04)',
        border: '1px solid rgba(59,130,246,0.2)',
        borderTop: '3px solid var(--accent-blue)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-blue)', marginBottom: 8 }}>
          Challenge #7 — Policy Misalignment
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 12, maxWidth: 820 }}>
          Is the money going where the government says its priorities are? We compare actual federal grant and contribution
          spending patterns against Canada's stated policy commitments — climate, housing, healthcare, reconciliation, defence.
          The gaps between rhetoric and allocation tell the real story.
        </p>
        {!loading && departments.length > 0 && (
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Total Spending Tracked</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>{fmtDollars(totalSpending)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Departments Analyzed</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{departments.length}</div>
            </div>
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          Source: Federal Proactive Disclosure (51+ departments) | AI analysis compares against stated priorities
        </div>
      </div>

      <MethodologyPanel />

      {/* AI Analysis Panel */}
      {analysis && (
        <div style={{
          marginBottom: 24, padding: '20px 24px',
          background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-indigo-light)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            AI Policy Alignment Analysis
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {analysis}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            Generated by Claude AI from real spending data — not pre-written
          </div>
        </div>
      )}

      {/* Department Spending Table */}
      <div className="data-table-container">
        <div className="data-table-header">
          <span className="data-table-title">Federal Spending by Department ({departments.length})</span>
        </div>
        {error ? (
          <div style={{ padding: 32, textAlign: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', margin: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--status-critical)' }}>Data Load Failed</div>
            <div style={{ color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{error}</div>
          </div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading policy analysis...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Total Spending</th>
                <th>Share of Total</th>
                <th># Grants</th>
                <th># Recipients</th>
                <th>Avg Grant</th>
                <th>Period</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d, i) => {
                const share = totalSpending > 0 ? ((d.total_spending / totalSpending) * 100) : 0;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontSize: 13, maxWidth: 300 }}>{d.department}</td>
                    <td><span className="funding-amount large">{fmtDollars(d.total_spending)}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(share, 100)}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{(d.grant_count || 0).toLocaleString()}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{(d.recipient_count || 0).toLocaleString()}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDollars(d.avg_grant_size)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{d.earliest_year}–{d.latest_year}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
