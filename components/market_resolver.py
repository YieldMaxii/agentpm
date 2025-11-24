from langflow.custom import Component
from langflow.io import MessageInput, Output
from langflow.schema import Data
import http.client
import json
import re

class MarketResolver(Component):
    display_name = "Market Resolver (Scope Aware)"
    description = "Prioritizes Main Event Groups over specific side-bets."

    inputs = [
        MessageInput(name="user_query", display_name="User Question"),
    ]

    outputs = [
        Output(display_name="Slug Data", name="slug_data", method="resolve_slug"),
    ]

    def resolve_slug(self) -> Data:
        import datetime
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        query = self.user_query.text if hasattr(self.user_query, 'text') else str(self.user_query)
        logs = [f"🕒 **{timestamp}** - Resolver Input: '{query}'"]
        
        # IMPROVED PROMPT: Explicit instruction to find the "Parent" market
        prompt = (
            f"Find the BEST Polymarket event URL for this query: '{query}'.\n"
            f"RULES:\n"
            f"1. If the user asks a BROAD question (e.g. 'Who wins?', 'When will it release?'), find the MAIN EVENT GROUP URL (often ends in '...-winner' or '...-date').\n"
            f"2. Avoid specific 'side bet' markets (e.g. 'before June', 'margin of victory') unless the user specifically asked for them.\n"
            f"3. Return ONLY the URL. No text."
        )

        slug = "fed-rate-cut-december" 
        
        try:
            conn = http.client.HTTPSConnection("api.perplexity.ai")
            import os
            from dotenv import load_dotenv
            from pathlib import Path
            # Load .env from project root (parent of components/)
            env_path = Path(__file__).parent.parent / '.env'
            load_dotenv(dotenv_path=env_path)
            HARDCODED_KEY = os.getenv("PERPLEXITY_API_KEY")
            if not HARDCODED_KEY:
                logs.append("❌ **Resolver Error:** PERPLEXITY_API_KEY not set.")
                return Data(data={"slug": None, "logs": logs, "original_query": query})
            
            payload = json.dumps({
                "model": "sonar",
                "messages": [
                    {"role": "system", "content": "You are a URL finder. Output URL only."},
                    {"role": "user", "content": prompt}
                ]
            })
            
            headers = {'Authorization': f'Bearer {HARDCODED_KEY}', 'Content-Type': 'application/json'}
            conn.request("POST", "/chat/completions", payload, headers)
            res = conn.getresponse()
            
            if res.status == 200:
                content = json.loads(res.read().decode("utf-8"))["choices"][0]["message"]["content"]
                
                # Regex to find the slug
                # We look for /event/ (Group) first, as that is preferred for broad queries
                match = re.search(r"polymarket\.com\/event\/([a-zA-Z0-9-]+)", content)
                
                if match:
                    slug = match.group(1)
                    logs.append(f"✅ **Resolver:** Found Main Event Group: `{slug}`")
                else:
                    # Fallback to /market/ if no event group found
                    match_m = re.search(r"polymarket\.com\/market\/([a-zA-Z0-9-]+)", content)
                    if match_m:
                        slug = match_m.group(1)
                        logs.append(f"⚠️ **Resolver:** Group not found. Using specific market: `{slug}`")
                    else:
                         logs.append(f"⚠️ **Resolver:** Could not resolve URL. Defaulting.")

        except Exception as e:
            logs.append(f"❌ **Resolver Error:** {str(e)}")

        # We pass the original query forward so downstream nodes can cross-check
        return Data(data={"slug": slug, "logs": logs, "original_query": query})