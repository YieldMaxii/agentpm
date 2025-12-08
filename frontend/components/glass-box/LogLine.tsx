'use client';

import { LogEntry, AgentTag } from '@/lib/types';
import { cn } from '@/lib/utils';

interface LogLineProps {
  entry: LogEntry;
}

const TAG_COLORS: Record<AgentTag, string> = {
  PLANNER: 'text-planner',
  SCOUT: 'text-scout',
  RESEARCHER: 'text-researcher',
  DETECTOR: 'text-detector',
  SYSTEM: 'text-muted-foreground',
};

const TAG_GLOWS: Record<AgentTag, string> = {
  PLANNER: 'text-glow-amber',
  SCOUT: 'text-glow-cyan',
  RESEARCHER: 'text-glow-green',
  DETECTOR: '',
  SYSTEM: '',
};

export function LogLine({ entry }: LogLineProps) {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const indent = entry.depth ? '  '.repeat(entry.depth) : '';

  return (
    <div className="text-xs leading-relaxed group hover:bg-white/5 px-1 -mx-1 rounded">
      {/* Timestamp */}
      <span className="text-muted-foreground/50 select-none mr-2">
        {time}
      </span>
      
      {/* Agent Tag */}
      <span className={cn(
        'font-semibold mr-2',
        TAG_COLORS[entry.tag],
        TAG_GLOWS[entry.tag]
      )}>
        [{entry.tag}]
      </span>
      
      {/* Message */}
      <span className="text-foreground/90">
        {indent}{entry.message}
      </span>
    </div>
  );
}

