from langflow.custom import Component
from langflow.io import MessageInput, Output
from langflow.schema import Data
import aiohttp
import json
import os
from dotenv import load_dotenv
from pathlib import Path


class SmartRouter(Component):
    display_name = "Smart Router (Async)"
    description = "Classifies query as SIMPLE or COMPLEX. Connect output to BOTH QuickAnswer AND MarketResolver - they self-filter."

    inputs = [
        MessageInput(name="user_input", display_name="User Query"),
    ]

    outputs = [
        Output(display_name="Routed Data", name="routed_data", method="classify_and_route"),
    ]

    async def classify_and_route(self) -> Data:
        """Classify the query and output routing data. Connect to BOTH paths - they self-filter."""
        query = self.user_input.text if hasattr(self.user_input, 'text') else str(self.user_input)
        
        env_path = Path(__file__).parent.parent / '.env'
        load_dotenv(dotenv_path=env_path)
        CHUTES_KEY = os.getenv("CHUTES_API_KEY")
        
        if not CHUTES_KEY:
            return Data(data={
                "original_query": query,
                "router_decision": "COMPLEX",
                "router_reason": "No API key available",
                "logs": ["🔀 **Router:** No API key - unable to classify"]
            })
        
        url = "https://llm.chutes.ai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {CHUTES_KEY}",
            "Content-Type": "application/json"
        }
        
        prompt = f"""# Your Role

You are the **Router** - the first decision point in AgentPM, a sophisticated prediction market research system. Your job is critical: you determine which pipeline processes each user query.

# The System Architecture

AgentPM has two processing paths:

## SIMPLE Path (QuickAnswer)
- Uses Perplexity to perform a single internet search
- Returns factual information directly
- Fast (~2 seconds) and low cost (~$0.005)
- Appropriate for: current facts, prices, dates, scores, definitions, general knowledge
- Think of this as "What would Google/Perplexity answer directly?"

## COMPLEX Path (Deep Research Pipeline)  
- Searches Polymarket for relevant prediction markets
- Loads historical thesis data for Bayesian updating
- Uses DeepSeek R1 to define success conditions
- Conducts recursive research with multiple Perplexity calls
- Synthesizes probability assessments with supporting factors
- Slower (~30-60 seconds) and higher cost (~$0.02-0.03)
- Appropriate for: probability questions, prediction analysis, "will X happen?", market odds, future outcome analysis
- Think of this as "What requires our full prediction market research capabilities?"

# Your Decision

Analyze this user query and determine which path serves them best:

**Query:** "{query}"

Ask yourself:
1. Is the user asking for a current fact that exists on the internet right now? → SIMPLE
2. Is the user asking about probability, likelihood, or future outcomes? → COMPLEX
3. Would a single search engine query fully satisfy this request? → SIMPLE
4. Does this require synthesizing information to form a probability assessment? → COMPLEX

# Output Format

Respond with only a JSON object:
{{"type": "SIMPLE"}} or {{"type": "COMPLEX"}}"""

        body = {
            "model": "Qwen/Qwen3-Coder-30B-A3B-Instruct",
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
            "max_tokens": 100,
            "temperature": 0.0
        }
        
        decision_type = None
        decision_reason = "LLM classification"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=body) as response:
                    if response.status == 200:
                        full_content = ""
                        async for line in response.content:
                            line = line.decode("utf-8").strip()
                            if line.startswith("data: "):
                                data = line[6:]
                                if data == "[DONE]":
                                    break
                                try:
                                    chunk = json.loads(data)
                                    choices = chunk.get("choices", [])
                                    if choices and len(choices) > 0:
                                        delta = choices[0].get("delta", {})
                                        content = delta.get("content") or ""
                                        full_content += content
                                except (json.JSONDecodeError, IndexError, KeyError):
                                    continue
                        
                        # Clean the response
                        clean_content = full_content.strip()
                        clean_content = clean_content.replace("```json", "").replace("```", "").strip()
                        
                        if "</think>" in clean_content:
                            clean_content = clean_content.split("</think>", 1)[-1].strip()
                        
                        # Parse JSON from LLM response
                        start = clean_content.find("{")
                        end = clean_content.rfind("}")
                        if start != -1 and end != -1:
                            json_str = clean_content[start:end+1]
                            parsed = json.loads(json_str)
                            if parsed.get("type") in ["SIMPLE", "COMPLEX"]:
                                decision_type = parsed["type"]
                    
        except Exception as e:
            decision_reason = f"Classification error: {str(e)[:30]}"
        
        # If LLM didn't return a valid decision, we need to handle it
        if decision_type is None:
            decision_type = "COMPLEX"
            decision_reason = "LLM response invalid - routing to full analysis for safety"
        
        return Data(data={
            "original_query": query,
            "router_decision": decision_type,
            "router_reason": decision_reason,
            "logs": [f"🔀 **Router:** Query classified as **{decision_type}**. Reason: {decision_reason}"]
        })
