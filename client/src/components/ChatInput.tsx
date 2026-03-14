'use client';

import { useState, useRef, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onTyping?: () => void;
}

export default function ChatInput({ onSendMessage, onTyping }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // ★ Throttle : envoie immédiatement au premier caractère, puis max 1x/3s
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

    // ★ Envoie typing immédiatement au premier caractère
    // puis throttle à 1 event / 3 secondes max
    if (onTyping && val.length > 0) {
      const now = Date.now();
      if (now - lastTypingSent.current > 3000) {
        lastTypingSent.current = now;
        onTyping();
      }
    }
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <input
          type="text"
          className="chat-input"
          placeholder="Envoyer un message..."
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isSending}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={message.trim() === '' || isSending}
        >
          {isSending ? '⏳' : '➤'}
        </button>
      </div>
    </div>
  );
}
