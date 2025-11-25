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


class RecursiveResearcher(Component):
    display_name = "Recursive Researcher (Bayesian Brain)"
    description = "DeepSeek R1 with Bayesian updating. Compares new evidence against prior thesis."

    inputs = [
        DataInput(name="plan_input", display_name="Research Plan"),
    ]

    outputs = [
        Output(display_name="Deep Dossier", name="dossier", method="execute_research"),
    ]

    async def execute_research(self) -> Data:
        if not self.plan_input: 
            return Data(data={
                "research_summary": "No input provided",
                "model_confidence": 50.0,
                "factor_data": [],
                "logs": ["⚠️ No plan input provided"]
            })
        
        # --- 1. UNPACK DATA ---
        input_data = self.plan_input.data
        logs = input_data.get("logs", []).copy()
        
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        
        if "market_data" in input_data:
            market_data = input_data.get("market_data", {})
            plan = input_data.get("research_plan", {})
            logs.append(f"🕒 **{timestamp}** - Researcher (Bayesian) Started for: '{market_data.get('event', 'Unknown')}'")
        else:
            market_data = input_data
            plan = {"domain": "General", "questions": ["Analyze the market."]}
        
        event = market_data.get("event", "Unknown Event")
        user_query = input_data.get("original_query", "")
        history_context = input_data.get("history_context", "No previous analysis found.")
        prior_probability = market_data.get("prior_probability")
        
        # Fallback logic: If event is unknown, research the user query directly
        if event == "Unknown Event" or not event:
            research_subject = user_query
            success_cond = f"the outcome of '{user_query}'"
            logs.append(f"⚠️ **Researcher:** Event unknown. Researching user query directly.")
        else:
            research_subject = event
            success_cond = plan.get("success_condition", f"The event '{event}' happens.")
        
        # --- SETUP API KEYS ---
        env_path = Path(__file__).parent.parent / '.env'
        load_dotenv(dotenv_path=env_path)
        
        CHUTES_KEY = os.getenv("CHUTES_API_KEY")
        PERPLEXITY_KEY = os.getenv("PERPLEXITY_API_KEY")
        
        if not CHUTES_KEY or not PERPLEXITY_KEY:
            logs.append("❌ **Error:** Missing API Keys (CHUTES or PERPLEXITY).")
            return Data(data={"logs": logs})

        # --- HELPER: PERPLEXITY TOOL (Async) ---
        async def search_perplexity(query_text):
            try:
                url = "https://api.perplexity.ai/chat/completions"
                headers = {
                    "Authorization": f"Bearer {PERPLEXITY_KEY}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "sonar",
                    "messages": [{"role": "user", "content": query_text}]
                }
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as response:
                        if response.status == 200:
                            result = await response.json()
                            return result["choices"][0]["message"]["content"]
                        else:
                            error_text = await response.text()
                            return f"Error {response.status}: {error_text[:200]}"
            except Exception as e:
                return f"Exception: {str(e)}"

        # --- HELPER: DEEPSEEK BRAIN (Async with Streaming) ---
        async def ask_deepseek(context_history, force_finish=False):
            try:
                url = "https://llm.chutes.ai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {CHUTES_KEY}",
                    "Content-Type": "application/json"
                }
                
                # ZERO-SHOT + BAYESIAN PROMPT
                if force_finish:
                    system_prompt = f"""TASK: Final Bayesian assessment for '{success_cond}'.

{history_context}

OUTPUT JSON:
{{"probability": 0-100, "reasoning": "<3-5 paragraph analysis with delta explanation>", "factors": [{{"name": "X", "weight": 30, "score": 7, "impact": "+10%"}}], "delta_summary": "<What changed from prior>"}}"""
                else:
                    system_prompt = f"""ROLE: Senior Quant Analyst
EVENT: '{success_cond}'

{history_context}

COMMANDS:
- SEARCH: <query> - Get current data
- FINISH: {{json}} - Final assessment

OUTPUT JSON on FINISH:
{{"probability": 0-100, "reasoning": "<analysis>", "factors": [{{...}}], "delta_summary": "<what changed>"}}"""
                
                messages = [{"role": "system", "content": system_prompt}] + context_history
                
                body = {
                    "model": "deepseek-ai/DeepSeek-R1-0528",
                    "messages": messages,
                    "stream": True,
                    "max_tokens": 4096,
                    "temperature": 0.3
                }
                
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, headers=headers, json=body, timeout=aiohttp.ClientTimeout(total=300)) as response:
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
                                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                                        content = delta.get("content", "")
                                        full_content += content
                                    except json.JSONDecodeError:
                                        continue
                            
                            # Extract answer from R1 format
                            raw_content = full_content
                            thought_text = None
                            clean_content = ""
                            
                            if "</think>" in raw_content:
                                parts = raw_content.split("</think>", 1)
                                if len(parts) == 2:
                                    thought_part = parts[0]
                                    if "<think>" in thought_part:
                                        thought_text = thought_part.split("<think>", 1)[1].strip()
                                    clean_content = parts[1].strip()
                            elif "<think>" in raw_content:
                                thought_text = raw_content.replace("<think>", "").strip()
                                clean_content = ""
                            else:
                                clean_content = raw_content.strip()
                            
                            clean_content = clean_content.replace("```json", "").replace("```", "").strip()
                            return clean_content, raw_content, thought_text
                        else:
                            return f"Error {response.status}", f"Error {response.status}", None
                            
            except Exception as e: 
                return f"Error: {str(e)}", f"Error: {str(e)}", None

        # --- MAIN LOOP ---
        context = []
        search_results_collected = []
        
        # Initial context with Bayesian framing
        initial_prompt = f"""Research topic: {research_subject}
User question: {user_query}

Start by searching for CURRENT data to compare against the prior thesis."""
        
        context.append({"role": "user", "content": initial_prompt})
        
        final_json = None
        max_iterations = 5
        empty_response_count = 0
        
        for i in range(max_iterations):
            logs.append(f"🧠 **R1 (Iter {i+1}/{max_iterations}):** Analyzing...")
            
            force_finish = empty_response_count >= 2
            clean_response, raw_response, thoughts = await ask_deepseek(context, force_finish=force_finish)
            
            if thoughts:
                short_thought = thoughts[:150] + "..." if len(thoughts) > 150 else thoughts
                logs.append(f"💭 **R1 Thought:** {short_thought}")
            
            if not clean_response:
                empty_response_count += 1
                logs.append(f"⚠️ **R1:** Empty response. Attempt {empty_response_count}/2...")
                context.append({"role": "assistant", "content": raw_response})
                context.append({"role": "user", "content": "Output SEARCH: <query> or FINISH: {json}"})
                continue

            empty_response_count = 0

            if "SEARCH:" in clean_response:
                search_match = re.search(r"SEARCH:\s*(.+?)(?:\n|$)", clean_response, re.IGNORECASE)
                if search_match:
                    query = search_match.group(1).strip()
                else:
                    query = clean_response.replace("SEARCH:", "").strip().split("\n")[0]
                
                query = query.strip('"\'')
                logs.append(f"🔎 **R1 Requests:** *'{query[:80]}'*")
                
                search_result = await search_perplexity(query)
                search_results_collected.append({"query": query, "result": search_result[:1000]})
                logs.append(f"&nbsp;&nbsp;&nbsp;&nbsp;✅ **Perplexity:** Found data.")
                
                context.append({"role": "assistant", "content": raw_response})
                context.append({"role": "user", "content": f"SEARCH RESULT:\n{search_result[:2500]}\n\nSEARCH again or FINISH with Bayesian update."})
                
            elif "FINISH:" in clean_response or "{" in clean_response:
                try:
                    json_str = clean_response
                    if "FINISH:" in clean_response:
                        json_str = clean_response.split("FINISH:", 1)[1].strip()
                    
                    start = json_str.find("{")
                    end = json_str.rfind("}")
                    if start != -1 and end != -1:
                        json_str = json_str[start:end+1]
                    
                    final_json = json.loads(json_str)
                    
                    # Log the delta if we had a prior
                    if prior_probability is not None:
                        new_prob = final_json.get("probability", 50)
                        delta = new_prob - prior_probability
                        if abs(delta) >= 5:
                            logs.append(f"📈 **Bayesian Update:** {prior_probability:.0f}% → {new_prob:.0f}% (Δ {delta:+.0f}%)")
                        else:
                            logs.append(f"📊 **Bayesian Update:** Thesis stable at {new_prob:.0f}% (Δ {delta:+.0f}%)")
                    
                    logs.append("✅ **R1:** Research Complete.")
                    break
                except Exception as e:
                    logs.append(f"⚠️ **R1:** JSON Error. Retrying...")
                    context.append({"role": "assistant", "content": raw_response})
                    context.append({"role": "user", "content": "Invalid JSON. Provide FINISH: with valid JSON."})
            else:
                logs.append(f"🤔 **R1:** {clean_response[:80]}...")
                context.append({"role": "assistant", "content": raw_response})
                context.append({"role": "user", "content": "Respond with SEARCH: <query> or FINISH: {json}"})

        # Fallback with collected data
        if not final_json:
            logs.append("⚠️ **System:** Forcing final Bayesian conclusion...")
            
            search_summary = "\n\n".join([f"Q: {s['query']}\nA: {s['result']}" for s in search_results_collected])
            
            force_context = [
                {"role": "user", "content": f"Topic: {research_subject}\nQuestion: {user_query}\n\nResearch:\n{search_summary}\n\nProvide FINAL Bayesian assessment."}
            ]
            
            clean_response, raw_response, thoughts = await ask_deepseek(force_context, force_finish=True)
            
            if clean_response and "{" in clean_response:
                try:
                    start = clean_response.find("{")
                    end = clean_response.rfind("}")
                    if start != -1 and end != -1:
                        final_json = json.loads(clean_response[start:end+1])
                        logs.append("✅ **R1:** Forced conclusion successful.")
                except:
                    pass
            
            if not final_json:
                fallback_reasoning = "Research conducted but model failed to produce structured conclusion. "
                if search_results_collected:
                    fallback_reasoning += f"Data gathered from {len(search_results_collected)} search(es). "
                    fallback_reasoning += "Please retry for detailed analysis."
                
                final_json = {
                    "probability": prior_probability if prior_probability else 50, 
                    "reasoning": fallback_reasoning, 
                    "factors": [],
                    "delta_summary": "Unable to compute delta - fallback estimate"
                }
                logs.append("⚠️ **System:** Using fallback estimate.")

        return Data(data={
            "research_summary": final_json.get("reasoning", ""),
            "model_confidence": float(final_json.get("probability", 50)),
            "factor_data": final_json.get("factors", []),
            "delta_summary": final_json.get("delta_summary", ""),
            "logs": logs
        })
