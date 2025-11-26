'use client';

import { DecisionPrompt } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAgentStore } from '@/stores/agent-store';
import { AlertCircle, ArrowRight, XCircle, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface DecisionCardProps {
  prompt: DecisionPrompt;
}

export function DecisionCard({ prompt }: DecisionCardProps) {
  const { sendDecisionResponse } = useAgentStore();
  const [inputText, setInputText] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleOptionClick = (optionId: string, action: string, inputRequired?: boolean) => {
    if (inputRequired) {
      setShowInput(true);
      return;
    }
    
    sendDecisionResponse(prompt.id, action, optionId);
  };

  const handleSubmitInput = () => {
    if (inputText.trim()) {
      sendDecisionResponse(prompt.id, 'provide_input', inputText);
      setInputText('');
      setShowInput(false);
    }
  };

  return (
    <Card className="m-3 p-4 bg-accent/5 border-accent/30 animate-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="p-1.5 rounded-md bg-accent/20">
          <AlertCircle className="h-4 w-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-accent">
            {prompt.title}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {prompt.message}
          </p>
        </div>
      </div>

      {/* Input Field (if shown) */}
      {showInput && (
        <div className="mb-3 animate-in fade-in duration-200">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter your response..."
            className="h-20 text-xs resize-none bg-secondary/50 border-accent/30 focus:border-accent"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowInput(false)}
              className="flex-1 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitInput}
              disabled={!inputText.trim()}
              className="flex-1 text-xs bg-accent hover:bg-accent/90"
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              Submit
            </Button>
          </div>
        </div>
      )}

      {/* Options */}
      {!showInput && (
        <div className="flex flex-wrap gap-2">
          {prompt.options.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={option.action === 'abort' ? 'destructive' : 'outline'}
              onClick={() => handleOptionClick(option.id, option.action, option.inputRequired)}
              className={cn(
                "text-xs",
                option.action === 'continue' && 'border-primary/50 hover:border-primary hover:bg-primary/10',
                option.action === 'provide_input' && 'border-accent/50 hover:border-accent hover:bg-accent/10'
              )}
            >
              {option.action === 'continue' && <ArrowRight className="h-3 w-3 mr-1" />}
              {option.action === 'provide_input' && <MessageSquare className="h-3 w-3 mr-1" />}
              {option.action === 'abort' && <XCircle className="h-3 w-3 mr-1" />}
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}

