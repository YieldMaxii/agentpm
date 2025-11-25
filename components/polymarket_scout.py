from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import http.client
import json
import urllib.parse
import os
import re
import requests
from dotenv import load_dotenv
from pathlib import Path
import datetime
import traceback

class PolymarketScout(Component):
    display_name = "Polymarket Scout (Scope Guard)"
    description = "Finds the best matching Polymarket event for a user query."
    
    inputs = [
        DataInput(name="slug_input", display_name="Slug Data"),
    ]

    outputs = [
        Output(display_name="Market Data", name="market_data", method="fetch_data"),
    ]

    def fetch_data(self) -> Data:
        logs = self.slug_input.data.get("logs", [])
        slug = self.slug_input.data.get("slug", "unknown")
        user_query = self.slug_input.data.get("original_query", "")
        
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        logs.append(f"🕒 **{timestamp}** - Scout Received: Slug='{slug}', Query='{user_query}'")
        
        env_path = Path(__file__).parent.parent / '.env'
        load_dotenv(dotenv_path=env_path)
        ua_headers = {"User-Agent": "Mozilla/5.0"}

        # --- HELPER: EXTRACT ANSWER FROM DEEPSEEK R1 ---
        def extract_answer(raw_content):
            if not raw_content:
                return "", None
            
            thought_text = None
            clean_content = ""
            
            if "</think>" in raw_content:
                parts = raw_content.split("</think>", 1)
                if len(parts) == 2:
                    thought_part = parts[0]
                    if "<think>" in thought_part:
                        thought_text = thought_part.split("<think>", 1)[1].strip()
                    else:
                        thought_text = thought_part.strip()
                    clean_content = parts[1].strip()
            elif "<think>" in raw_content:
                thought_text = raw_content.replace("<think>", "").strip()
                clean_content = ""
            else:
                clean_content = raw_content.strip()
            
            clean_content = clean_content.replace("```json", "").replace("```", "").strip()
            return clean_content, thought_text

        # --- HELPER: SEMANTIC MARKET MATCHER (LLM-based) ---
        def semantic_match(candidates, user_query):
            """
            Uses an LLM to semantically match user intent to market options.
            The LLM understands synonyms, context, and implicit meanings.
            """
            if not candidates:
                return None
            
            CHUTES_KEY = os.getenv("CHUTES_API_KEY")
            if not CHUTES_KEY:
                logs.append("⚠️ **Matcher:** No API key")
                return None
            
            # Build options list
            options_text = "\n".join([f"[{i}] {c['label']} (Current odds: {c['price']*100:.1f}%)" for i, c in enumerate(candidates)])
            
            prompt = f"""You are a prediction market expert. Match the user's question to the best market option.

USER QUESTION: "{user_query}"

AVAILABLE MARKET OPTIONS:
{options_text}

INSTRUCTIONS:
1. Understand what the user is ACTUALLY asking about (the underlying event, outcome, or probability they want to know)
2. Find the market option that would answer their question
3. Consider semantic equivalences:
   - "cut rates" / "lower rates" / "reduce rates" = "decrease" / "bps decrease"
   - "raise rates" / "hike rates" = "increase" / "bps increase"
   - "hold" / "pause" / "no change" = "unchanged"
   - "win" / "victory" = specific team/candidate names
   - "release" / "launch" / "come out" = release date markets
   - "before X" questions match markets with date ranges
4. If the user asks about likelihood/probability of something happening, find the market that tracks that outcome
5. If multiple options could answer the question, pick the MOST RELEVANT one (usually the most likely scenario being asked about)

OUTPUT FORMAT (JSON only, no other text):
If a match is found: {{"match": true, "index": <number>, "reasoning": "<brief explanation>"}}
If no match: {{"match": false, "reasoning": "<why no match>"}}"""

            try:
                url = "https://llm.chutes.ai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {CHUTES_KEY}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "deepseek-ai/DeepSeek-R1-0528",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 8192,
                    "temperature": 0.1,
                    "stream": False
                }
                
                response = requests.post(url, headers=headers, json=payload, timeout=300)
                
                if response.status_code == 200:
                    raw_content = response.json()["choices"][0]["message"]["content"]
                    clean, thoughts = extract_answer(raw_content)
                    
                    if thoughts:
                        short_thought = thoughts[:150] + "..." if len(thoughts) > 150 else thoughts
                        logs.append(f"💭 **Matcher Thought:** {short_thought}")
                    
                    if clean:
                        try:
                            # Extract JSON
                            json_match = re.search(r"\{.*\}", clean, re.DOTALL)
                            if json_match:
                                result = json.loads(json_match.group(0))
                                
                                if result.get("match") and "index" in result:
                                    idx = int(result["index"])
                                    if 0 <= idx < len(candidates):
                                        reasoning = result.get("reasoning", "Semantic match")
                                        logs.append(f"✅ **Semantic Match:** Index {idx} - {reasoning}")
                                        return candidates[idx]
                                else:
                                    reasoning = result.get("reasoning", "No match found")
                                    logs.append(f"❌ **Matcher:** {reasoning}")
                        except (json.JSONDecodeError, ValueError, KeyError) as e:
                            logs.append(f"⚠️ **Matcher:** Parse error - {str(e)[:50]}")
                    else:
                        logs.append("⚠️ **Matcher:** Empty response after thinking")
                else:
                    logs.append(f"⚠️ **Matcher:** API status {response.status_code}")
                    
            except requests.exceptions.Timeout:
                logs.append("⚠️ **Matcher:** Timeout")
            except Exception as e:
                logs.append(f"⚠️ **Matcher:** Error - {str(e)[:50]}")
            
            return None

        # --- STEP 1: FETCH MARKETS FROM SLUG ---
        candidates = []
        event_title = ""
        
        try:
            conn = http.client.HTTPSConnection("gamma-api.polymarket.com")
            conn.request("GET", f"/events?slug={slug}", headers=ua_headers)
            res = conn.getresponse()
            
            if res.status == 200:
                data = json.loads(res.read().decode("utf-8"))
                if data:
                    event = data[0]
                    event_title = event.get("title", "")
                    markets = event.get("markets", [])
                    
                    logs.append(f"📊 **Scout:** Found event '{event_title}' with {len(markets)} market(s)")
                    
                    for m in markets:
                        q_title = m.get("groupItemTitle", m.get("question"))
                        full_label = f"{event_title}: {q_title}" if event_title and event_title not in str(q_title) else q_title
                        
                        outcomes = json.loads(m.get("outcomes", "[]"))
                        prices = json.loads(m.get("outcomePrices", "[]"))
                        
                        if not prices: 
                            continue

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
                                        "label": f"{event_title}: {out}",
                                        "price": float(prices[i]),
                                        "type": "Group"
                                    })
                                except: 
                                    pass
        except Exception as e:
            logs.append(f"❌ Fetch Error: {str(e)}")

        # --- STEP 2: SEMANTIC MATCHING ---
        selected = None
        
        if candidates:
            logs.append(f"🔍 **Scout:** Matching {len(candidates)} option(s) to query...")
            selected = semantic_match(candidates, user_query)
        
        # --- STEP 3: FALLBACK GLOBAL SEARCH ---
        if not selected:
            logs.append("🔄 **Scout:** No match from slug. Trying global search...")
            
            MAX_EVENTS = 10
            
            # Generate search terms from query
            query_words = user_query.lower().split()
            stop_words = {'how', 'likely', 'is', 'the', 'to', 'will', 'in', 'a', 'an', 'what', 'when', 'where', 'who', 'again', '?', 'does', 'do', 'can', 'could', 'would', 'should'}
            key_terms = [w for w in query_words if w not in stop_words and len(w) > 2]
            
            search_terms = []
            if slug and slug != "unknown":
                search_terms.append(slug.replace("-", " "))
            if key_terms:
                search_terms.append(" ".join(key_terms[:4]))
            
            search_terms = list(dict.fromkeys(search_terms))[:3]
            logs.append(f"🔍 **Scout:** Search terms: {search_terms}")

            for search_term in search_terms:
                if selected:
                    break
                    
                logs.append(f"🔎 **Scout:** Searching: '{search_term}'")
                try:
                    safe_query = urllib.parse.quote(search_term)
                    conn = http.client.HTTPSConnection("gamma-api.polymarket.com")
                    conn.request("GET", f"/events?limit={MAX_EVENTS}&closed=false&q={safe_query}", headers=ua_headers)
                    res = conn.getresponse()
                    
                    if res.status == 200:
                        events = json.loads(res.read().decode("utf-8"))
                        logs.append(f"📊 **Scout:** Found {len(events)} event(s)")
                        
                        # Collect all candidates from all events
                        all_candidates = []
                        for e in events[:5]:  # Limit to first 5 events
                            title = e.get("title", "")
                            markets = e.get("markets", [])
                            
                            for m in markets:
                                q = m.get("groupItemTitle", m.get("question"))
                                prices = json.loads(m.get("outcomePrices", "[]"))
                                outcomes = json.loads(m.get("outcomes", "[]"))
                                if not prices: 
                                    continue
                                
                                if len(outcomes) > 2:
                                    for i, out in enumerate(outcomes):
                                        all_candidates.append({
                                            "label": f"{title}: {out}",
                                            "price": float(prices[i]),
                                            "type": "Group"
                                        })
                                elif "Yes" in outcomes:
                                    all_candidates.append({
                                        "label": f"{title}: {q} (Yes)",
                                        "price": float(prices[0]),
                                        "type": "Binary"
                                    })
                        
                        if all_candidates:
                            logs.append(f"🔍 **Scout:** Evaluating {len(all_candidates)} total option(s)...")
                            selected = semantic_match(all_candidates[:20], user_query)  # Limit to 20 for API
                            
                except Exception as e:
                    logs.append(f"❌ **Scout:** Search error - {str(e)[:50]}")

        # --- RETURN RESULT ---
        if not selected:
            logs.append("❌ **Scout:** Could not find matching market.")
            return Data(data={
                "error": "No market found",
                "event": "Unknown Event",
                "market_implied_prob": 50.0,
                "slug": slug if slug else "unknown",
                "context": "No market found - using defaults",
                "logs": logs,
                "original_query": user_query
            })

        logs.append(f"🎯 **Scout:** Final selection: '{selected['label']}' @ {selected['price']*100:.1f}%")
        
        return Data(data={
            "event": selected['label'],
            "market_implied_prob": selected["price"] * 100,
            "slug": slug,
            "context": "Selected via semantic matching.",
            "logs": logs,
            "original_query": user_query
        })
