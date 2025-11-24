from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import http.client
import json
import time

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
        if not self.plan_input: return Data(data={})
        
        # --- 1. UNPACK DATA ---
        input_data = self.plan_input.data
        logs = input_data.get("logs", [])
        
        import datetime
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
        success_cond = plan.get("success_condition", f"The event '{event}' happens.")
        
        # --- SETUP API KEYS ---
        import os
        import requests
        from dotenv import load_dotenv
        load_dotenv()
        
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
                res = requests.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    return res.json()["choices"][0]["message"]["content"]
                return f"Error {res.status_code}: {res.text}"
            except Exception as e: return f"Exception: {str(e)}"

        # --- HELPER: DEEPSEEK BRAIN ---
        def ask_deepseek(context_history):
            try:
                url = "https://llm.chutes.ai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {CHUTES_KEY}",
                    "Content-Type": "application/json"
                }
                
                system_prompt = (
                    f"You are a Senior Research Analyst. Your goal is to determine the probability of: '{success_cond}'.\\n"
                    f"You have access to a SEARCH tool via Perplexity. Use it to gather current facts and news.\\n\\n"
                    f"PROTOCOL:\\n"
                    f"1. If you need information, output EXACTLY: SEARCH: <your specific query>\\n"
                    f"2. After receiving search results, you can request more searches or finish.\\n"
                    f"3. When ready to conclude, output EXACTLY: FINISH: followed by valid JSON.\\n"
                    f"   JSON must be: {{ \\\"probability\\\": <0-100>, \\\"reasoning\\\": \\\"...\\\", \\\"factors\\\": [{{\\\"name\\\":\\\"X\\\",\\\"weight\\\":10,\\\"score\\\":5,\\\"impact\\\":\\\"+10%\\\"}}] }}\\n\\n"
                    f"EXAMPLES:\\n"
                    f"- To search: SEARCH: GTA 6 release date official announcement\\n"
                    f"- To finish: FINISH: {{\\\"probability\\\": 35, \\\"reasoning\\\": \\\"...\\\", \\\"factors\\\": [...]}}\\n\\n"
                    f"START NOW. First, request a search for current information about this event."
                )
                
                messages = [{"role": "system", "content": system_prompt}] + context_history
                
                payload = {
                    "model": "deepseek-ai/DeepSeek-R1-0528",
                    "messages": messages,
                    "max_tokens": 1024,
                    "temperature": 0.5,
                    "stream": False
                }
                
                res = requests.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    content = res.json()["choices"][0]["message"]["content"]
                    # Clean DeepSeek output
                    import re
                    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
                    return content
                return "Error"
            except Exception as e: return f"Error: {str(e)}"

        # --- MAIN LOOP ---
        context = []
        # Initial context
        context.append({"role": "user", "content": f"Start research. Event: {event}. User Query: {user_query}. Plan Factors: {json.dumps(plan.get('factors', []))}"})
        
        final_json = None
        max_iterations = 3
        
        for i in range(max_iterations):
            logs.append(f"🧠 **DeepSeek (Iter {i+1}/{max_iterations}):** Thinking...")
            response = ask_deepseek(context)
            
            # Parse Response
            if response.startswith("SEARCH:"):
                query = response.replace("SEARCH:", "").strip()
                logs.append(f"🔎 **DeepSeek Requests:** *'{query}'*")
                
                # Execute Tool
                search_result = search_perplexity(query)
                logs.append(f"&nbsp;&nbsp;&nbsp;&nbsp;✅ **Perplexity:** Found data.")
                
                # Feed back to Brain
                context.append({"role": "assistant", "content": response})
                context.append({"role": "user", "content": f"SEARCH RESULT: {search_result}"})
                
            elif "FINISH:" in response or "{" in response:
                # Try to extract JSON
                try:
                    json_str = response[response.find("{"):response.rfind("}")+1]
                    final_json = json.loads(json_str)
                    logs.append("✅ **DeepSeek:** Research Complete.")
                    break
                except:
                    logs.append("⚠️ **DeepSeek:** Malformed JSON. Retrying...")
                    context.append({"role": "assistant", "content": response})
                    context.append({"role": "user", "content": "Output valid JSON only for FINISH."})
            else:
                # Ambiguous response, treat as thought
                logs.append(f"🤔 **DeepSeek:** {response[:100]}...")
                context.append({"role": "assistant", "content": response})

        # Fallback if loop ends without JSON
        if not final_json:
            final_json = {"probability": 50, "reasoning": "Research inconclusive or loop limit reached.", "factors": []}
            logs.append("⚠️ **System:** Loop limit reached. Using fallback.")

        return Data(data={
            "research_summary": final_json.get("reasoning", ""),
            "model_confidence": float(final_json.get("probability", 50)),
            "factor_data": final_json.get("factors", []),
            "logs": logs
        })