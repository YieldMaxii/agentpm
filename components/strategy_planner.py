from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import aiohttp
import json
import re
import os
from dotenv import load_dotenv
from pathlib import Path
import datetime


class StrategyPlanner(Component):
    display_name = "Strategy Planner (Universal Frameworks)"
    description = "Selects from 6 distinct mental models (IRAC, Gatekeeper, PESTLE, etc.) based on domain."

    inputs = [
        DataInput(name="market_context", display_name="Market Data"),
    ]

    outputs = [
        Output(display_name="Research Plan", name="plan_data", method="generate_plan"),
    ]

    async def generate_plan(self) -> Data:
        # Pass through skip marker
        if self.market_context and hasattr(self.market_context, 'data') and self.market_context.data.get("__skip__"):
            return Data(data={"__skip__": True, "logs": self.market_context.data.get("logs", [])})
        
        if not self.market_context: 
            return Data(data={
                "market_data": {},
                "research_plan": {"domain": "Unknown", "success_condition": "Unknown", "questions": [], "factors": []},
                "logs": ["⚠️ No market context provided"],
                "original_query": "",
                "history_context": ""
            })
        
        # --- 1. UNPACK DATA ---
        logs = self.market_context.data.get("logs", []).copy()
        event = self.market_context.data.get("event")
        slug = self.market_context.data.get("slug")
        user_query = self.market_context.data.get("original_query", "")
        history_context = self.market_context.data.get("history_context", "")
        market_odds = self.market_context.data.get("market_implied_prob", 50)
        
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        logs.append(f"🕒 **{timestamp}** - Planner Started")

        # Handle "Unknown" Market Case
        is_unknown = not event or not slug or event == "Unknown Event" or slug == "unknown"
        target = event if not is_unknown else user_query
        
        if is_unknown:
            logs.append("⚠️ **Planner:** No specific market found. Planning for User Query directly.")

        # Load Keys
        env_path = Path(__file__).parent.parent / '.env'
        load_dotenv(dotenv_path=env_path)
        CHUTES_KEY = os.getenv("CHUTES_API_KEY")
        PERPLEXITY_KEY = os.getenv("PERPLEXITY_API_KEY")
        
        if not CHUTES_KEY or not PERPLEXITY_KEY:
            logs.append("❌ **Planner Error:** Missing API Keys.")
            return Data(data={"logs": logs})

        # --- 2. PRE-FLIGHT: Fetch Live Context ---
        live_context = "No live context available."
        try:
            logs.append(f"🌐 **Planner:** Fetching live news snapshot...")
            url = "https://api.perplexity.ai/chat/completions"
            headers = {"Authorization": f"Bearer {PERPLEXITY_KEY}", "Content-Type": "application/json"}
            payload = {
                "model": "sonar",
                "messages": [{"role": "user", "content": f"Summarize the top 3 breaking news headlines for: '{target}'. Be concise with dates."}]
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=15)) as response:
                    if response.status == 200:
                        live_context = (await response.json())["choices"][0]["message"]["content"]
                        logs.append("✅ **Planner:** Live context retrieved.")
                    else:
                        logs.append(f"⚠️ **Planner:** Context fetch failed (API {response.status}).")
        except Exception as e:
            logs.append(f"⚠️ **Planner:** Context fetch error.")

        # --- 3. THE UNIVERSAL FRAMEWORKS PROMPT ---
        query = f"""You are a Senior Research Architect. Your job is to select the optimal analytical framework and generate a research plan.

TARGET: '{target}'
MARKET ODDS: {market_odds:.1f}%
LIVE NEWS CONTEXT: {live_context}
PRIOR HISTORY: {history_context if history_context else "No prior analysis."}

### SELECT THE OPTIMAL MENTAL MODEL:

**1. IRAC Method (Legal/Courts/Regulatory Disputes)**
   - Use for: Supreme Court cases, Lawsuits, Criminal Trials, Legal challenges
   - Key Questions: What is the controlling Precedent? What specific Statutes apply? Who is the Judge/Jury? What is the procedural timeline?
   - Success defined by: Court ruling, Legal deadline, Settlement announcement

**2. Gatekeeper Model (Regulatory Approvals)**
   - Use for: FDA drug approvals, SEC/ETF approvals, Merger approvals (FTC/DOJ), Licensing
   - Key Questions: What is the specific approval checklist? What did the latest technical report say (Phase 3, EIS, S-1)? Who is the key decision-maker? What are historical approval rates?
   - Success defined by: Regulatory announcement, Approval letter, PDUFA date

**3. Comps & Decay (Entertainment/Media/Consumer)**
   - Use for: Box office predictions, Album/Game sales, Streaming numbers, Product launches
   - Key Questions: How did comparable titles perform? What are pre-sale/pre-order numbers? What's the critical vs audience score divergence? What's the decay curve?
   - Success defined by: Sales threshold, Chart position, Review aggregator score

**4. PESTLE (Geopolitics/Elections/Policy)**
   - Use for: Elections, Wars/Conflicts, Policy changes, International relations
   - Key Questions: Political forces? Economic pressures? Social sentiment? Technological factors? Legal constraints? Environmental context?
   - Success defined by: Election result, Policy announcement, Treaty signing

**5. 3-Horizon (Corporate/Tech/Business)**
   - Use for: Product launches, CEO changes, Earnings, M&A, Tech announcements
   - Key Questions: What are management incentives? What is technical readiness (supply chain, development)? What are market signals (insider trading, options flow)?
   - Success defined by: Product announcement, Earnings beat/miss, Executive action

**6. Base Rate + Bayes (Binary/General/Sports)**
   - Use for: Sports outcomes, Weather, General binary events, Historical pattern matching
   - Key Questions: What is the historical base rate? What is the current form/momentum? What are the key variables that deviate from base rate?
   - Success defined by: Event occurrence, Score threshold, Specific outcome

### YOUR TASK:

1. **SELECT FRAMEWORK:** Choose the single most appropriate framework from above.
2. **DEFINE SUCCESS:** What EXACTLY must happen for YES? Be specific with dates, thresholds, announcements.
3. **GENERATE QUESTIONS:** Create 4-5 research questions using the selected framework:
   - Q1: Consensus verification (Is the mainstream view accurate?)
   - Q2-Q3: Framework-specific metrics (The key questions from your chosen model)
   - Q4: Variant/Contrarian view (What is everyone missing?)
4. **IDENTIFY FACTORS:** List 4-5 key drivers with research questions.

### OUTPUT JSON ONLY:
{{
  "domain": "<Selected Framework Name>",
  "framework_rationale": "<Why this framework fits>",
  "success_condition": "<Precise testable outcome with dates/thresholds>",
  "questions": [
      "<Consensus verification question>",
      "<Framework-specific metric question 1>",
      "<Framework-specific metric question 2>",
      "<Variant/Contrarian question>"
  ],
  "factors": [
      {{"name": "<Factor Name>", "question": "<Research question>"}},
      {{"name": "<Factor Name>", "question": "<Research question>"}},
      {{"name": "<Factor Name>", "question": "<Research question>"}},
      {{"name": "<Factor Name>", "question": "<Research question>"}}
  ]
}}"""

        # --- 4. CALL DEEPSEEK R1 (with streaming) ---
        plan_json = {
            "domain": "Base Rate + Bayes", 
            "framework_rationale": "Default framework",
            "success_condition": f"The event '{target}' resolves to YES", 
            "questions": ["What are the key factors affecting this outcome?"],
            "factors": [{"name": "General Analysis", "question": "What are the key drivers?"}]
        }

        try:
            url = "https://llm.chutes.ai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {CHUTES_KEY}", "Content-Type": "application/json"}
            body = {
                "model": "deepseek-ai/DeepSeek-R1-0528",
                "messages": [{"role": "user", "content": query}],
                "stream": True,
                "max_tokens": 2048,
                "temperature": 0.3
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=body, timeout=aiohttp.ClientTimeout(total=120)) as response:
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
                        
                        # Clean <think> tags
                        clean = full_content
                        thoughts = None
                        if "<think>" in clean:
                            parts = re.split(r"</think>", clean)
                            if len(parts) > 1:
                                thoughts = parts[0].replace("<think>", "").strip()
                                clean = parts[1].strip()
                                logs.append(f"💭 **Planner Thought:** {thoughts[:120]}...")
                        
                        clean = clean.replace("```json", "").replace("```", "").strip()

                        # Extract and parse JSON with repair attempts
                        try:
                            start = clean.find("{")
                            end = clean.rfind("}")
                            if start != -1 and end != -1:
                                json_str = clean[start:end+1]
                                
                                # Try direct parse first
                                try:
                                    plan_json = json.loads(json_str)
                                except json.JSONDecodeError:
                                    # Attempt JSON repair
                                    json_str = self._repair_json(json_str)
                                    plan_json = json.loads(json_str)
                                
                                # Log the plan details
                                framework = plan_json.get("domain", "Unknown")
                                rationale = plan_json.get("framework_rationale", "")
                                cond = plan_json.get("success_condition", "Undefined")
                                num_questions = len(plan_json.get("questions", []))
                                num_factors = len(plan_json.get("factors", []))
                                
                                logs.append(f"🧠 **Framework Selected:** {framework}")
                                if rationale:
                                    logs.append(f"📐 **Rationale:** {rationale[:80]}...")
                                logs.append(f"🎯 **Success Condition:** {cond[:100]}...")
                                logs.append(f"📝 **Plan:** {num_questions} questions, {num_factors} factors.")
                            else:
                                logs.append("⚠️ **Planner:** No JSON found. Using default plan.")
                        except json.JSONDecodeError as e:
                            logs.append(f"⚠️ **Planner:** JSON Error: {str(e)[:50]}. Using default.")
                    else:
                        logs.append(f"❌ **Planner Error:** API {response.status}")

        except Exception as e:
            logs.append(f"❌ **Planner Exception:** {str(e)[:80]}")

        return Data(data={
            "market_data": self.market_context.data,
            "research_plan": plan_json,
            "logs": logs,
            "original_query": user_query,
            "history_context": history_context
        })
    
    def _repair_json(self, json_str: str) -> str:
        """Attempt to repair common JSON formatting issues from LLM output."""
        import re
        
        # Remove any text before first { and after last }
        start = json_str.find("{")
        end = json_str.rfind("}")
        if start != -1 and end != -1:
            json_str = json_str[start:end+1]
        
        # Fix common issues:
        # 1. Remove trailing commas before } or ]
        json_str = re.sub(r',\s*}', '}', json_str)
        json_str = re.sub(r',\s*]', ']', json_str)
        
        # 2. Add missing commas between elements (} followed by " or { followed by ")
        json_str = re.sub(r'}\s*"', '}, "', json_str)
        json_str = re.sub(r']\s*"', '], "', json_str)
        json_str = re.sub(r'"\s*{', '", {', json_str)
        json_str = re.sub(r'"\s*\[', '", [', json_str)
        
        # 3. Fix missing commas between string values
        json_str = re.sub(r'"\s+(?=")', '", ', json_str)
        
        # 4. Replace single quotes with double quotes (if used for strings)
        # Be careful not to break apostrophes in text
        json_str = re.sub(r"(?<=[{,:\[])\s*'([^']*?)'\s*(?=[},:\]])", r'"\1"', json_str)
        
        # 5. Fix newlines inside strings
        json_str = json_str.replace('\n', '\\n')
        
        # 6. Escape unescaped quotes inside strings (tricky - basic attempt)
        # This is a simple heuristic
        
        return json_str
