from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import http.client
import json

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
        if not self.market_context: return Data(data={})
        
        logs = self.market_context.data.get("logs", [])
        event = self.market_context.data.get("event")
        slug = self.market_context.data.get("slug")
        user_query = self.market_context.data.get("original_query", "")
        
        # CRITICAL FIX: We pass the slug to help the AI understand the market's specific phrasing
        query = (
            f"You are a Senior Research Architect. \n"
            f"TARGET EVENT: '{event}' (Slug: {slug})\n\n"
            f"TASK: Analyze the request and identify the Domain and 5-7 Key Factors that drive the outcome.\n"
            f"   - Ensure you cover ALL dimensions: Fundamental, Technical, Sentiment, and Macro.\n"
            f"1. **DEFINE SUCCESS:** What EXACTLY must happen for the outcome to be 'YES'?\n"
            f"2. **IDENTIFY FACTORS:** What specific variables drive this outcome in this domain?\n"
            f"   - *Sports:* Injuries, Momentum, Schedule, Coaching, Weather, Historical Matchups.\n"
            f"   - *Politics:* Polling, Demographics, Fundraising, Scandals, Economic Indicators.\n"
            f"   - *Finance:* Earnings, Interest Rates, Competitor Moats, Regulatory Risk, Macro Trends.\n"
            f"3. **RETURN JSON:** {{ \n"
            f"      \"domain\": \"Sports - NFL\", \n"
            f"      \"success_condition\": \"The Philadelphia Eagles must win Super Bowl LX on Feb 8, 2026.\", \n"
            f"      \"factors\": [\n"
            f"          {{\"name\": \"Quarterback Health\", \"question\": \"Is Jalen Hurts healthy and performing well?\"}},\n"
            f"          {{\"name\": \"Team Momentum\", \"question\": \"What is the Eagles' win/loss trend in the last 5 games?\"}}\n"
            f"      ]\n"
            f"   }}\n"
            f"Output JSON ONLY."
        )

        plan_json = {"domain": "General", "success_condition": "Unknown", "factors": [{"name": "General", "question": "Analyze market."}]}

        try:
            import requests
            import os
            from dotenv import load_dotenv
            from pathlib import Path
            # Load .env from project root
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
                "max_tokens": 1024,
                "temperature": 0.7,
                "stream": False
            }
            
            response = requests.post(url, headers=headers, json=payload)
            
            if response.status_code == 200:
                content = response.json()["choices"][0]["message"]["content"]
                # DeepSeek might include <think> tags or markdown, clean it
                clean = content.replace("```json", "").replace("```", "").strip()
                # Remove potential <think>...</think> blocks if present (DeepSeek R1 feature)
                import re
                clean = re.sub(r"<think>.*?</think>", "", clean, flags=re.DOTALL).strip()
                
                plan_json = json.loads(clean)
                
                success_cond = plan_json.get("success_condition", "Undefined")
                logs.append(f"🧠 **Planner (DeepSeek):** Success Condition Defined: `{success_cond}`")
            else:
                logs.append(f"❌ **Planner Error:** API {response.status_code} - {response.text}")

        except Exception as e:
            logs.append(f"❌ **Planner Error:** {str(e)}")

        return Data(data={
            "market_data": self.market_context.data,
            "research_plan": plan_json,
            "logs": logs,
            "original_query": user_query
        })