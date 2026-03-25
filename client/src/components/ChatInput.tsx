'use client';

import { useState, useRef, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSendMessage: (content: string, type?: string) => void;
  onTyping?: () => void;
  token?: string;
}

interface GifResult {
  url: string;
  preview: string;
}

export default function ChatInput({ onSendMessage, onTyping, token }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const lastTypingSent = useRef<number>(0);

  const handleSend = async () => {
    if (message.trim() === '' || isSending) return;
    setIsSending(true);
    try {
      await onSendMessage(message.trim());
      setMessage('');
    } catch (error) {
      console.error('Erreur envoi message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessage(val);
    if (onTyping && val.length > 0) {
      const now = Date.now();
      if (now - lastTypingSent.current > 3000) {
        lastTypingSent.current = now;
        onTyping();
      }
    }
  };

  const handleGifSearch = async () => {
    if (!gifSearch.trim()) return;
    setGifLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/gif/search?q=${encodeURIComponent(gifSearch)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      const results: GifResult[] = (data || []).map((url: string) => ({ url, preview: url }));
      setGifs(results);
    } catch (err) {
      console.error('Erreur recherche GIF:', err);
    } finally {
      setGifLoading(false);
    }
  };

  const handleSendGif = async (gifUrl: string) => {
    setShowGifPicker(false);
    setGifs([]);
    setGifSearch('');
    await onSendMessage(gifUrl, 'gif');
  };

  return (
    <div className="chat-input-container">
      {showGifPicker && (
        <div style={{
          position: 'absolute', bottom: '70px', left: '16px',
          background: '#1e1f22', border: '1px solid #3f4147',
          borderRadius: '8px', padding: '12px', width: '340px',
          zIndex: 999, boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <input
              type="text"
              value={gifSearch}
              onChange={(e) => setGifSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGifSearch()}
              placeholder="Rechercher un GIF..."
              style={{
                flex: 1, padding: '8px', borderRadius: '4px',
                background: '#2b2d31', border: '1px solid #3f4147',
                color: '#fff', fontSize: '13px',
              }}
            />
            <button onClick={handleGifSearch} style={{
              padding: '8px 12px', borderRadius: '4px',
              background: '#5865f2', border: 'none',
              color: '#fff', cursor: 'pointer', fontSize: '13px',
            }}>
              🔍
            </button>
          </div>
          {gifLoading && (
            <p style={{ color: '#a3a3a3', fontSize: '13px', textAlign: 'center' }}>Chargement...</p>
          )}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '6px', maxHeight: '200px', overflowY: 'auto',
          }}>
            {gifs.map((gif, i) => (
              <img key={i} src={gif.preview} alt="gif" onClick={() => handleSendGif(gif.url)}
                style={{ width: '100%', borderRadius: '4px', cursor: 'pointer', objectFit: 'cover', height: '80px' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              />
            ))}
          </div>
          {gifs.length === 0 && !gifLoading && (
            <p style={{ color: '#a3a3a3', fontSize: '13px', textAlign: 'center' }}>Recherche un GIF ci-dessus 👆</p>
          )}
        </div>
      )}
      <div className="chat-input-wrapper">
        <button onClick={() => setShowGifPicker(o => !o)} title="Envoyer un GIF"
          style={{ background: 'none', border: 'none', color: '#8e9297', cursor: 'pointer', fontSize: '16px', padding: '0 8px', fontWeight: 'bold' }}>
          GIF
        </button>
        <input
          type="text"
          className="chat-input"
          placeholder="Envoyer un message..."
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isSending}
        />
        <button className="send-btn" onClick={handleSend} disabled={message.trim() === '' || isSending}>
          {isSending ? '⏳' : '➤'}
        </button>
      </div>
    </div>
  );
}
