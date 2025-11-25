from langflow.custom import Component
from langflow.io import MessageInput, Output
from langflow.schema import Data, Message
import aiohttp
import json
import os
from dotenv import load_dotenv
from pathlib import Path


class SmartRouter(Component):
    display_name = "Smart Router (Async)"
    description = "Classifies query intent to route traffic efficiently. SIMPLE queries go to quick answer, COMPLEX queries go to deep research."

    inputs = [
        MessageInput(name="user_input", display_name="User Query"),
    ]

    outputs = [
        Output(display_name="Deep Research Path", name="deep_path", method="route_deep"),
        Output(display_name="Quick Answer Path", name="quick_path", method="route_quick"),
    ]

    async def _classify_query(self) -> dict:
        """Use Qwen to classify query as SIMPLE or COMPLEX."""
        query = self.user_input.text if hasattr(self.user_input, 'text') else str(self.user_input)
        
        # Load API Key
        env_path = Path(__file__).parent.parent / '.env'
        load_dotenv(dotenv_path=env_path)
        CHUTES_KEY = os.getenv("CHUTES_API_KEY")
        
        if not CHUTES_KEY:
            # Default to COMPLEX if no key (safety)
            return {"type": "COMPLEX", "reason": "No API key available"}
        
        url = "https://llm.chutes.ai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {CHUTES_KEY}",
            "Content-Type": "application/json"
        }
        
        # Strict classification prompt
        prompt = (
            f"CLASSIFY this query: '{query}'\n\n"
            f"SIMPLE - Use for:\n"
            f"- General knowledge questions (What is X?)\n"
            f"- Current facts/prices (What is BTC price?)\n"
            f"- Simple lookups (When is the Super Bowl?)\n"
            f"- Greetings or basic questions\n\n"
            f"COMPLEX - Use for:\n"
            f"- Prediction markets (Will X happen?)\n"
            f"- Market analysis (What are the odds of...)\n"
            f"- Multi-step reasoning required\n"
            f"- Probability assessments\n"
            f"- Trading/investment decisions\n\n"
            f"RETURN JSON ONLY: {{\"type\": \"SIMPLE\" or \"COMPLEX\", \"reason\": \"brief explanation\"}}"
        )
        
        body = {
            "model": "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
            "max_tokens": 150,
            "temperature": 0.1
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
                        
                        # Clean and parse response
                        clean_content = full_content.strip()
                        # Remove markdown code blocks if present
                        clean_content = clean_content.replace("```json", "").replace("```", "").strip()
                        # Remove think tags if present
                        if "</think>" in clean_content:
                            clean_content = clean_content.split("</think>", 1)[-1].strip()
                        
                        # Extract JSON
                        start = clean_content.find("{")
                        end = clean_content.rfind("}")
                        if start != -1 and end != -1:
                            json_str = clean_content[start:end+1]
                            return json.loads(json_str)
                    
        except Exception as e:
            pass
        
        # Default to COMPLEX if classification fails (safety - don't miss important queries)
        return {"type": "COMPLEX", "reason": "Classification failed, defaulting to deep research"}

    async def route_deep(self) -> Data:
        """Route to deep research pipeline for COMPLEX queries."""
        decision = await self._classify_query()
        
        if decision.get("type") == "COMPLEX":
            query = self.user_input.text if hasattr(self.user_input, 'text') else str(self.user_input)
            return Data(data={
                "original_query": query,
                "router_decision": "COMPLEX",
                "router_reason": decision.get("reason", ""),
                "logs": [f"🔀 **Router:** COMPLEX query detected - routing to deep research. Reason: {decision.get('reason', '')}"]
            })
        return None

    async def route_quick(self) -> Data:
        """Route to quick answer for SIMPLE queries."""
        decision = await self._classify_query()
        
        if decision.get("type") == "SIMPLE":
            query = self.user_input.text if hasattr(self.user_input, 'text') else str(self.user_input)
            return Data(data={
                "original_query": query,
                "router_decision": "SIMPLE",
                "router_reason": decision.get("reason", ""),
                "logs": [f"🔀 **Router:** SIMPLE query detected - routing to quick answer. Reason: {decision.get('reason', '')}"]
            })
        return None

