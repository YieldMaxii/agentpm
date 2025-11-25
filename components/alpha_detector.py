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
        if not self.scout_data or not self.research_data: 
            return Message(text="⏳ Waiting for data...")

        # Defensive: Ensure we have dict data
        scout_dict = self.scout_data.data if isinstance(self.scout_data.data, dict) else {}
        research_dict = self.research_data.data if isinstance(self.research_data.data, dict) else {}

        # Extract Data with safe defaults
        event_name = scout_dict.get("event", "Unknown Event")
        market_odds = float(scout_dict.get("market_implied_prob", 50))
        ai_odds = float(research_dict.get("model_confidence", 50))
        summary = research_dict.get("research_summary", "No summary available.")
        factor_data = research_dict.get("factor_data", [])
        
        if not isinstance(factor_data, list):
            factor_data = []
        
        # Extract logs
        logs = research_dict.get("logs", [])
        if not isinstance(logs, list):
            logs = [str(logs)] if logs else []
        log_text = "\n\n".join(logs)

        # Edge Calculation
        edge = ai_odds - market_odds
        
        # Signal Logic
        if edge > 15:
            signal = "STRONG BUY (YES)"
            signal_icon = "🟢"
            signal_desc = "Model significantly more bullish than market"
        elif edge > 5:
            signal = "BUY (YES)"
            signal_icon = "🟡"
            signal_desc = "Model moderately more bullish than market"
        elif edge < -15:
            signal = "STRONG BUY (NO)"
            signal_icon = "🔴"
            signal_desc = "Model significantly more bearish than market"
        elif edge < -5:
            signal = "BUY (NO)"
            signal_icon = "🟠"
            signal_desc = "Model moderately more bearish than market"
        else:
            signal = "HOLD"
            signal_icon = "⚪"
            signal_desc = "Model aligned with market consensus"

        # Format Factor Table
        factor_section = ""
        if factor_data:
            # Separate bullish and bearish factors
            bullish_factors = []
            bearish_factors = []
            
            for f in factor_data:
                if isinstance(f, dict):
                    name = f.get('name', 'Unknown')
                    weight = f.get('weight', '-')
                    score = f.get('score', '-')
                    impact = str(f.get('impact', '0'))
                    
                    # Determine if bullish or bearish
                    is_bullish = '+' in impact or (isinstance(score, (int, float)) and score >= 6)
                    
                    row = f"| {name} | {weight} | {score} | {impact} |"
                    if is_bullish:
                        bullish_factors.append(row)
                    else:
                        bearish_factors.append(row)
            
            factor_section = "\n---\n\n## 📊 Factor Analysis\n\n"
            
            if bullish_factors:
                factor_section += "### ✅ Bullish Factors\n"
                factor_section += "| Factor | Weight | Score | Impact |\n"
                factor_section += "| :--- | :---: | :---: | :---: |\n"
                factor_section += "\n".join(bullish_factors) + "\n\n"
            
            if bearish_factors:
                factor_section += "### ⚠️ Risk Factors\n"
                factor_section += "| Factor | Weight | Score | Impact |\n"
                factor_section += "| :--- | :---: | :---: | :---: |\n"
                factor_section += "\n".join(bearish_factors) + "\n"

        # Parse summary into sections if it's long enough
        analysis_section = self._format_analysis(summary)

        # Build the report
        report = f"""# {signal_icon} {signal}

> **{event_name}**

---

## 📈 Market Overview

| Metric | Value | Description |
| :--- | :---: | :--- |
| **Market Odds** | `{market_odds:.1f}%` | Current Polymarket probability |
| **Model Odds** | `{ai_odds:.1f}%` | AI-estimated probability |
| **Edge** | `{edge:+.1f}%` | {signal_desc} |

{factor_section}

---

## 📝 Research Analysis

{analysis_section}

---

<details>
<summary><b>🔍 View Full Agent Reasoning</b></summary>

{log_text}

</details>

---
<sub>*AgentPM v2.1 • Data sourced from Polymarket & Perplexity AI*</sub>
"""
        return Message(text=report)
    
    def _format_analysis(self, summary: str) -> str:
        """
        Attempts to intelligently format the analysis into sections.
        Looks for natural paragraph breaks and key phrases.
        """
        if not summary or len(summary) < 100:
            return summary
        
        # Split into paragraphs
        paragraphs = [p.strip() for p in summary.split('\n\n') if p.strip()]
        
        # If already has multiple paragraphs, format them
        if len(paragraphs) >= 3:
            formatted = ""
            
            # First paragraph is usually the thesis/summary
            formatted += f"### 💡 Key Insight\n\n{paragraphs[0]}\n\n"
            
            # Look for supporting/risk paragraphs
            for i, para in enumerate(paragraphs[1:], 1):
                para_lower = para.lower()
                
                if any(word in para_lower for word in ['however', 'risk', 'concern', 'caveat', 'downside', 'bear', 'against']):
                    formatted += f"### ⚠️ Key Risks\n\n{para}\n\n"
                elif any(word in para_lower for word in ['support', 'bull', 'upside', 'positive', 'strength', 'advantage']):
                    formatted += f"### ✅ Supporting Evidence\n\n{para}\n\n"
                elif any(word in para_lower for word in ['overall', 'conclusion', 'summary', 'therefore', 'in sum']):
                    formatted += f"### 🎯 Conclusion\n\n{para}\n\n"
                else:
                    # Generic section
                    if i == 1:
                        formatted += f"### 📋 Analysis\n\n{para}\n\n"
                    else:
                        formatted += f"{para}\n\n"
            
            return formatted.strip()
        
        # If it's one long paragraph, try to split by sentences
        elif len(summary) > 500:
            # Try to find natural break points
            sentences = summary.replace('. ', '.|').split('|')
            
            if len(sentences) >= 4:
                # Group sentences into sections
                third = len(sentences) // 3
                
                intro = ' '.join(sentences[:third])
                body = ' '.join(sentences[third:2*third])
                conclusion = ' '.join(sentences[2*third:])
                
                return f"""### 💡 Summary

{intro}

### 📋 Details

{body}

### 🎯 Assessment

{conclusion}
"""
        
        # Default: return as-is with a header
        return f"### 📋 Analysis\n\n{summary}"
