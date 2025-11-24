from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import requests

class CorrelationScout(Component):
    display_name = "Correlation Scout"
    description = "Finds related markets to build a macro dataset."

    inputs = [
        DataInput(name="primary_market", display_name="Primary Market (from Scout)"),
    ]

    outputs = [
        Output(display_name="Market Matrix", name="matrix", method="find_correlations"),
    ]

    def find_correlations(self) -> Data:
        # 1. Validate Input
        if not self.primary_market or "error" in self.primary_market.data:
            return Data(data={"error": "Primary market missing"})

        # 2. Identify Keywords from the Slug
        primary_slug = self.primary_market.data.get("slug", "")
        # Simple heuristic: take the first 2 words of the slug as search tags
        keywords = primary_slug.replace("-", " ").split(" ")[:2]
        search_term = " ".join(keywords)
        
        headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
        correlated_data = []
        
        try:
            # 3. Search for related active markets
            url = f"https://gamma-api.polymarket.com/events?limit=20&closed=false"
            res = requests.get(url, headers=headers)
            
            if res.status_code == 200:
                events = res.json()
                for event in events:
                    title = event.get("title", "")
                    slug = event.get("slug", "")
                    
                    # Skip the market we are already looking at
                    if slug == primary_slug: continue
                        
                    # Check correlation (Do they share a keyword?)
                    if any(k.lower() in title.lower() for k in keywords):
                        # Extract price
                        markets = event.get("markets", [])
                        if markets:
                            # Gamma API price extraction
                            import json
                            prices = json.loads(markets[0].get("outcomePrices", "[]"))
                            price = float(prices[0]) if prices else 0.50
                            
                            correlated_data.append(f"{title} ({price*100:.1f}%)")
        except Exception as e:
            correlated_data.append(f"Correlation Error: {str(e)}")

        # Limit to top 5 related markets to keep prompt clean
        matrix_text = "\n".join(correlated_data[:5])
        if not matrix_text: matrix_text = "No correlated markets found."

        # 4. Pass everything forward
        return Data(data={
            # Pass original data through
            "event": self.primary_market.data.get("event"),
            "market_implied_prob": self.primary_market.data.get("market_implied_prob"),
            # Add new data
            "correlation_text": matrix_text
        })