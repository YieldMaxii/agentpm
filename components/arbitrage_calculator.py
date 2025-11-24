from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Message

class AlphaDetector(Component):
    display_name = "Alpha Detector (Expandable UI)"
    description = "Renders the Decision Table + Collapsible Thought Process."

    inputs = [
        DataInput(name="scout_data", display_name="Market Data"),
        DataInput(name="research_data", display_name="Research Data"),
    ]

    outputs = [
        Output(display_name="Final Report", name="report", method="generate_signal"),
    ]

    def generate_signal(self) -> Message:
        if not self.scout_data or not self.research_data: return Message(text="Wait...")

        # Extract Data
        market_odds = float(self.scout_data.data.get("market_implied_prob", 50))
        ai_odds = float(self.research_data.data.get("model_confidence", 50))
        ai_odds = float(self.research_data.data.get("model_confidence", 50))
        summary = self.research_data.data.get("research_summary", "")
        factor_data = self.research_data.data.get("factor_data", [])
        
        # EXTRACT THE LOGS
        logs = self.research_data.data.get("logs", [])
        log_text = "\n\n".join(logs) # Join list into string

        # Edge Calc
        edge = ai_odds - market_odds
        signal = "HOLD"
        color = "⚪"
        if edge > 15: signal, color = "STRONG BUY (YES)", "🟢"
        elif edge < -15: signal, color = "STRONG BUY (NO)", "🔴"

        # Format Factor Table
        factor_table = ""
        if factor_data:
            rows = "\n".join([f"| {f['name']} | {f['weight']} | {f['score']} | {f['impact']} |" for f in factor_data])
            factor_table = f"""
### 📊 First Principles Analysis
| Factor | Weight | Signal | Impact |
| :--- | :--- | :--- | :--- |
{rows}

"""

        # --- THE PRO UI with EXPANDABLE LOGS ---
        report = f"""
# {color} Signal: {signal}

| Metric | Value |
| :--- | :--- |
| **Market Odds** | `{market_odds:.1f}%` |
| **Model Odds** | `{ai_odds:.1f}%` |
| **Edge** | **`{edge:+.1f}%`** |

<details>
<summary><b>🧠 Click to View Agent Thought Process</b></summary>

{log_text}

</details>

{factor_table}### 📝 Analyst Report
{summary}

---
*AgentPM v2.1*
"""
        return Message(text=report)