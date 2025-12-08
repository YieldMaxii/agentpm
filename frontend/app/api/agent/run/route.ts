import { NextResponse } from 'next/server';
import { AgentRunRequest, AgentRunResponse, AlphaSignal, SignalType } from '@/lib/types';

// LangFlow configuration - can be overridden with environment variables
const LANGFLOW_URL = process.env.LANGFLOW_URL || 'http://localhost:7860';
const LANGFLOW_FLOW_ID = process.env.LANGFLOW_FLOW_ID || '05578589-0f3b-4382-a305-3eca25e5a9d3';
const LANGFLOW_API_KEY = process.env.LANGFLOW_API_KEY || 'sk-8h4FkeV9zMAsU2i3f_6ofdGWq-uoxVcwd9DrVStEA7c';

export async function POST(request: Request) {
  try {
    const body: AgentRunRequest = await request.json();
    const { query, marketContext } = body;
    // config can be used for tweaks in the future - keeping for reference
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { config: agentConfig } = body;

    if (!query) {
      return NextResponse.json({
        success: false,
        logs: [],
        error: 'Query is required',
      } as AgentRunResponse, { status: 400 });
    }

    // Build the LangFlow API URL
    const langflowUrl = `${LANGFLOW_URL}/api/v1/run/${LANGFLOW_FLOW_ID}`;
    
    // Prepare the request body for LangFlow
    const langflowBody = {
      input_value: query,
      output_type: 'chat',
      input_type: 'chat',
      tweaks: {
        // Pass configuration as tweaks if needed
        // These map to specific component IDs in the flow
      },
    };

    console.log(`[AgentPM] Calling LangFlow at: ${langflowUrl}`);
    console.log(`[AgentPM] Query: "${query}"`);

    // Call LangFlow API with API key authentication
    const response = await fetch(langflowUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LANGFLOW_API_KEY,
      },
      body: JSON.stringify(langflowBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AgentPM] LangFlow error: ${response.status}`, errorText);
      
      return NextResponse.json({
        success: false,
        logs: [`LangFlow API error: ${response.status}`],
        error: `LangFlow returned ${response.status}: ${errorText.slice(0, 200)}`,
      } as AgentRunResponse, { status: 502 });
    }

    const result = await response.json();
    console.log('[AgentPM] LangFlow response received');

    // Parse the LangFlow response
    const { logs, signal, rawOutput } = parseLangFlowResponse(result, marketContext);

    return NextResponse.json({
      success: true,
      logs,
      signal,
      rawOutput,
    } as AgentRunResponse);

  } catch (error) {
    console.error('[AgentPM] Agent run error:', error);
    
    // Check if it's a connection error to LangFlow
    const isConnectionError = (error as Error).message?.includes('ECONNREFUSED') || 
                              (error as Error).message?.includes('fetch failed');
    
    return NextResponse.json({
      success: false,
      logs: [],
      error: isConnectionError 
        ? 'Cannot connect to LangFlow. Make sure LangFlow is running at localhost:7860'
        : `Agent error: ${(error as Error).message}`,
    } as AgentRunResponse, { status: 500 });
  }
}

// Parse LangFlow response and extract logs + signal
function parseLangFlowResponse(
  result: unknown,
  marketContext?: { title: string; slug: string; odds: number; volume: number } | null
): { logs: string[]; signal?: AlphaSignal; rawOutput?: string } {
  const logs: string[] = [];
  let signal: AlphaSignal | undefined;
  let rawOutput: string | undefined;

  try {
    // LangFlow response structure varies - handle different formats
    const outputs = (result as { outputs?: Array<{ outputs?: unknown[] }> })?.outputs;
    
    if (outputs && Array.isArray(outputs)) {
      for (const output of outputs) {
        const innerOutputs = (output as { outputs?: unknown[] })?.outputs;
        
        if (innerOutputs && Array.isArray(innerOutputs)) {
          for (const inner of innerOutputs) {
            const results = (inner as { results?: { message?: { text?: string; data?: { logs?: string[] } } } })?.results;
            const message = results?.message;
            
            if (message) {
              // Extract text output
              if (message.text) {
                rawOutput = message.text;
                
                // Try to extract logs from the text
                const extractedLogs = extractLogsFromText(message.text);
                logs.push(...extractedLogs);
              }
              
              // Extract logs from data if present
              if (message.data?.logs && Array.isArray(message.data.logs)) {
                logs.push(...message.data.logs);
              }
            }
          }
        }
      }
    }

    // If we got raw output, try to parse a signal from it
    if (rawOutput) {
      signal = extractSignalFromOutput(rawOutput, marketContext);
    }

  } catch (error) {
    console.error('[AgentPM] Error parsing LangFlow response:', error);
    logs.push('Error parsing agent response');
  }

  return { logs, signal, rawOutput };
}

// Extract log entries from LangFlow text output
function extractLogsFromText(text: string): string[] {
  const logs: string[] = [];
  
  // Split by newlines and filter meaningful lines
  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    // Skip empty lines and separators
    if (!line.trim() || line.match(/^[-=]+$/)) continue;
    
    // Add the line as a log entry
    logs.push(line.trim());
  }
  
  return logs;
}

// Extract alpha signal from the output text
function extractSignalFromOutput(
  text: string,
  marketContext?: { title: string; slug: string; odds: number; volume: number } | null
): AlphaSignal | undefined {
  try {
    // Look for structured signal data in the output
    // The Alpha Detector component outputs specific patterns
    
    let signal: SignalType = 'HOLD';
    let edge = 0;
    let fairValue = 0.5;
    let marketOdds = marketContext?.odds || 0.5;
    let confidence = 0.5;
    
    // Try to extract fair value probability
    const fairValueMatch = text.match(/fair\s*value[:\s]*(\d+(?:\.\d+)?)\s*%?/i) ||
                          text.match(/model\s*(?:probability|prob)[:\s]*(\d+(?:\.\d+)?)\s*%?/i);
    if (fairValueMatch) {
      const val = parseFloat(fairValueMatch[1]);
      fairValue = val > 1 ? val / 100 : val;
    }
    
    // Try to extract market odds
    const marketOddsMatch = text.match(/market\s*(?:odds|implied|prob)[:\s]*(\d+(?:\.\d+)?)\s*%?/i);
    if (marketOddsMatch) {
      const val = parseFloat(marketOddsMatch[1]);
      marketOdds = val > 1 ? val / 100 : val;
    }
    
    // Try to extract edge
    const edgeMatch = text.match(/edge[:\s]*([+-]?\d+(?:\.\d+)?)\s*%?/i);
    if (edgeMatch) {
      edge = parseFloat(edgeMatch[1]);
    } else {
      // Calculate edge from fair value vs market odds
      edge = (fairValue - marketOdds) * 100;
    }
    
    // Determine signal based on edge
    if (edge >= 15) signal = 'STRONG_BUY';
    else if (edge >= 5) signal = 'BUY';
    else if (edge <= -15) signal = 'STRONG_SELL';
    else if (edge <= -5) signal = 'SELL';
    else signal = 'HOLD';
    
    // Try to extract confidence
    const confidenceMatch = text.match(/confidence[:\s]*(\d+(?:\.\d+)?)\s*%?/i);
    if (confidenceMatch) {
      const val = parseFloat(confidenceMatch[1]);
      confidence = val > 1 ? val / 100 : val;
    }
    
    // Extract reasoning
    const reasoningMatch = text.match(/(?:reasoning|analysis|summary)[:\s]*([^\n]+(?:\n(?![A-Z])[^\n]+)*)/i);
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 
      `Model fair value: ${(fairValue * 100).toFixed(1)}% vs Market: ${(marketOdds * 100).toFixed(1)}%. Edge: ${edge > 0 ? '+' : ''}${edge.toFixed(1)}%`;
    
    return {
      marketId: marketContext?.slug || 'unknown',
      marketTitle: marketContext?.title || 'Analysis Result',
      signal,
      edge,
      fairValue,
      marketOdds,
      confidence,
      factors: [], // Would need more sophisticated parsing to extract factors
      reasoning,
      timestamp: Date.now(),
    };
    
  } catch (error) {
    console.error('[AgentPM] Error extracting signal:', error);
    return undefined;
  }
}

