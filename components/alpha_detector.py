from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Message


class AlphaDetector(Component):
    display_name = "Alpha Detector (UI Polish)"
    description = "Renders the Decision Table + Kelly Risk + Collapsible Logs with strict formatting."

    inputs = [
        DataInput(name="scout_data", display_name="Market Data"),
        DataInput(name="research_data", display_name="Research Data"),
    ]

    outputs = [
        Output(display_name="Final Report", name="report", method="generate_signal"),
    ]

    def generate_signal(self) -> Message:
        # --- 1. SAFETY & UNPACKING ---
        # Check for skip markers
        if self.scout_data and hasattr(self.scout_data, 'data') and self.scout_data.data.get("__skip__"):
            return Message(text="__SKIP__")
        if self.research_data and hasattr(self.research_data, 'data') and self.research_data.data.get("__skip__"):
            return Message(text="__SKIP__")
        
        if not self.scout_data or not self.research_data: 
            return Message(text="⏳ Waiting for data streams...")

        # Defensive Unpacking
        scout_dict = self.scout_data.data if hasattr(self.scout_data, 'data') else {}
        research_dict = self.research_data.data if hasattr(self.research_data, 'data') else {}

        # Extract Core Metrics
        event_name = scout_dict.get("event", "Unknown Event")
        try:
            market_raw = float(scout_dict.get("market_implied_prob", 50))
            ai_raw = float(research_dict.get("model_confidence", 50))
        except (ValueError, TypeError):
            market_raw, ai_raw = 50.0, 50.0

        # Extract Narrative Data
        summary = research_dict.get("research_summary", "No summary available.")
        factor_data = research_dict.get("factor_data", [])
        delta_summary = research_dict.get("delta_summary", "")
        original_query = scout_dict.get("original_query", "")
        citations = research_dict.get("citations", [])
        
        # Extract Logs
        logs = research_dict.get("logs", [])
        if not isinstance(logs, list):
            logs = [str(logs)] if logs else []
        log_text = "\n".join(logs)

        # --- 2. THE RISK ENGINE (QUANT MATH) ---
        edge = ai_raw - market_raw
        
        # Visual Signals
        trade_signal = "HOLD"
        trade_icon = "⚖️"
        trade_desc = "Market is fairly priced"
        
        if edge > 15:
            trade_signal, trade_icon = "STRONG BUY", "🎯"
            trade_desc = "Significant mispricing detected"
        elif edge > 5:
            trade_signal, trade_icon = "LEAN BUY", "📈"
            trade_desc = "Moderate edge - consider position"
        elif edge < -15:
            trade_signal, trade_icon = "STRONG SELL", "📉"
            trade_desc = "Market overpriced - fade"
        elif edge < -5:
            trade_signal, trade_icon = "LEAN SELL", "⚠️"
            trade_desc = "Slight overpricing"

        # Confidence Icons
        if ai_raw >= 75:
            conf_icon, conf_label = "🟢", "Very High"
        elif ai_raw >= 60:
            conf_icon, conf_label = "🟢", "High"
        elif ai_raw >= 40:
            conf_icon, conf_label = "🟡", "Moderate"
        elif ai_raw >= 25:
            conf_icon, conf_label = "🟠", "Low"
        else:
            conf_icon, conf_label = "🔴", "Very Low"
        
        # Kelly Criterion (Quarter Kelly)
        kelly_msg = "⛔ Negative EV"
        if edge > 0 and 0.1 < market_raw < 99.9:
            decimal_odds = 100 / market_raw
            b = decimal_odds - 1
            p = ai_raw / 100
            q = 1 - p
            f_star = (b * p - q) / b
            safe_kelly = (f_star * 0.25) * 100
            
            if safe_kelly > 0.5:
                kelly_msg = f"💰 **{safe_kelly:.1f}%** Size"
            else:
                kelly_msg = "⚠️ Edge too thin"

        # --- 3. UI GENERATION (Strict Markdown) ---
        
        # Header
        answer_section = self._generate_direct_answer(event_name, ai_raw, summary, original_query)

        # The Table (With explicit newlines for stability)
        table_section = f"""
## 📊 Risk Engine

| Metric | Market | Model | **Edge** | **Kelly Size** |
| :--- | :---: | :---: | :---: | :---: |
| **Values** | {market_raw:.1f}% | {ai_raw:.1f}% | **{edge:+.1f}%** | {kelly_msg} |

**Signal:** {trade_icon} **{trade_signal}**
> {trade_desc}

**Confidence:** {conf_icon} {conf_label} ({ai_raw:.0f}%)
"""

        # Bayesian Update Section
        thesis_section = ""
        if delta_summary and len(delta_summary) > 5 and "fallback" not in delta_summary.lower():
            thesis_section = f"""
### 🔄 Thesis Update
> *{delta_summary}*
"""

        # Factors Section
        factor_section = self._format_factors(factor_data)

        # Analysis Section
        analysis_section = self._format_analysis(summary)

        # Citations Section
        citations_section = ""
        if citations and len(citations) > 0:
            citations_section = "\n### 📚 Sources\n"
            for i, cite in enumerate(citations[:5], 1):
                citations_section += f"{i}. {cite}\n"

        # Final Assembly
        report = f"""# 📋 Alpha Report

{answer_section}

---
{table_section}
---
{thesis_section}
{factor_section}

### 📝 Deep Dive Analysis

{analysis_section}
{citations_section}

---

<details>
<summary><b>🧠 View "Glass Box" Logs ({len(logs)} steps)</b></summary>

```text
{log_text}
```

</details>

---
<sub>*AgentPM v2.5 • Risk-Adjusted • Quarter Kelly*</sub>
"""
        return Message(text=report)

    # --- HELPERS ---

    def _generate_direct_answer(self, event: str, odds: float, summary: str, query: str) -> str:
        """Generates the bottom line answer."""
        # Natural language phrasing based on odds
        if odds > 85:
            phrasing = "is **almost certain**"
        elif odds > 70:
            phrasing = "is **highly likely**"
        elif odds > 55:
            phrasing = "is **likely**"
        elif odds > 45:
            phrasing = "is a **toss-up**"
        elif odds > 30:
            phrasing = "is **unlikely but possible**"
        elif odds > 15:
            phrasing = "is **unlikely**"
        else:
            phrasing = "is **highly unlikely**"
        
        # Extract subject from event
        subject = event
        if ":" in event:
            parts = event.split(":")
            if len(parts) >= 2:
                subject = parts[-1].strip().replace("(Yes)", "").replace("(No)", "").strip()
        
        answer = f"### 🎯 Bottom Line\n\n**{subject}** {phrasing} ({odds:.0f}%)."
        
        # Add first sentence of summary as context
        if summary and len(summary) > 50:
            first_sentence = summary.split('.')[0] + '.' if '.' in summary else summary[:200]
            if len(first_sentence) > 30:
                answer += f"\n\n> *{first_sentence[:300]}*"
        
        return answer

    def _format_factors(self, factors: list) -> str:
        """Formats factors with visual weight bars."""
        if not factors or not isinstance(factors, list):
            return ""
        
        bullish = []
        bearish = []
        neutral = []
        
        for f in factors:
            if not isinstance(f, dict):
                continue
            
            name = f.get("name", "Factor")
            impact = str(f.get("impact", ""))
            weight = f.get("weight", 0)
            score = f.get("score", 5)
            
            # Visual bar for weight (5 segments)
            try:
                dots = int((float(weight) / 100) * 5) if weight > 10 else 1
            except (ValueError, TypeError):
                dots = 1
            bar = "▮" * dots + "▯" * (5 - dots)
            
            line = f"- **{name}**: {impact} `{bar}`"
            
            # Categorize by impact
            if "+" in impact or (isinstance(score, (int, float)) and score >= 6):
                bullish.append(line)
            elif "-" in impact or (isinstance(score, (int, float)) and score <= 4):
                bearish.append(line)
            else:
                neutral.append(line)

        # Build section with explicit newlines
        text = "### ⚖️ Key Drivers\n\n"
        
        if bullish:
            text += "**✅ Supporting Factors**\n\n" + "\n".join(bullish) + "\n\n"
        if bearish:
            text += "**⚠️ Risk Factors**\n\n" + "\n".join(bearish) + "\n\n"
        if neutral:
            text += "**🔹 Neutral Factors**\n\n" + "\n".join(neutral) + "\n"
        
        return text if (bullish or bearish or neutral) else ""

    def _format_analysis(self, text: str) -> str:
        """Cleans and intelligently structures the analysis text."""
        if not text or len(text) < 20:
            return "*No detailed analysis available.*"
        
        import re
        
        # Clean artifacts
        clean = text.replace("```json", "").replace("```", "").strip()
        clean = clean.replace("\\n", "\n")  # Fix escaped newlines
        
        # If already has paragraph breaks, use them
        if "\n\n" in clean:
            paragraphs = [p.strip() for p in clean.split('\n\n') if p.strip()]
        else:
            # Split long text into logical sections by sentence
            # Look for natural break points
            paragraphs = self._split_into_sections(clean)
        
        if not paragraphs:
            return clean
        
        formatted = ""
        
        # Categorize each paragraph
        used_headers = set()
        
        for i, para in enumerate(paragraphs):
            para_lower = para.lower()
            
            # Detect numbered lists like "1)" or "1." and convert to bullets
            para = re.sub(r'(\d+)\)\s*', r'\n• ', para)
            para = re.sub(r';\s*(\d+)\)', r'\n• ', para)
            
            # First paragraph is always the summary
            if i == 0:
                formatted += f"#### 📌 Market Context\n\n{para}\n\n"
                continue
            
            # Last paragraph is conclusion
            if i == len(paragraphs) - 1:
                formatted += f"#### 🎯 Bottom Line Assessment\n\n{para}\n\n"
                continue
            
            # Categorize middle paragraphs by content
            header = None
            
            if any(word in para_lower for word in ['risk', 'tail risk', 'downside', 'fragil', 'vulnerab', 'concern', 'acute']):
                if 'risks' not in used_headers:
                    header = "#### ⚠️ Key Risks"
                    used_headers.add('risks')
            elif any(word in para_lower for word in ['edge', 'underweight', 'undervalue', 'advantage', 'outpac', 'superior', 'dominan']):
                if 'edge' not in used_headers:
                    header = "#### 💡 Edge Analysis"
                    used_headers.add('edge')
            elif any(word in para_lower for word in ['recent', 'development', 'return', 'recovery', 'week', 'update']):
                if 'recent' not in used_headers:
                    header = "#### 📰 Recent Developments"
                    used_headers.add('recent')
            elif any(word in para_lower for word in ['historical', 'data show', 'since 20', 'base rate', 'percent of']):
                if 'historical' not in used_headers:
                    header = "#### 📊 Historical Context"
                    used_headers.add('historical')
            elif any(word in para_lower for word in ['support', 'bullish', 'positive', 'strength', 'boost']):
                if 'bull' not in used_headers:
                    header = "#### 💪 Supporting Evidence"
                    used_headers.add('bull')
            
            if header:
                formatted += f"{header}\n\n{para}\n\n"
            else:
                formatted += f"#### 📋 Analysis\n\n{para}\n\n"
        
        return formatted.strip()
    
    def _split_into_sections(self, text: str) -> list:
        """Intelligently split a wall of text into logical paragraphs."""
        import re
        
        # First, try to find natural section breaks
        # Look for patterns like "However,", "Crucially,", "Recent developments", etc.
        section_markers = [
            r'(?:^|\.\s+)(However,)',
            r'(?:^|\.\s+)(Crucially,)',
            r'(?:^|\.\s+)(Recent developments)',
            r'(?:^|\.\s+)(Synthesizing)',
            r'(?:^|\.\s+)(Market pessimism)',
            r'(?:^|\.\s+)(Historical data)',
            r'(?:^|\.\s+)(The market)',
            r'(?:^|\.\s+)(Tail risks)',
            r'(?:^|\.\s+)(Key risks)',
        ]
        
        # Split by these markers, keeping the marker
        working_text = text
        for marker in section_markers:
            working_text = re.sub(marker, r'\n\n\1', working_text)
        
        # Now split by double newlines
        paragraphs = [p.strip() for p in working_text.split('\n\n') if p.strip() and len(p.strip()) > 50]
        
        # If we still have very few paragraphs, split by sentence count
        if len(paragraphs) <= 2 and len(text) > 500:
            sentences = re.split(r'(?<=[.!?])\s+', text)
            
            # Group sentences into paragraphs of ~3-4 sentences each
            paragraphs = []
            current_para = []
            
            for sent in sentences:
                current_para.append(sent)
                # Start new paragraph at natural break points or every 3-4 sentences
                if len(current_para) >= 3:
                    sent_lower = sent.lower()
                    if any(word in sent_lower for word in ['however', 'but', 'yet', 'although', 'despite']):
                        paragraphs.append(' '.join(current_para))
                        current_para = []
                    elif len(current_para) >= 4:
                        paragraphs.append(' '.join(current_para))
                        current_para = []
            
            if current_para:
                paragraphs.append(' '.join(current_para))
        
        return paragraphs
