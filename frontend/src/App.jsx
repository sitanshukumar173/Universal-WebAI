import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  const devFallbackUrl = "https://www.cashify.in/";//for testing url
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeUrl, setActiveUrl] = useState("");
  const scrollRef = useRef(null);

  // Get the current tab's URL from Chrome
  useEffect(() => {
    if (typeof window !== "undefined" && window.chrome?.tabs) {
      window.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) setActiveUrl(tabs[0].url);
      });
    } else {
      // Use fallback for testing
      setActiveUrl(devFallbackUrl);
    }
  }, [devFallbackUrl]);

  // Auto-scroll to latest message
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const query = input;
    setInput("");
    setMessages(prev => [...prev, { role: 'user', text: query }]);
    setLoading(true);

    try {
      // Send question to backend
      const res = await fetch("http://localhost:5000/api/v1/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          websiteUrl: activeUrl
        })
      });

      const data = await res.json();

      setMessages(prev => [...prev, {
        role: 'ai',
        text: data.answer,
        relevantLinks: data.relevantLinks,
        wasPdf: data.wasPdf
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: "Error: Backend is not responding." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-[400px] h-[550px] bg-pitch text-slate-300 flex flex-col font-sans border border-dark-700 shadow-2xl overflow-hidden">

      {/* Header with Site Info */}
      <div className="p-3 bg-dark-900 border-b border-dark-700 flex justify-between items-center">
        <h1 className="text-xs font-bold tracking-[0.2em] text-white">WEB.AI</h1>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">
            {activeUrl ? new URL(activeUrl).hostname : 'Loading...'}
          </span>
          <div className={`w-2 h-2 rounded-full ${loading ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`}></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-pitch">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center opacity-20">
            <p className="text-[10px] uppercase tracking-widest font-bold">Waiting for input</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 text-sm leading-relaxed border ${msg.role === 'user'
              ? 'bg-white text-black border-white rounded-2xl rounded-tr-none'
              : 'bg-dark-800 text-slate-200 border-dark-700 rounded-2xl rounded-tl-none'
              }`}>
              {msg.text}

              {msg.relevantLinks && msg.relevantLinks.length > 0 && (
                <div className="mt-3 pt-2 border-t border-dark-700">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    Relevant links
                  </div>
                  {msg.relevantLinks.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noreferrer" className="block text-[10px] text-blue-400 truncate hover:underline mb-1">
                      {msg.wasPdf ? '📄 ' : '🔗 '}{url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-[10px] text-slate-400 font-mono animate-pulse">Thinking...</div>}
        <div ref={scrollRef} />
      </div>

      <div className="p-3 bg-dark-900 border-t border-dark-700">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            autoFocus
            className="flex-1 bg-dark-800 border border-dark-700 text-white text-xs p-2.5 rounded-lg focus:outline-none focus:border-slate-400 transition-all"
            placeholder="Ask anything about this page..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 bg-white text-black font-bold text-xs rounded-lg active:scale-95 disabled:opacity-20 transition-all"
          >
            SEND
          </button>
        </form>
      </div>
    </div>
  );
}