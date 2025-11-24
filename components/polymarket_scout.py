from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import http.client
import json
import urllib.parse

class PolymarketScout(Component):
    display_name = "Polymarket Scout (Scope Guard)"
    description = "Rejects niche side-bets to find the Main Event."
    
    inputs = [
        DataInput(name="slug_input", display_name="Slug Data"),
    ]

    outputs = [
        Output(display_name="Market Data", name="market_data", method="fetch_data"),
    ]

    def fetch_data(self) -> Data:
        # 1. Unpack Inputs
        logs = self.slug_input.data.get("logs", [])
        slug = self.slug_input.data.get("slug", "unknown")
        user_query = self.slug_input.data.get("original_query", "")
        
        import datetime
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        logs.append(f"🕒 **{timestamp}** - Scout Received: Slug='{slug}', Query='{user_query}'")
        
        import os
        from dotenv import load_dotenv
        load_dotenv()
        HARDCODED_KEY = os.getenv("PERPLEXITY_API_KEY")
        headers = {'Authorization': f'Bearer {HARDCODED_KEY}', 'Content-Type': 'application/json'}
        ua_headers = {"User-Agent": "Mozilla/5.0"}

        # --- HELPER: STRICT AI JUDGE ---
        def ask_judge(options_text):
            prompt = (
                f"USER QUERY: '{user_query}'\n"
                f"AVAILABLE MARKETS:\n{options_text}\n\n"
                f"TASK: Select the market index that matches the user's intent.\n"
                f"### CRITICAL SCOPE RULES:\n"
                f"1. **REJECT SUBSETS:** If User asks 'Will it release in 2026?' (Full Year), and the market is 'Before June 2026' (Partial Year), you MUST return 'match_found': false.\n"
                f"2. **PREFER BROAD MARKETS:** Look for 'Release Date' groups or 'Winner' markets over niche props.\n"
                f"3. **MATCH:** Only select if the market covers the FULL scope of the question.\n"
                f"4. **STRICT RELEVANCE:** The market MUST be about the same Subject as the User Query. If User asks about 'GTA', REJECT 'Bitcoin'.\n"
                f"5. **ALLOW INDIRECT:** Accept markets that imply the answer. (e.g. 'Will X be postponed?' IS RELEVANT to 'When will X release?').\n"
                f"6. **HANDLE ABBREVIATIONS:** Treat 'GTA' == 'Grand Theft Auto', 'BTC' == 'Bitcoin', etc.\n"
                f"7. **WHO QUESTIONS:** If User asks 'Who?', ACCEPT markets with a list of Candidates/Teams (e.g. 'Winner', 'Champion').\n"
                f"8. **TOPIC MISMATCH:** If the market is about a completely different industry (e.g. AI vs Gaming), REJECT IT.\n\n"
                f"IF NONE MATCH SCOPE: Return JSON {{ \"match_found\": false }}\n"
                f"IF MATCH FOUND: Return JSON {{ \"match_found\": true, \"index\": 0, \"reason\": \"...\" }}"
            )
            try:
                import requests
                CHUTES_KEY = os.getenv("CHUTES_API_KEY")
                if not CHUTES_KEY: return {"match_found": False}

                url = "https://llm.chutes.ai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {CHUTES_KEY}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "deepseek-ai/DeepSeek-R1-0528",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1024,
                    "temperature": 0.1, # Low temp for strict logic
                    "stream": False
                }
                
                response = requests.post(url, headers=headers, json=payload)
                if response.status_code == 200:
                    clean = response.json()["choices"][0]["message"]["content"]
                    # Clean DeepSeek output (with null safety)
                    if clean:
                        import re
                        clean = re.sub(r"<think>.*?</think>", "", clean, flags=re.DOTALL).strip()
                        clean = clean.replace("```json", "").replace("```", "").strip()
                        return json.loads(clean)
            except: pass
            return {"match_found": False}

        # --- STEP 1: FETCH INITIAL SLUG MARKETS ---
        candidates = []
        try:
            conn = http.client.HTTPSConnection("gamma-api.polymarket.com")
            conn.request("GET", f"/events?slug={slug}", headers=ua_headers)
            res = conn.getresponse()
            
            if res.status == 200:
                data = json.loads(res.read().decode("utf-8"))
                if data:
                    event = data[0]
                    # Get Parent Title to ensure context (e.g. "GTA VI") is present
                    parent_title = event.get("title", "")
                    markets = event.get("markets", [])
                    
                    for m in markets:
                        q_title = m.get("groupItemTitle", m.get("question"))
                        # Ensure full name is present for the Judge
                        full_label = f"{parent_title}: {q_title}" if parent_title not in q_title else q_title
                        
                        outcomes = json.loads(m.get("outcomes", "[]"))
                        prices = json.loads(m.get("outcomePrices", "[]"))
                        
                        if not prices: continue

                        if len(outcomes) == 2 and "Yes" in outcomes:
                            candidates.append({
                                "label": f"{full_label} (Yes)",
                                "price": float(prices[0]),
                                "type": "Binary"
                            })
                        else:
                            for i, out in enumerate(outcomes):
                                try:
                                    candidates.append({
                                        "label": f"{full_label}: {out}",
                                        "price": float(prices[i]),
                                        "type": "Group"
                                    })
                                except: pass
        except Exception as e:
            logs.append(f"❌ Initial Fetch Error: {str(e)}")

        # --- STEP 2: THE STRICT JUDGE ---
        selected = None
        
        if candidates:
            # Send options to AI
            options_text = "\n".join([f"[{i}] {c['label']} ({c['price']:.2f})" for i, c in enumerate(candidates)])
            judgment = ask_judge(options_text)
            
            if judgment.get("match_found"):
                idx = judgment.get("index")
                selected = candidates[idx]
                logs.append(f"🧠 **AI Judge:** Selected: '{selected['label']}'")
            else:
                logs.append(f"🧠 **AI Judge:** Rejected options (Too narrow). Triggering Global Search...")
        
        # --- STEP 3: FALLBACK GLOBAL SEARCH (If Initial was Niche) ---
        if not selected:
            logs.append("🔄 **Scout:** Triggering Smart Global Search...")
            
            # HELPER: Get Search Variations
            search_candidates = [slug.replace("-", " ")] if slug else ["unknown"]  # Default
            try:
                prompt_terms = (
                    f"Generate 3 distinct, short search terms for Polymarket to find markets about: '{user_query}'.\n"
                    f"1. Full Name (e.g. 'Grand Theft Auto VI')\n"
                    f"2. Abbreviation (e.g. 'GTA 6')\n"
                    f"3. Related Keyword (e.g. 'Rockstar Games')\n"
                    f"Output strictly a comma-separated list. No quotes."
                )
                
                import requests
                CHUTES_KEY = os.getenv("CHUTES_API_KEY")
                if CHUTES_KEY:
                    url = "https://llm.chutes.ai/v1/chat/completions"
                    headers_chutes = {
                        "Authorization": f"Bearer {CHUTES_KEY}",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "model": "deepseek-ai/DeepSeek-R1-0528",
                        "messages": [{"role": "user", "content": prompt_terms}],
                        "max_tokens": 1024,
                        "temperature": 0.7,
                        "stream": False
                    }
                    
                    response = requests.post(url, headers=headers_chutes, json=payload)
                    if response.status_code == 200:
                        raw_terms = response.json()["choices"][0]["message"]["content"]
                        # Clean DeepSeek output
                        import re
                        raw_terms = re.sub(r"<think>.*?</think>", "", raw_terms, flags=re.DOTALL).strip()
                        
                        search_candidates = [t.strip() for t in raw_terms.split(",") if len(t.strip()) > 2]
                        logs.append(f"🧠 **Scout (DeepSeek):** Generated Search Terms: {search_candidates}")
            except: pass

            # Loop through search terms until match found
            for search_term in search_candidates:
                if selected: break # Stop if found
                
                logs.append(f"🔎 **Scout:** Searching for: *'{search_term}'*...")
                try:
                    safe_query = urllib.parse.quote(search_term) 
                    conn = http.client.HTTPSConnection("gamma-api.polymarket.com")
                    conn.request("GET", f"/events?limit=10&closed=false&q={safe_query}", headers=ua_headers)
                    res = conn.getresponse()
                    
                    if res.status == 200:
                        events = json.loads(res.read().decode("utf-8"))
                        
                        # Search results are Events. We need to find the one with year outcomes.
                        for e in events:
                            # Quick check: does this event look like a release date group?
                            title = e.get("title", "")
                            markets = e.get("markets", [])
                            
                            # Flatten markets for this event
                            e_candidates = []
                            for m in markets:
                                q = m.get("groupItemTitle", m.get("question"))
                                prices = json.loads(m.get("outcomePrices", "[]"))
                                outcomes = json.loads(m.get("outcomes", "[]"))
                                if not prices: continue
                                
                                # Add outcomes to candidate list
                                if len(outcomes) > 2: # Group market (Years)
                                    for i, out in enumerate(outcomes):
                                        e_candidates.append({"label": f"{title}: {out}", "price": float(prices[i])})
                                elif "Yes" in outcomes: # Binary
                                    e_candidates.append({"label": f"{title}: {q} (Yes)", "price": float(prices[0])})
                            
                            if not e_candidates: continue
                                
                            # Ask Judge again for this new event list
                            options_text = "\n".join([f"[{i}] {c['label']}" for i, c in enumerate(e_candidates)])
                            
                            # SMART FILTER: Use the AI-generated search terms as a whitelist.
                            # If the market title doesn't contain ANY meaningful word from the search terms, reject it.
                            # This allows "GTA" -> "Grand Theft Auto" (because AI generated both), but rejects "Ethereum".
                            
                            # Flatten search terms into a set of keywords
                            allowed_keywords = set()
                            for term in search_candidates:
                                allowed_keywords.update(term.lower().split())
                            
                            # Filter common stop words
                            stop_words = {'the', 'will', 'in', 'on', 'at', 'of', 'a', 'is', 'to', 'for', 'who', 'what', 'price', 'hit', 'be'}
                            allowed_keywords = allowed_keywords - stop_words
                            
                            valid_candidates = []
                            for c in e_candidates:
                                c_words = set(c['label'].lower().split())
                                if allowed_keywords & c_words: # Intersection exists
                                    valid_candidates.append(c)
                            
                            if not valid_candidates:
                                logs.append(f"⚠️ **Scout:** Smart Filter rejected all results for '{search_term}' (Topic Mismatch)")
                                continue

                            # Only judge valid candidates
                            options_text = "\n".join([f"[{i}] {c['label']}" for i, c in enumerate(valid_candidates)])
                            judgment = ask_judge(options_text)
                            
                            if judgment.get("match_found"):
                                idx = judgment.get("index")
                                selected = valid_candidates[idx]
                                logs.append(f"✅ **Scout:** Found Global Match: '{selected['label']}'")
                                break # Found it!
                            
                except Exception as e:
                    logs.append(f"Global Search Error ({search_term}): {str(e)}")

        # Default if everything fails
        if not selected:
            logs.append("❌ **Scout:** Could not find relevant market.")
            return Data(data={"error": "No market found", "logs": logs})

        return Data(data={
            "event": selected['label'], 
            "market_implied_prob": selected["price"] * 100,
            "slug": slug,
            "context": "Selected via Scope-Guarded AI.",
            "logs": logs,
            "original_query": user_query
        })