'use client';

import { useState, useEffect } from 'react';

export function Clock() {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    // Set initial time on client mount
    setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    
    // Update every second
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Render nothing until client-side hydration
  if (!time) return <span className="w-16" />;
  
  return <span suppressHydrationWarning>{time}</span>;
}

