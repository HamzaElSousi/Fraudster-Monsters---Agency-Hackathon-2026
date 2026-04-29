// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skull, Repeat2, Network, AlertTriangle, Search, Loader2, Send } from 'lucide-react';
import { sendChatMessage, formatCurrency, fetchStats } from '../api';

function buildWelcomeMessage(stats) {
  const fedGrants = stats?.total_fed_grants ?? 0;
  const abGrants = stats?.total_ab_grants ?? 0;
  const totalRecords = fedGrants + abGrants;
  const recordStr = totalRecords > 1_000_000
    ? `${(totalRecords / 1_000_000).toFixed(1)}M+`
    : totalRecords > 0 ? totalRecords.toLocaleString() : '1.3M+';

  return {
    role: 'assistant',
    id: 0,
    content: `Welcome to the **Follow The Money** Agentic AI Investigator!

I autonomously query a live database of **${recordStr} records** across CRA T3010 charity filings, Federal Grants & Contributions, and Alberta Open Data using **12 investigative tools**.

I don't just answer questions — I **investigate**. Tell me what to look into and I'll search, cross-reference, and build a case:

• **"Investigate the highest-risk entity in the database"** — I'll pull cross-challenge alerts, find the worst case, and build a dossier
• **"Which organizations received the most public funding before going dark?"** — I'll query zombie recipients and explain what makes each suspicious
• **"Who sits on the most charity boards simultaneously?"** — I'll search governance networks and follow the money
• **"Where do zombie recipients, funding loops, and governance issues overlap?"** — I'll cross-reference all challenge datasets`,
    data_type: 'help',
    follow_up: [
      'Investigate the highest-risk entity across all categories',
      'Which funding loops involve same-year transactions?',
      'Where does governance overlap with zombie recipients?',
      'Give me a full platform overview',
    ],
  };
}

function DataCard({ item, dataType, index, msgId, expandedCards, toggleCard, navigate }) {
  const cardKey = `${msgId}-${index}`;
  const isExpanded = expandedCards.has(cardKey);

  let title = '', subtitle = '', amount = '', badge = '', badgeClass = 'info', details = null, navPath = null, navLabel = '';

  if (dataType === 'zombies') {
    title = item.canonical_name || item.legal_name || 'Unknown';
    amount = formatCurrency(item.total_public_funding || item.total_govt_funding || 0);
    badge = item.risk_level || 'high';
    badgeClass = badge;
    subtitle = `Last filed: ${item.last_filing_year || '?'} · ${(item.govt_revenue_pct || item.govt_share_pct || 0).toFixed(1)}% govt revenue`;
    navPath = '/zombies'; navLabel = 'View Zombies';
    details = (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total Govt Funding</div><div style={{ fontWeight: 700, color: 'var(--status-critical)' }}>{formatCurrency(item.total_public_funding || item.total_govt_funding || 0)}</div></div>
          <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Govt Revenue %</div><div style={{ fontWeight: 700 }}>{(item.govt_revenue_pct || item.govt_share_pct || 0).toFixed(1)}%</div></div>
          <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Last Filing</div><div style={{ fontWeight: 700 }}>{item.last_filing_year || '?'}</div></div>
          <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>BN</div><div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{item.primary_bn || item.bn || '—'}</div></div>
        </div>
        {item.designation && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Designation: {item.designation}</div>}
      </div>
    );
  } else if (dataType === 'loops') {
    title = item.path_display || `${item.hops}-hop loop`;
    amount = formatCurrency(item.total_flow || 0);
    badge = `${item.hops || '?'} hops`;
    badgeClass = (item.hops >= 4) ? 'critical' : (item.hops >= 3) ? 'high' : 'medium';
    subtitle = `Bottleneck: ${formatCurrency(item.bottleneck_amt || 0)}`;
    navPath = '/loops'; navLabel = 'View Loops';
    details = (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total Flow</div><div style={{ fontWeight: 700, color: 'var(--accent-purple)' }}>{formatCurrency(item.total_flow || 0)}</div></div>
          <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Bottleneck</div><div style={{ fontWeight: 700, color: 'var(--status-critical)' }}>{formatCurrency(item.bottleneck_amt || 0)}</div></div>
          <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Hops</div><div style={{ fontWeight: 700 }}>{item.hops}</div></div>
        </div>
      </div>
    );
  } else if (dataType === 'governance') {
    title = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unknown Director';
    amount = formatCurrency(item.total_controlled_funding || 0);
    badge = `${item.board_count || 0} boards`;
    badgeClass = (item.board_count >= 5) ? 'critical' : (item.board_count >= 4) ? 'high' : 'medium';
    subtitle = `Controls ${formatCurrency(item.total_controlled_funding || 0)} across ${item.board_count} boards`;
    navPath = '/governance'; navLabel = 'View Governance';
    details = (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-primary)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Organizations:</div>
        {(item.organizations || []).slice(0, 4).map((org, i) => (
          <div key={org.bn_root || i} style={{ fontSize: 11, padding: '3px 0', color: 'var(--text-secondary)' }}>
            • {org.name || org.bn_root} — {formatCurrency(parseFloat(org.fed_funding || 0))}
          </div>
        ))}
      </div>
    );
  } else if (dataType === 'sole_source') {
    title = item.vendor || 'Unknown Vendor';
    amount = formatCurrency(item.total_amount || item.amended_amount || 0);
    badge = `${item.contract_count || 1} contracts`;
    badgeClass = (item.contract_count >= 10) ? 'critical' : 'high';
    subtitle = `${item.department || item.ministry || 'Unknown dept'} · ${item.contract_count || 1} sole-source contracts`;
    navPath = '/sole-source'; navLabel = 'View Sole Source';
    details = (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total Awarded</div><div style={{ fontWeight: 700 }}>{formatCurrency(item.total_amount || 0)}</div></div>
          <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Contracts</div><div style={{ fontWeight: 700 }}>{item.contract_count || 1}</div></div>
        </div>
      </div>
    );
  } else if (dataType === 'alerts') {
    const flagIconMap: Record<string, React.ElementType> = { zombie: Skull, loop: Repeat2, governance: Network };
    title = item.canonical_name || item.legal_name || 'Unknown';
    amount = formatCurrency(item.total_govt_funding || item.total_public_funding || 0);
    badge = `${item.alarm_count || 1} flags`;
    badgeClass = (item.alarm_count >= 3) ? 'critical' : 'high';
    subtitle = item.risk_summary || (item.flags || []).join(' + ');
    navPath = '/alerts'; navLabel = 'View Alerts';
    details = (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(item.flags || []).map(f => {
            const FlagIcon = flagIconMap[f] || AlertTriangle;
            return (
              <span key={f} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,0.15)', color: 'var(--status-critical)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <FlagIcon size={10} /> {f}
              </span>
            );
          })}
        </div>
        {item.last_filing_year && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Last filed: {item.last_filing_year}</div>}
      </div>
    );
  } else {
    const name = item.canonical_name || item.legal_name || item.recipient_legal_name || item.vendor || item.department || item.name || item.group_key || '';
    const funding = item.total_govt_funding || item.total_spending || item.total_value || item.total_received || item.fed_total || 0;
    title = name || `${dataType} result`;
    amount = funding ? formatCurrency(parseFloat(funding)) : '';
    subtitle = Object.entries(item).filter(([k, v]) => v && !['canonical_name','legal_name','total_govt_funding','total_spending','bn','primary_bn'].includes(k)).slice(0, 3).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ');
    badge = dataType;
    badgeClass = 'info';
  }

  return (
    <div
      key={cardKey}
      onClick={() => toggleCard(cardKey)}
      style={{
        padding: '10px 14px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'border-color var(--transition-fast), background var(--transition-fast)',
        marginBottom: 6,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-indigo)'; e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={title}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-indigo-light)', fontFamily: 'var(--font-mono)' }}>{amount}</div>
          <span className={`badge ${badgeClass}`}>{badge}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {isExpanded && (
        <div onClick={e => e.stopPropagation()}>
          {details}
          {navPath && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(navPath); }}
              style={{
                marginTop: 10, padding: '5px 14px', fontSize: 11, fontWeight: 600,
                background: 'var(--gradient-primary)', color: '#fff', border: 'none',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              }}
            >
              {navLabel} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('|') && i + 1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i + 1].trim())) {
      const headerCells = lines[i].split('|').filter(c => c.trim()).map(c => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].split('|').filter(c => c.trim()).map(c => c.trim()));
        i++;
      }
      let html = '<div style="overflow-x:auto;margin:12px 0"><table class="data-table" style="font-size:12px;width:100%"><thead><tr>';
      headerCells.forEach(h => { html += `<th style="padding:8px 12px;text-align:left;white-space:nowrap">${h}</th>`; });
      html += '</tr></thead><tbody>';
      rows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => {
          const styled = cell.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          html += `<td style="padding:6px 12px">${styled}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      out.push(html);
    } else {
      let line = lines[i];
      if (/^#{1,4}\s+/.test(line)) {
        const level = line.match(/^(#+)/)[1].length;
        const text = line.replace(/^#+\s+/, '');
        const sizes = { 1: 18, 2: 16, 3: 14, 4: 13 };
        out.push(`<div style="font-size:${sizes[level] || 14}px;font-weight:700;margin:12px 0 6px;color:var(--text-primary)">${text}</div>`);
      } else {
        line = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/`(.*?)`/g, '<code style="background:rgba(99,102,241,0.15);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:12px">$1</code>')
          .replace(/^• /, '&bull; ')
          .replace(/^- /, '&bull; ')
          .replace(/^\d+\.\s/, (m) => `<span style="color:var(--accent-indigo-light);font-weight:700">${m}</span>`);
        out.push(line || '<br />');
      }
      i++;
    }
  }
  return out.join('<br />');
}

export default function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([buildWelcomeMessage(null)]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const messagesEndRef = useRef(null);

  const toggleCard = (key) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  useEffect(() => {
    fetchStats()
      .then(stats => {
        setMessages(prev => {
          if (prev.length === 1 && prev[0].id === 0) {
            return [buildWelcomeMessage(stats)];
          }
          return prev;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(text) {
    const message = text || input.trim();
    if (!message || isLoading) return;

    const userMsg = { role: 'user', id: Date.now(), content: message };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(message);
      const assistantMsg = {
        role: 'assistant',
        id: Date.now() + 1,
        content: response.answer,
        data: response.data,
        data_type: response.data_type,
        sql_hint: response.sql_hint,
        follow_up: response.follow_up,
        tools_used: response.tools_used,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        id: Date.now() + 1,
        content: `Error connecting to API. Make sure the backend is running on port 8000.\n\nRun: \`cd backend && python main.py\``,
        data_type: 'error',
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="chat-container animate-in">
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={msg.id ?? i} className={`chat-message ${msg.role}`}>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />

            {msg.sql_hint && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block' }} />
                {msg.sql_hint}
              </div>
            )}
            {msg.tools_used && msg.tools_used.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {[...new Set(msg.tools_used)].map(tool => (
                  <span key={tool} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--accent-indigo-light)' }}>
                    {tool.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}

            {msg.data && msg.data.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {msg.data.length} result{msg.data.length !== 1 ? 's' : ''} — click to expand
                </div>
                {msg.data.slice(0, 8).map((item, idx) =>
                  <DataCard key={`${msg.id ?? i}-${idx}`} item={item} dataType={msg.data_type} index={idx} msgId={msg.id ?? i} expandedCards={expandedCards} toggleCard={toggleCard} navigate={navigate} />
                )}
              </div>
            )}

            {msg.follow_up && msg.follow_up.length > 0 && (
              <div className="chat-suggestions">
                {msg.follow_up.map((suggestion, si) => (
                  <button
                    key={si}
                    className="chat-suggestion-btn"
                    onClick={() => handleSend(suggestion)}
                    style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 500,
                      background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                      borderRadius: 99, color: 'var(--accent-indigo-light)', cursor: 'pointer',
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="chat-message assistant">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Loader2 size={14} style={{ color: 'var(--color-accent)', animation: 'spin 1s linear infinite' }} />
              <span style={{ color: 'var(--text-muted)' }}>Analyzing records...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 1 && !isLoading && (
        <div style={{ padding: '0 0 12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            'Which organizations got government money and sent it in circles?',
            'Show me the most suspicious funding loops with phantom tax receipts',
            'Which director controls the most funding across multiple boards?',
            'Find charities that stopped filing but still received government grants',
          ].map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q)}
              style={{
                padding: '8px 14px', fontSize: 12, fontWeight: 500,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 99, color: 'var(--text-secondary)',
                cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.target.style.borderColor = 'var(--accent-purple)'; e.target.style.color = 'var(--accent-purple)'; }}
              onMouseLeave={e => { e.target.style.borderColor = 'var(--border-primary)'; e.target.style.color = 'var(--text-secondary)'; }}
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <div className="chat-input-area">
        <input
          className="chat-input"
          type="text"
          placeholder="Ask about zombies, funding loops, governance networks..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={isLoading}
        />
        <button
          className="chat-send-btn"
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />} Investigate
        </button>
      </div>
    </div>
  );
}
