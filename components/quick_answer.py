from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Message
import aiohttp
import json
import os
from dotenv import load_dotenv
from pathlib import Path


class QuickAnswer(Component):
    display_name = "Quick Answer (Perplexity)"
    description = "Handles SIMPLE queries with a single Perplexity call. Fast and cheap."

    inputs = [
        DataInput(name="router_data", display_name="Router Data"),
    ]

    outputs = [
        Output(display_name="Quick Response", name="response", method="get_quick_answer"),
    ]

    async def get_quick_answer(self) -> Message:
        """Get a quick answer from Perplexity for simple queries."""
        if not self.router_data:
            return Message(text="⚠️ No query provided.")
        
        query = self.router_data.data.get("original_query", "")
        logs = self.router_data.data.get("logs", [])
        
        if not query:
            return Message(text="⚠️ Empty query.")
        
        # Load API Key
        env_path = Path(__file__).parent.parent / '.env'
        load_dotenv(dotenv_path=env_path)
        PERPLEXITY_KEY = os.getenv("PERPLEXITY_API_KEY")
        
        if not PERPLEXITY_KEY:
            logs.append("❌ **QuickAnswer:** PERPLEXITY_API_KEY not set.")
            return Message(text="❌ Error: Perplexity API key not configured.")
        
        url = "https://api.perplexity.ai/chat/completions"
        headers = {
            "Authorization": f"Bearer {PERPLEXITY_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "sonar",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful assistant. Provide clear, concise, and accurate answers. If the question is about current data (prices, dates, facts), provide the most up-to-date information available."
                },
                {
                    "role": "user",
                    "content": query
                }
            ]
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload) as response:
                    if response.status == 200:
                        result = await response.json()
                        answer = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                        
                        if answer:
                            logs.append("✅ **QuickAnswer:** Retrieved answer from Perplexity.")
                            
                            # Format the response nicely
                            formatted_response = f"""# 🚀 Quick Answer

---

{answer}

---

<details>
<summary><b>ℹ️ Query Details</b></summary>

**Query:** {query}

**Route:** Quick Answer (Perplexity)

**Logs:**
{chr(10).join(logs)}

</details>

---
<sub>*AgentPM Quick Mode • Powered by Perplexity*</sub>
"""
                            return Message(text=formatted_response)
                        else:
                            logs.append("⚠️ **QuickAnswer:** Empty response from Perplexity.")
                    else:
                        error_text = await response.text()
                        logs.append(f"❌ **QuickAnswer:** API error {response.status}: {error_text[:100]}")
                        
        except Exception as e:
            logs.append(f"❌ **QuickAnswer:** Exception: {str(e)[:100]}")
        
        # Fallback error response
        return Message(text=f"⚠️ Unable to get quick answer. Error occurred while processing: '{query}'")

