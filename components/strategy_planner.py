from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import aiohttp
import json
import re
import os
from dotenv import load_dotenv
from pathlib import Path


class StrategyPlanner(Component):
    display_name = "Strategy Planner (Outcome Definer)"
    description = "Defines strict Success Conditions using zero-shot prompts. DeepSeek R1 knows how to think - we just tell it what we want."

    inputs = [
        DataInput(name="market_context", display_name="Market Data"),
    ]

    outputs = [
        Output(display_name="Research Plan", name="plan_data", method="generate_plan"),
    ]

    async def generate_plan(self) -> Data:
        if not self.market_context: 
            return Data(data={
                "market_data": {},
                "research_plan": {"domain": "Unknown", "success_condition": "Unknown", "factors": []},
                "logs": ["⚠️ No market context provided"],
                "original_query": "",
                "history_context": ""
            })
        
        logs = self.market_context.data.get("logs", [])
        event = self.market_context.data.get("event")
        slug = self.market_context.data.get("slug")
        user_query = self.market_context.data.get("original_query", "")
        history_context = self.market_context.data.get("history_context", "")
        
        is_unknown = not event or not slug or event == "Unknown Event" or slug == "unknown"
        
        target_description = f"EVENT: '{event}'"
        if is_unknown:
            logs.append("⚠️ **Planner:** No specific market found. Planning for User Query directly.")
            target_description = f"QUESTION: '{user_query}'"

        # ZERO-SHOT PROMPT: Tell R1 WHAT we want, not HOW to think
        # R1 is already a reasoning model - it knows how to think
        query = f"""{target_description}

OUTPUT JSON:
{{
  "domain": "<Finance|Politics|Sports|Tech|Other>",
  "success_condition": "<Precise testable outcome>",
  "factors": [{{"name": "<Factor>", "question": "<Research question>"}}]
}}"""

        plan_json = {"domain": "General", "success_condition": "Unknown", "factors": [{"name": "General", "question": "Analyze market."}]}

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
        body = {
            "model": "deepseek-ai/DeepSeek-R1-0528",
            "messages": [{"role": "user", "content": query}],
            "stream": True,
            "max_tokens": 1024,
            "temperature": 0.2
        }
        
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
                                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                                    content = delta.get("content", "")
                                    full_content += content
                                except json.JSONDecodeError:
                                    continue
                        
                        # Extract answer from R1 format
                        clean = full_content.strip()
                        
                        if "</think>" in clean:
                            parts = clean.split("</think>", 1)
                            if len(parts) == 2:
                                thought_part = parts[0]
                                if "<think>" in thought_part:
                                    thoughts = thought_part.split("<think>", 1)[1].strip()
                                    logs.append(f"💭 **Planner Thought:** {thoughts[:100]}...")
                                clean = parts[1].strip()
                        
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
                        logs.append(f"🧠 **Planner (R1):** Success Condition: `{success_cond}`")
                    else:
                        logs.append(f"❌ **Planner Error:** API {response.status}")

        except Exception as e:
            logs.append(f"❌ **Planner Error:** {str(e)}")

        return Data(data={
            "market_data": self.market_context.data,
            "research_plan": plan_json,
            "logs": logs,
            "original_query": user_query,
            "history_context": history_context
        })
