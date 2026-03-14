'use client';

interface LoadingSkeletonProps {
  count?: number;
  type?: 'server-card' | 'message' | 'channel';
}

export default function LoadingSkeleton({ count = 3, type = 'server-card' }: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (type === 'server-card') {
    return (
      <div className="servers-grid">
        {items.map((i) => (
          <div key={i} className="server-card skeleton">
            <div className="skeleton-icon"></div>
            <div className="skeleton-text">
              <div className="skeleton-line" style={{ width: '60%' }}></div>
              <div className="skeleton-line" style={{ width: '40%' }}></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'message') {
    return (
      <div className="messages-skeleton">
        {items.map((i) => (
          <div key={i} className="message-skeleton">
            <div className="skeleton-avatar"></div>
            <div className="skeleton-message-content">
              <div className="skeleton-line" style={{ width: '30%' }}></div>
              <div className="skeleton-line" style={{ width: '80%' }}></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}