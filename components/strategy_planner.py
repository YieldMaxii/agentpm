from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import http.client
import json
import re

class StrategyPlanner(Component):
    display_name = "Strategy Planner (Outcome Definer)"
    description = "Defines strict Success Conditions to prevent logic inversion."

    inputs = [
        DataInput(name="market_context", display_name="Market Data"),
    ]

    outputs = [
        Output(display_name="Research Plan", name="plan_data", method="generate_plan"),
    ]

    def generate_plan(self) -> Data:
        if not self.market_context: 
            return Data(data={
                "market_data": {},
                "research_plan": {"domain": "Unknown", "success_condition": "Unknown", "factors": []},
                "logs": ["⚠️ No market context provided"],
                "original_query": ""
            })
        
        logs = self.market_context.data.get("logs", [])
        event = self.market_context.data.get("event")
        slug = self.market_context.data.get("slug")
        user_query = self.market_context.data.get("original_query", "")
        
        is_unknown = not event or not slug or event == "Unknown Event" or slug == "unknown"
        
        target_description = f"TARGET EVENT: '{event}' (Slug: {slug})"
        if is_unknown:
            logs.append("⚠️ **Planner:** No specific market found. Planning for User Query directly.")
            target_description = f"TARGET QUESTION: '{user_query}' (No Market Found)"

        query = (
            f"You are a Research Architect.\n"
            f"{target_description}\n\n"
            f"Define the success condition and key factors.\n"
            f"Output ONLY JSON:\n"
            f"{{\n"
            f"  \"domain\": \"Finance\",\n"
            f"  \"success_condition\": \"The Fed cuts rates in December 2025.\",\n"
            f"  \"factors\": [{{\"name\": \"Inflation\", \"question\": \"What is the inflation trend?\"}}]\n"
            f"}}"
        )

        plan_json = {"domain": "General", "success_condition": "Unknown", "factors": [{"name": "General", "question": "Analyze market."}]}

        try:
            import requests
            import os
            from dotenv import load_dotenv
            from pathlib import Path
            env_path = Path(__file__).parent.parent / '.env'
            load_dotenv(dotenv_path=env_path)
            
            CHUTES_KEY = os.getenv("CHUTES_API_KEY")
            if not CHUTES_KEY:
                logs.append("❌ **Planner Error:** CHUTES_API_KEY not set.")
                return Data(data={"logs": logs})

            url = "https://llm.chutes.ai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {CHUTES_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "deepseek-ai/DeepSeek-R1-0528",
                "messages": [{"role": "user", "content": query}],
                "max_tokens": 8192,
                "temperature": 0.3,
                "stream": False
            }
            
            response = requests.post(url, headers=headers, json=payload, timeout=300)
            
            if response.status_code == 200:
                content = response.json()["choices"][0]["message"]["content"]
                
                # Extract answer from DeepSeek R1 format
                clean = ""
                thoughts = None
                
                if "</think>" in content:
                    parts = content.split("</think>", 1)
                    if len(parts) == 2:
                        thought_part = parts[0]
                        if "<think>" in thought_part:
                            thoughts = thought_part.split("<think>", 1)[1].strip()
                        clean = parts[1].strip()
                elif "<think>" in content:
                    thoughts = content.replace("<think>", "").strip()
                    clean = ""
                else:
                    clean = content.strip()
                
                if thoughts:
                    logs.append(f"💭 **Planner Thought:** {thoughts[:150]}...")

                clean = clean.replace("```json", "").replace("```", "").strip()

                # Extract JSON
                try:
                    if clean:
                        json_match = re.search(r"\{.*\}", clean, re.DOTALL)
                        if json_match:
                            plan_json = json.loads(json_match.group(0))
                except json.JSONDecodeError as e:
                    logs.append(f"⚠️ **Planner:** JSON Error: {str(e)[:50]}")

                success_cond = plan_json.get("success_condition", "Undefined")
                logs.append(f"🧠 **Planner (DeepSeek):** Success Condition Defined: `{success_cond}`")
            else:
                logs.append(f"❌ **Planner Error:** API {response.status_code}")

        except Exception as e:
            logs.append(f"❌ **Planner Error:** {str(e)}")

        return Data(data={
            "market_data": self.market_context.data,
            "research_plan": plan_json,
            "logs": logs,
            "original_query": user_query
        })
