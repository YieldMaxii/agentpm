from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import requests
import re

class DeepResearcher(Component):
    display_name = "Deep Researcher (Sonar)"
    description = "Research node using the 'sonar' model."

    inputs = [
        DataInput(name="market_context", display_name="Market Data (from Scout)"),
    ]

    outputs = [
        Output(display_name="Research Dossier", name="dossier", method="run_research"),
    ]

    def run_research(self) -> Data:
        # 1. Validate Input
        if not self.market_context or "error" in self.market_context.data:
            return Data(data={"error": "Waiting for valid Scout data...", "model_confidence": 50})

        event_question = self.market_context.data.get("event")
        current_odds = self.market_context.data.get("market_implied_prob")

        # 2. Build Query (Dynamic)
        # We keep your logic here so it researches the actual market, not just generic AI news
        query = f"Analyze this prediction market: '{event_question}'. Current odds: {current_odds}%. based on news, give a probability estimate (0-100%)."

        # 3. Call Perplexity (Using 'sonar' model)
        import os
        from dotenv import load_dotenv
        load_dotenv()
        HARDCODED_KEY = os.getenv("PERPLEXITY_API_KEY")
        
        ai_score = 50
        summary = "Research failed."
        
        try:
            url = "https://api.perplexity.ai/chat/completions"
            
            # UPDATED PAYLOAD FOR SONAR
            payload = {
                "model": "sonar",
                "messages": [
                    {"role": "user", "content": query}
                ]
            }
            
            headers = {
                "Authorization": f"Bearer {HARDCODED_KEY}",
                "Content-Type": "application/json"
            }
            
            res = requests.post(url, json=payload, headers=headers)
            
            if res.status_code == 200:
                content = res.json()["choices"][0]["message"]["content"]
                summary = content
                # Extract number
                nums = re.findall(r"(\d+)%", content)
                if nums: ai_score = float(nums[-1])
            else:
                summary = f"API Error {res.status_code}: {res.text}"

        except Exception as e:
            summary = f"API Connection Error: {str(e)}"

        # 4. Output Data Object (Red Dot)
        return Data(data={
            "research_summary": summary,
            "model_confidence": ai_score
        })