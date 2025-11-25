from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import http.client
import json
import time
import re
import requests
import os
from dotenv import load_dotenv
from pathlib import Path
import datetime

class RecursiveResearcher(Component):
    display_name = "Recursive Researcher (DeepSeek Brain)"
    description = "DeepSeek R1 directs research, using Perplexity as a search tool."

    inputs = [
        DataInput(name="plan_input", display_name="Research Plan"),
    ]

    outputs = [
        Output(display_name="Deep Dossier", name="dossier", method="execute_research"),
    ]

    def execute_research(self) -> Data:
        if not self.plan_input: 
            return Data(data={
                "research_summary": "No input provided",
                "model_confidence": 50.0,
                "factor_data": [],
                "logs": ["⚠️ No plan input provided"]
            })
        
        # --- 1. UNPACK DATA ---
        input_data = self.plan_input.data
        logs = input_data.get("logs", [])
        
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        
        if "market_data" in input_data:
            market_data = input_data.get("market_data", {})
            plan = input_data.get("research_plan", {})
            logs.append(f"🕒 **{timestamp}** - Researcher (DeepSeek) Started for: '{market_data.get('event', 'Unknown')}'")
        else:
            market_data = input_data
            plan = {"domain": "General", "questions": ["Analyze the market."]}
        
        event = market_data.get("event", "Unknown Event")
        user_query = input_data.get("original_query", "")
        
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

        # --- HELPER: PERPLEXITY TOOL ---
        def search_perplexity(query_text):
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
                res = requests.post(url, headers=headers, json=payload, timeout=30)
                if res.status_code == 200:
                    return res.json()["choices"][0]["message"]["content"]
                return f"Error {res.status_code}: {res.text}"
            except Exception as e: return f"Exception: {str(e)}"

        # --- HELPER: EXTRACT ANSWER FROM DEEPSEEK R1 ---
        def extract_answer(raw_content):
            if not raw_content:
                return "", None
            
            thought_text = None
            clean_content = ""
            
            if "</think>" in raw_content:
                parts = raw_content.split("</think>", 1)
                if len(parts) == 2:
                    thought_part = parts[0]
                    if "<think>" in thought_part:
                        thought_text = thought_part.split("<think>", 1)[1].strip()
                    else:
                        thought_text = thought_part.strip()
                    clean_content = parts[1].strip()
            elif "<think>" in raw_content:
                thought_text = raw_content.replace("<think>", "").strip()
                clean_content = ""
            else:
                clean_content = raw_content.strip()
            
            clean_content = clean_content.replace("```json", "").replace("```", "").strip()
            return clean_content, thought_text

        # --- HELPER: DEEPSEEK BRAIN ---
        def ask_deepseek(context_history, force_finish=False):
            try:
                url = "https://llm.chutes.ai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {CHUTES_KEY}",
                    "Content-Type": "application/json"
                }
                
                if force_finish:
                    system_prompt = (
                        f"Based on ALL the research gathered, provide a COMPREHENSIVE final assessment.\n\n"
                        f"OUTPUT valid JSON with:\n"
                        f"- probability: 0-100 (your confidence in the outcome)\n"
                        f"- reasoning: A DETAILED 3-5 paragraph analysis covering:\n"
                        f"  * Current market expectations and data sources\n"
                        f"  * Key factors supporting the outcome\n"
                        f"  * Key risks and counterarguments\n"
                        f"  * Your overall assessment and confidence level\n"
                        f"- factors: Array of key factors with name, weight (1-100), score (1-10), impact (+X% or -X%)\n\n"
                        f"Example:\n"
                        f'{{"probability": 67, "reasoning": "Based on CME FedWatch data showing 67% implied probability... [detailed analysis]", "factors": [{{"name": "Fed Guidance", "weight": 30, "score": 7, "impact": "+15%"}}]}}'
                    )
                else:
                    system_prompt = (
                        f"You are a Senior Research Analyst tasked with determining the probability of: '{success_cond}'.\n\n"
                        f"You have access to a SEARCH tool. Use it to gather comprehensive data.\n\n"
                        f"COMMANDS:\n"
                        f"- SEARCH: <specific query> - Search for information (be specific!)\n"
                        f"- FINISH: <json> - When you have enough data, provide your final analysis\n\n"
                        f"For FINISH, provide detailed JSON:\n"
                        f'{{"probability": 0-100, "reasoning": "DETAILED multi-paragraph analysis...", "factors": [{{"name": "X", "weight": 30, "score": 7, "impact": "+10%"}}]}}\n\n'
                        f"The reasoning should be 3-5 paragraphs covering: data sources, supporting factors, risks, and your overall assessment.\n\n"
                        f"Start by searching for relevant current data."
                    )
                
                messages = [{"role": "system", "content": system_prompt}] + context_history
                
                payload = {
                    "model": "deepseek-ai/DeepSeek-R1-0528",
                    "messages": messages,
                    "max_tokens": 8192,
                    "temperature": 0.4,
                    "stream": False
                }
                
                res = requests.post(url, headers=headers, json=payload, timeout=300)
                if res.status_code == 200:
                    raw_content = res.json()["choices"][0]["message"]["content"]
                    clean_content, thought_text = extract_answer(raw_content)
                    return clean_content, raw_content, thought_text
                else:
                    return f"Error {res.status_code}", f"Error {res.status_code}", None
                    
            except Exception as e: 
                return f"Error: {str(e)}", f"Error: {str(e)}", None

        # --- MAIN LOOP ---
        context = []
        search_results_collected = []
        
        # Initial context
        context.append({"role": "user", "content": f"Research topic: {research_subject}\nUser question: {user_query}\n\nStart by searching for current data on this topic."})
        
        final_json = None
        max_iterations = 5
        empty_response_count = 0
        
        for i in range(max_iterations):
            logs.append(f"🧠 **DeepSeek (Iter {i+1}/{max_iterations}):** Thinking...")
            
            force_finish = empty_response_count >= 2
            clean_response, raw_response, thoughts = ask_deepseek(context, force_finish=force_finish)
            
            if thoughts:
                short_thought = thoughts[:200] + "..." if len(thoughts) > 200 else thoughts
                logs.append(f"💭 **DeepSeek Thought:** {short_thought}")
            
            if not clean_response:
                empty_response_count += 1
                logs.append(f"⚠️ **DeepSeek:** Empty response. Attempt {empty_response_count}/2...")
                context.append({"role": "assistant", "content": raw_response})
                context.append({"role": "user", "content": "Please output SEARCH: <query> or FINISH: {json}"})
                continue

            empty_response_count = 0

            if "SEARCH:" in clean_response:
                search_match = re.search(r"SEARCH:\s*(.+?)(?:\n|$)", clean_response, re.IGNORECASE)
                if search_match:
                    query = search_match.group(1).strip()
                else:
                    query = clean_response.replace("SEARCH:", "").strip().split("\n")[0]
                
                # Clean up query (remove quotes if present)
                query = query.strip('"\'')
                
                logs.append(f"🔎 **DeepSeek Requests:** *'{query[:100]}'*")
                
                search_result = search_perplexity(query)
                search_results_collected.append({"query": query, "result": search_result[:1000]})
                logs.append(f"&nbsp;&nbsp;&nbsp;&nbsp;✅ **Perplexity:** Found data.")
                
                context.append({"role": "assistant", "content": raw_response})
                context.append({"role": "user", "content": f"SEARCH RESULT:\n{search_result[:3000]}\n\nYou can SEARCH again for more data, or if you have enough information, use FINISH with a DETAILED analysis."})
                
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
                    logs.append("✅ **DeepSeek:** Research Complete.")
                    break
                except Exception as e:
                    logs.append(f"⚠️ **DeepSeek:** JSON Error. Retrying...")
                    context.append({"role": "assistant", "content": raw_response})
                    context.append({"role": "user", "content": "Invalid JSON. Provide FINISH: with valid JSON including detailed reasoning."})
            else:
                logs.append(f"🤔 **DeepSeek:** {clean_response[:100]}...")
                context.append({"role": "assistant", "content": raw_response})
                context.append({"role": "user", "content": "Please respond with SEARCH: <query> or FINISH: {json}"})

        # Fallback with collected data
        if not final_json:
            logs.append("⚠️ **System:** Forcing final conclusion with collected data...")
            
            # Build context from collected searches
            search_summary = "\n\n".join([f"Query: {s['query']}\nResult: {s['result']}" for s in search_results_collected])
            
            force_context = [
                {"role": "user", "content": f"Topic: {research_subject}\nQuestion: {user_query}\n\nCollected Research:\n{search_summary}\n\nProvide your FINAL assessment now."}
            ]
            
            clean_response, raw_response, thoughts = ask_deepseek(force_context, force_finish=True)
            
            if clean_response and "{" in clean_response:
                try:
                    start = clean_response.find("{")
                    end = clean_response.rfind("}")
                    if start != -1 and end != -1:
                        final_json = json.loads(clean_response[start:end+1])
                        logs.append("✅ **DeepSeek:** Forced conclusion successful.")
                except:
                    pass
            
            if not final_json:
                # Generate a meaningful fallback based on any search results
                fallback_reasoning = "Research was conducted but the model failed to produce a structured conclusion. "
                if search_results_collected:
                    fallback_reasoning += f"Data was gathered from {len(search_results_collected)} search(es) on topics including: "
                    fallback_reasoning += ", ".join([s['query'][:50] for s in search_results_collected[:3]])
                    fallback_reasoning += ". Please retry for a more detailed analysis."
                
                final_json = {
                    "probability": 50, 
                    "reasoning": fallback_reasoning, 
                    "factors": []
                }
                logs.append("⚠️ **System:** Using fallback estimate.")

        return Data(data={
            "research_summary": final_json.get("reasoning", ""),
            "model_confidence": float(final_json.get("probability", 50)),
            "factor_data": final_json.get("factors", []),
            "logs": logs
        })
