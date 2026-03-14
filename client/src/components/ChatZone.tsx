'use client';

import { useState, useEffect } from 'react';
import ChatHeader from '@/components/ChatHeader';
import MessageList from '@/components/MessageList';
import ChatInput from '@/components/ChatInput';

interface Message {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: string;
}

interface ChatZoneProps {
  channelName: string;
  messages: Message[];
  onSendOverride?: (content: string) => void;
  typingUsers?: string[];
  onTyping?: () => void;
}

export default function ChatZone({ channelName, messages, onSendOverride, typingUsers, onTyping }: ChatZoneProps) {
  const handleSendMessage = (content: string) => {
    if (onSendOverride) {
      onSendOverride(content);
    }
  };

  return (
    <div className="chat-zone">
      <ChatHeader channelName={channelName} />
      <MessageList messages={messages} />
      {typingUsers && typingUsers.length > 0 && (
        <div className="typing-indicator" style={{ padding: '4px 16px', fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'est en train d\'écrire...' : 'sont en train d\'écrire...'}
        </div>
      )}
      <ChatInput onSendMessage={handleSendMessage} onTyping={onTyping} />
    </div>
  );
}
