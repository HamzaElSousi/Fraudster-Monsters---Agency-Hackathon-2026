import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendChatMessage, formatCurrency } from '../api';

const WELCOME_MESSAGE = {
  role: 'assistant',
  id: 0,
  content: `Welcome to the **Follow The Money** AI Investigator! 🔍

I can help you explore government spending accountability across **23 million records** from CRA T3010 charity filings, Federal Grants & Contributions, and Alberta Open Data.

Try asking me about:
• **Zombie recipients** — organizations that vanished after receiving funding
• **Funding loops** — circular money flows between charities
• **Governance networks** — directors controlling multiple funded entities
• **Spending overview** — total funding across all datasets`,
  data_type: 'help',
  follow_up: [
    'Show me zombie recipients',
    'Find funding loops',
    'Show governance networks',
    'Give me an overview',
  ],
};

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
    const flagMeta = { zombie: '🧟', loop: '🔄', governance: '🕸️' };
    title = item.canonical_name || item.legal_name || 'Unknown';
    amount = formatCurrency(item.total_govt_funding || item.total_public_funding || 0);
    badge = `${item.alarm_count || 1} flags`;
    badgeClass = (item.alarm_count >= 3) ? 'critical' : 'high';
    subtitle = item.risk_summary || (item.flags || []).join(' + ');
    navPath = '/alerts'; navLabel = 'View Alerts';
    details = (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(item.flags || []).map(f => <span key={f} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,0.15)', color: 'var(--status-critical)' }}>{flagMeta[f] || '⚠️'} {f}</span>)}
        </div>
        {item.last_filing_year && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Last filed: {item.last_filing_year}</div>}
      </div>
    );
  } else {
    return null;
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

export default function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
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
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        id: Date.now() + 1,
        content: `⚠️ Error connecting to API. Make sure the backend is running on port 8000.\n\nRun: \`cd backend && python main.py\``,
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
            <div dangerouslySetInnerHTML={{
              __html: msg.content
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br />')
                .replace(/`(.*?)`/g, '<code style="background:rgba(99,102,241,0.15);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:12px">$1</code>')
                .replace(/• /g, '&bull; ')
            }} />

            {msg.sql_hint && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block' }} />
                {msg.sql_hint}
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
              <span style={{ animation: 'pulse-glow 1.5s infinite' }}>🔍</span>
              <span style={{ color: 'var(--text-muted)' }}>Analyzing 23M+ records...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

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
          {isLoading ? '⏳' : '🔍'} Investigate
        </button>
      </div>
    </div>
  );
}
