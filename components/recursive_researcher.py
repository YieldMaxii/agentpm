from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import aiohttp
import asyncio
import json
import re
import os
from dotenv import load_dotenv
from pathlib import Path
import datetime


class RecursiveResearcher(Component):
    display_name = "Recursive Researcher (Fractal Quant)"
    description = "Parallel Execution + ToT Branching + Sonar-Pro Depth + Bayesian Updates."

    inputs = [
        DataInput(name="plan_input", display_name="Research Plan"),
    ]

    outputs = [
        Output(display_name="Deep Dossier", name="dossier", method="execute_research"),
    ]

    async def execute_research(self) -> Data:
        # Pass through skip marker
        if self.plan_input and hasattr(self.plan_input, 'data') and self.plan_input.data.get("__skip__"):
            return Data(data={"__skip__": True, "logs": self.plan_input.data.get("logs", [])})
        
        if not self.plan_input: 
            return Data(data={
                "research_summary": "No input provided",
                "model_confidence": 50.0,
                "factor_data": [],
                "logs": ["⚠️ No input."]
            })
        
        # --- 1. SETUP & UNPACKING ---
        input_data = self.plan_input.data
        logs = input_data.get("logs", []).copy()
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        
        if "market_data" in input_data:
            market_data = input_data.get("market_data", {})
            plan = input_data.get("research_plan", {})
            logs.append(f"🕒 **{timestamp}** - Fractal Researcher Started")
        else:
            market_data = input_data
            plan = {"domain": "General", "factors": [{"name": "General", "question": "Analyze the market."}]}
        
        event = market_data.get("event", "Unknown Event")
        odds = market_data.get("market_implied_prob", 50)
        user_query = input_data.get("original_query", "")
        history_context = input_data.get("history_context", "No previous analysis.")
        prior_probability = market_data.get("prior_probability")
        
        # The "North Star" Logic
        success_cond = plan.get("success_condition", f"The event '{event}' occurs.")
        domain = plan.get("domain", "General")
        
        # Extract research questions - prioritize "questions" array (Barbell approach)
        initial_questions = plan.get("questions", [])
        
        # Also add factor-specific questions if available
        factors = plan.get("factors", [])
        factor_questions = [f.get("question") for f in factors if isinstance(f, dict) and f.get("question")]
        
        # Combine: Barbell questions first, then factor questions
        all_questions = initial_questions + [q for q in factor_questions if q not in initial_questions]
        
        if not all_questions:
            all_questions = ["What are the key factors affecting this outcome?"]
        
        # Limit to prevent token overflow
        initial_questions = all_questions[:6]

        # Load Keys
        env_path = Path(__file__).parent.parent / '.env'
        load_dotenv(dotenv_path=env_path)
        CHUTES_KEY = os.getenv("CHUTES_API_KEY")
        PERPLEXITY_KEY = os.getenv("PERPLEXITY_API_KEY")
        
        if not CHUTES_KEY or not PERPLEXITY_KEY:
            logs.append("❌ **Error:** Missing API Keys.")
            return Data(data={"logs": logs, "research_summary": "API keys missing", "model_confidence": 50, "factor_data": []})

        # --- 2. ASYNC TOOLS ---

        # Tool A: Perplexity (Sonar-Pro for Depth)
        async def search_perplexity(query, context_tag):
            try:
                url = "https://api.perplexity.ai/chat/completions"
                headers = {"Authorization": f"Bearer {PERPLEXITY_KEY}", "Content-Type": "application/json"}
                payload = {
                    "model": "sonar-pro",
                    "messages": [
                        {"role": "system", "content": "You are a forensic researcher. Be exhaustive. Cite sources with specific dates, numbers, and quotes."},
                        {"role": "user", "content": f"Context: {context_tag}. Question: {query}"}
                    ]
                }
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as response:
                        if response.status == 200:
                            data = await response.json()
                            content = data["choices"][0]["message"]["content"]
                            citations = data.get("citations", [])
                            return {
                                "query": query,
                                "content": content,
                                "citations": citations,
                                "status": "success"
                            }
                        return {"query": query, "content": f"API Error {response.status}", "status": "error"}
            except Exception as e:
                return {"query": query, "content": str(e), "status": "error"}

        # Tool B: DeepSeek R1 (The Brain) - with streaming
        async def ask_deepseek(system_prompt, user_prompt):
            try:
                url = "https://llm.chutes.ai/v1/chat/completions"
                headers = {"Authorization": f"Bearer {CHUTES_KEY}", "Content-Type": "application/json"}
                payload = {
                    "model": "deepseek-ai/DeepSeek-R1-0528",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "stream": True,
                    "max_tokens": 8192,
                    "temperature": 0.3
                }
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=180)) as response:
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
                            if "</think>" in clean:
                                parts = clean.split("</think>", 1)
                                if len(parts) == 2:
                                    clean = parts[1].strip()
                            clean = re.sub(r'<think>.*', '', clean, flags=re.DOTALL).strip()
                            return clean.replace("```json", "").replace("```", "").strip()
                        return None
            except Exception as e:
                return None

        # --- 3. WAVE 1: INITIAL FAN-OUT ---
        logs.append(f"🚀 **Wave 1:** Launching {len(initial_questions)} parallel 'Sonar-Pro' agents...")
        
        knowledge_base = []
        all_citations = []
        
        tasks = [search_perplexity(q, f"{domain} Analysis for {event}") for q in initial_questions]
        results = await asyncio.gather(*tasks)
        
        for res in results:
            if res["status"] == "success":
                entry = f"**Q:** {res['query']}\n**Sources:** {len(res['citations'])} citations\n**A:** {res['content']}"
                knowledge_base.append(entry)
                all_citations.extend(res.get('citations', []))
                logs.append(f"&nbsp;&nbsp;&nbsp;&nbsp;✅ Found: *{res['query'][:50]}...*")
                else:
                logs.append(f"&nbsp;&nbsp;&nbsp;&nbsp;⚠️ Failed: *{res['query'][:50]}...*")

        # --- 4. TREE OF THOUGHT (The Branching) ---
        logs.append("🧠 **DeepSeek:** Analyzing Wave 1 to find 'Rabbit Holes'...")
        
        kb_text = "\n---\n".join(knowledge_base[:5])  # Limit to prevent token overflow
        
        # Prompt: Find the "Unknown Unknowns"
        branch_prompt = f"""ROLE: Lead Investigator.
EVENT: {event}.
SUCCESS CONDITION: {success_cond}.
USER QUESTION: {user_query}

CURRENT FINDINGS:
{kb_text}

TASK: "No Stone Unturned".
1. Identify contradictions, gaps, or weak points in the current findings.
2. What specific "Rabbit Hole" would disprove or strengthen the current consensus?
3. Generate 2-3 NEW, highly specific search queries to investigate these leads.
4. Focus on: authoritative sources (official data, Fed statements, economic indicators), recent news that could shift odds, expert analysis.

OUTPUT JSON ONLY: {{ "new_queries": ["Specific query 1...", "Specific query 2..."], "reasoning": "Brief explanation of gaps found" }}"""

        branch_res = await ask_deepseek("You are a research strategist. Output JSON only.", branch_prompt)
        new_queries = []
        
        try:
            if branch_res:
                json_match = re.search(r"\{.*\}", branch_res, re.DOTALL)
                if json_match:
                    branch_data = json.loads(json_match.group(0))
                    new_queries = branch_data.get("new_queries", [])
                    if branch_data.get("reasoning"):
                        logs.append(f"💡 **Gaps Found:** {branch_data['reasoning'][:100]}...")
        except (json.JSONDecodeError, ValueError):
            pass

        # --- 5. WAVE 2: DYNAMIC EXPANSION ---
        if new_queries:
            logs.append(f"🔀 **Wave 2:** Spawning {len(new_queries)} sub-agents for deep dive...")
            
            tasks = [search_perplexity(q, "Deep Dive Investigation") for q in new_queries[:3]]
            results = await asyncio.gather(*tasks)
            
            for res in results:
                if res["status"] == "success":
                    entry = f"**[DEEP DIVE] Q:** {res['query']}\n**A:** {res['content']}"
                    knowledge_base.append(entry)
                    all_citations.extend(res.get('citations', []))
                    logs.append(f"&nbsp;&nbsp;&nbsp;&nbsp;🔎 Digging: *{res['query'][:50]}...*")
        else:
            logs.append("✅ **DeepSeek:** No further rabbit holes found. Moving to synthesis.")

        # --- 6. FINAL SYNTHESIS (Quant Logic with Bayesian Update) ---
        logs.append("🤔 **Researcher:** Final Probability Calculation...")
        
        full_evidence = "\n\n---\n\n".join(knowledge_base)
        
        # Include Bayesian context if available
        bayesian_section = ""
        if history_context and "No previous" not in history_context:
            bayesian_section = f"""
PREVIOUS ANALYSIS (PRIOR):
{history_context}

BAYESIAN INSTRUCTION: Compare new evidence against prior thesis. Only change probability if NEW evidence materially alters the outlook. Explain what changed.
"""

        final_prompt = f"""ROLE: Senior Macro Quantitative Analyst at a top hedge fund.
You are producing an institutional-quality research report for a prediction market.

TARGET OUTCOME: '{event}'
SUCCESS CONDITION (for YES): '{success_cond}'
CURRENT MARKET ODDS: {odds:.1f}%
USER QUESTION: {user_query}
{bayesian_section}

FULL INVESTIGATION DOSSIER ({len(knowledge_base)} sources, {len(all_citations)} citations):
{full_evidence}

YOUR TASK: Produce a comprehensive probability assessment.

REQUIREMENTS:
1. **probability** (0-100): Your fair value estimate. Be precise - not just 50%.
2. **reasoning** (500+ words MINIMUM): A detailed multi-paragraph analysis including:
   - Current consensus and why the market is priced where it is
   - Key supporting evidence with specific data points, quotes, and dates
   - Key risks and counterarguments
   - Recent developments that moved the needle
   - Your edge vs market (if any) and why
   - Final assessment synthesizing all factors

3. **factors**: Array of 4-6 specific factors, each with:
   - name: Specific factor (e.g., "CME FedWatch December Odds", "November CPI Print")
   - weight: Importance 1-100 (should sum to ~100)
   - score: Your assessment 1-10 (10 = strongly supports YES outcome)
   - impact: Probability impact (e.g., "+15%", "-8%")

4. **delta_summary**: What changed from prior analysis (or "First analysis" if no prior)

LOGIC RULES:
- Weigh 'Official Data' and 'Central Bank Communications' higher than speculation
- If evidence contradicts the Success Condition, probability should be LOW
- Be specific - cite numbers, dates, and sources from the dossier
- If market is fairly priced, say so. If you see edge, explain why.

OUTPUT VALID JSON:
{{
  "probability": 75,
  "reasoning": "Detailed 500+ word analysis here with specific evidence...",
  "factors": [
    {{"name": "CME FedWatch Probability", "weight": 30, "score": 8, "impact": "+12%"}},
    {{"name": "Fed Governor Waller Comments", "weight": 25, "score": 7, "impact": "+8%"}},
    {{"name": "November Jobs Report", "weight": 20, "score": 6, "impact": "+5%"}},
    {{"name": "Inflation Trajectory", "weight": 15, "score": 7, "impact": "+5%"}},
    {{"name": "Geopolitical Uncertainty", "weight": 10, "score": 4, "impact": "-5%"}}
  ],
  "delta_summary": "Summary of what changed from prior thesis"
}}"""

        final_res = await ask_deepseek("You are a senior quant analyst. Output comprehensive JSON analysis.", final_prompt)
        
        final_json = None
        try:
            if final_res:
                json_match = re.search(r"\{.*\}", final_res, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                    try:
                        final_json = json.loads(json_str)
                    except json.JSONDecodeError:
                        # Attempt repair
                        json_str = self._repair_json(json_str)
                    final_json = json.loads(json_str)
        except (json.JSONDecodeError, ValueError):
            logs.append("⚠️ **R1:** JSON parsing failed. Retrying...")

        # Retry with simpler prompt if first attempt failed
        if not final_json:
            retry_prompt = f"""Based on the research, provide your assessment of: {event}
Market odds: {odds}%. Your probability estimate and detailed reasoning.

OUTPUT JSON: {{"probability": X, "reasoning": "detailed analysis...", "factors": [...], "delta_summary": "..."}}"""
            
            retry_res = await ask_deepseek("Output valid JSON only.", retry_prompt)
            try:
                if retry_res:
                    json_match = re.search(r"\{.*\}", retry_res, re.DOTALL)
                    if json_match:
                        final_json = json.loads(json_match.group(0))
                        logs.append("✅ **R1:** Retry successful.")
            except (json.JSONDecodeError, ValueError):
                pass

        # Final fallback
            if not final_json:
            summary_text = f"Research conducted with {len(knowledge_base)} sources and {len(all_citations)} citations. "
            if knowledge_base:
                # Extract key points from knowledge base
                summary_text += "Key findings:\n\n"
                for kb in knowledge_base[:3]:
                    summary_text += f"• {kb[:300]}...\n\n"
                
                final_json = {
                "probability": prior_probability if prior_probability else 50,
                "reasoning": summary_text,
                "factors": [],
                "delta_summary": "Analysis incomplete - using fallback"
                }
                logs.append("⚠️ **System:** Using fallback estimate.")
        else:
            # Log Bayesian update if we had a prior
            if prior_probability is not None:
                new_prob = final_json.get("probability", 50)
                delta = new_prob - prior_probability
                if abs(delta) >= 5:
                    logs.append(f"📈 **Bayesian Update:** {prior_probability:.0f}% → {new_prob:.0f}% (Δ {delta:+.0f}%)")
                else:
                    logs.append(f"📊 **Thesis Stable:** {new_prob:.0f}% (Δ {delta:+.0f}%)")
            
            logs.append("✅ **R1:** Research Complete.")

        return Data(data={
            "research_summary": final_json.get("reasoning", ""),
            "model_confidence": float(final_json.get("probability", 50)),
            "factor_data": final_json.get("factors", []),
            "delta_summary": final_json.get("delta_summary", ""),
            "citations": all_citations[:10],  # Top 10 citations
            "logs": logs
        })
    
    def _repair_json(self, json_str: str) -> str:
        """Attempt to repair common JSON formatting issues from LLM output."""
        # Remove any text before first { and after last }
        start = json_str.find("{")
        end = json_str.rfind("}")
        if start != -1 and end != -1:
            json_str = json_str[start:end+1]
        
        # Fix common issues:
        # 1. Remove trailing commas before } or ]
        json_str = re.sub(r',\s*}', '}', json_str)
        json_str = re.sub(r',\s*]', ']', json_str)
        
        # 2. Add missing commas between elements
        json_str = re.sub(r'}\s*"', '}, "', json_str)
        json_str = re.sub(r']\s*"', '], "', json_str)
        json_str = re.sub(r'"\s*{', '", {', json_str)
        json_str = re.sub(r'"\s*\[', '", [', json_str)
        
        # 3. Fix missing commas between string values
        json_str = re.sub(r'"\s+(?=")', '", ', json_str)
        
        # 4. Fix newlines inside strings
        json_str = json_str.replace('\n', '\\n')
        
        return json_str
