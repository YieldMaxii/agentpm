from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import http.client
import json
import time

class RecursiveResearcher(Component):
    display_name = "Recursive Researcher (Hybrid)"
    description = "Synthesizes data with Strict Probability Inversion."

    inputs = [
        DataInput(name="plan_input", display_name="Research Plan"),
    ]

    outputs = [
        Output(display_name="Deep Dossier", name="dossier", method="execute_research"),
    ]

    def execute_research(self) -> Data:
        if not self.plan_input: return Data(data={})
        
        # --- 1. UNPACK DATA ---
        input_data = self.plan_input.data
        logs = input_data.get("logs", [])
        
        import datetime
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        
        if "market_data" in input_data:
            market_data = input_data.get("market_data", {})
            plan = input_data.get("research_plan", {})
            logs.append(f"🕒 **{timestamp}** - Researcher Received Plan for: '{market_data.get('event', 'Unknown')}'")
        else:
            market_data = input_data
            plan = {"domain": "General", "questions": ["Analyze the market."]}
            logs.append("⚠️ **Warning:** Strategy Planner skipped.")
        
        event = market_data.get("event", "Unknown Event")
        odds = market_data.get("market_implied_prob", 0)
        context = market_data.get("context", "") 
        user_query = input_data.get("original_query", "")
        
        factors = plan.get("factors", [])
        # Backwards compatibility
        if not factors and "questions" in plan:
             factors = [{"name": "General", "question": q} for q in plan["questions"]]
        domain = plan.get("domain", "General")
        # We use the strict definition of "Winning" from the Planner
        success_cond = plan.get("success_condition", f"The event '{event}' happens.")

        import os
        from dotenv import load_dotenv
        load_dotenv()
        HARDCODED_KEY = os.getenv("PERPLEXITY_API_KEY")
        headers = {'Authorization': f'Bearer {HARDCODED_KEY}', 'Content-Type': 'application/json'}

        def search_sonar(query_text):
            try:
                conn = http.client.HTTPSConnection("api.perplexity.ai")
                payload = json.dumps({"model": "sonar", "messages": [{"role": "user", "content": query_text}]})
                conn.request("POST", "/chat/completions", payload, headers)
                res = conn.getresponse()
                if res.status == 200:
                    return json.loads(res.read().decode("utf-8"))["choices"][0]["message"]["content"]
                return "Error"
            except: return "Error"

        findings = []
        logs.append(f"🔎 **Researcher:** Checking Condition: *'{success_cond}'*...")

        # --- PHASE 1: SEARCH ---
        # --- PHASE 1: SEARCH ---
        for f in factors:
            q = f.get("question")
            name = f.get("name")
            # We search specifically for evidence PROVING or DISPROVING the condition
            prompt = f"CONTEXT: {domain}. EVENT: {event}. FACTOR: {name}. QUESTION: {q}"
            ans = search_sonar(prompt)
            findings.append(f"**Factor: {name}**\nQ: {q}\nA: {ans[:500]}...")
            logs.append(f"&nbsp;&nbsp;&nbsp;&nbsp;✅ Analyzed: *{name}*")
            time.sleep(1)

        # --- PHASE 2: SYNTHESIS (STRICT MATH) ---
        logs.append("🤔 **Researcher:** Applying Directional Logic...")
        all_evidence = "\n\n".join(findings)
        
        # THE FIX: Explicit Math Rules
        synthesis_prompt = (
            f"ROLE: Senior Macro Quant. \n"
            f"USER QUESTION: '{user_query}'\n"
            f"EVENT: {event}. \n"
            f"WINNING CONDITION (YES): '{success_cond}'. \n"
            f"EVIDENCE COLLECTED:\n{all_evidence}\n\n"
            f"TASK: Calculate the Fair Value Probability that the WINNING CONDITION happens.\n"
            f"IMPORTANT: Address the USER QUESTION directly in your reasoning.\n"
            f"TASK: Derive the Fair Value Probability using a QUANTITATIVE WEIGHTED FACTOR MODEL.\n"
            f"1. **ASSIGN WEIGHTS:** For each factor researched, assign a 'Weight' (0-10) based on its importance to the outcome.\n"
            f"2. **SCORE SIGNALS:** Score the evidence for each factor from -10 (Strong Negative) to +10 (Strong Positive).\n"
            f"3. **CALCULATE:** Use these scores to derive a final probability.\n"
            f"   - *Example:* High Weight (10) + Strong Negative Score (-8) = Significant drag on probability.\n"
            f"4. **BASE RATES:** Start with the historical base rate (e.g. 50/50 or historical average) and adjust based on the weighted scores.\n"
            f"OUTPUT JSON: {{ \"status\": \"COMPLETE/INSUFFICIENT\", \"missing_query\": \"...\", \"probability_of_yes\": 5, \"factor_data\": [{{\"name\": \"Injuries\", \"weight\": 10, \"score\": -8, \"impact\": \"-20%\"}}], \"reasoning\": \"**Weighted Factor Analysis**...\" }}"
        )
        
        raw_syn = search_sonar(synthesis_prompt)
        
        def parse_json_safely(text):
            try:
                start = text.find("{")
                end = text.rfind("}") + 1
                if start != -1 and end != -1:
                    return json.loads(text[start:end])
                return None
            except: return None

        data = parse_json_safely(raw_syn)
        
        if data:
            status = data.get("status", "COMPLETE")
            summary = data.get("reasoning", raw_syn)
            ai_score = float(data.get("probability_of_yes", 50))
            factor_data = data.get("factor_data", [])
        else:
            status = "COMPLETE"
            summary = raw_syn.replace("```json", "").replace("```", "")
            ai_score = 50.0
            factor_data = []

        # --- PHASE 3: SELF-CORRECTION ---
        if status == "INSUFFICIENT":
            missing = data.get("missing_query", "Unknown data")
            logs.append(f"⚠️ **Reflection:** Missing: *'{missing}'*")
            logs.append(f"🔄 **Self-Correction:** Triggering gap-fill search...")
            
            extra_ans = search_sonar(f"Find this data: {missing} for event {event}")
            all_evidence += f"\n[GAP FILL]: {extra_ans}"
            
            recalc_prompt = f"Update Fair Value for '{success_cond}' using new data: {extra_ans}. REMEMBER: Bad news = Low Probability. Return JSON."
            raw_final = search_sonar(recalc_prompt)
            final_data = parse_json_safely(raw_final)
            
            if final_data:
                ai_score = float(final_data.get("probability_of_yes", ai_score))
                summary = final_data.get("reasoning", summary)
                summary = f"**[🔄 Self-Correction Triggered]**\n*Initial research was insufficient. Found data: '{missing}'*\n\n" + summary
            
            logs.append(f"✅ **Correction:** Gap filled.")
        else:
            logs.append(f"✅ **Reflection:** Data sufficient.")

        return Data(data={
            "research_summary": summary,
            "model_confidence": ai_score,
            "factor_data": factor_data,
            "logs": logs
        })