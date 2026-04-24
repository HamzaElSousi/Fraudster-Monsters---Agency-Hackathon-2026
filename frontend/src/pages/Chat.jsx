import { useState, useRef, useEffect } from 'react';
import { sendChatMessage, formatCurrency } from '../api';

const WELCOME_MESSAGE = {
  role: 'assistant',
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

export default function Chat() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(text) {
    const message = text || input.trim();
    if (!message || isLoading) return;

    const userMsg = { role: 'user', content: message };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(message);
      const assistantMsg = {
        role: 'assistant',
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
        content: `⚠️ Error connecting to API. Make sure the backend is running on port 8000.\n\nRun: \`cd backend && python main.py\``,
        data_type: 'error',
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  function renderDataPreview(msg) {
    if (!msg.data || msg.data.length === 0) return null;

    if (msg.data_type === 'zombies') {
      return (
        <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
          {msg.data.slice(0, 5).map((z, i) => (
            <div key={i} style={{
              padding: '10px 14px', marginBottom: 6,
              background: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.12)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 600 }}>{z.canonical_name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {z.registration_status} · Funding: {formatCurrency(z.total_public_funding)} · Govt Rev: {z.govt_revenue_pct}%
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (msg.data_type === 'loops') {
      return (
        <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
          {msg.data.slice(0, 5).map((l, i) => (
            <div key={i} style={{
              padding: '10px 14px', marginBottom: 6,
              background: 'rgba(167, 139, 250, 0.06)',
              border: '1px solid rgba(167, 139, 250, 0.12)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 600 }}>{l.hops}-hop loop</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {l.path_display}
              </div>
              <div style={{ color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 4 }}>
                Bottleneck: {formatCurrency(l.bottleneck_amt)} · Total flow: {formatCurrency(l.total_flow)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (msg.data_type === 'governance') {
      return (
        <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
          {msg.data.slice(0, 5).map((d, i) => (
            <div key={i} style={{
              padding: '10px 14px', marginBottom: 6,
              background: 'rgba(34, 211, 238, 0.06)',
              border: '1px solid rgba(34, 211, 238, 0.12)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 600 }}>{d.first_name} {d.last_name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {d.board_count} boards · Controls {formatCurrency(d.total_controlled_funding)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (msg.data_type === 'stats') {
      return null; // Stats are described in the text
    }

    return null;
  }

  return (
    <div className="chat-container animate-in">
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div dangerouslySetInnerHTML={{
              __html: msg.content
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br />')
                .replace(/`(.*?)`/g, '<code style="background:rgba(99,102,241,0.15);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:12px">$1</code>')
                .replace(/• /g, '&bull; ')
            }} />
            {renderDataPreview(msg)}
            {msg.follow_up && msg.follow_up.length > 0 && (
              <div className="chat-suggestions">
                {msg.follow_up.map((suggestion, si) => (
                  <button
                    key={si}
                    className="chat-suggestion-btn"
                    onClick={() => handleSend(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {msg.sql_hint && (
              <div style={{
                marginTop: 8, padding: '6px 10px',
                background: 'rgba(99, 102, 241, 0.08)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11, color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}>
                💡 {msg.sql_hint}
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
