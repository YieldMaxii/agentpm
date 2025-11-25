from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import http.client
import json
import urllib.parse
import os
import re
import aiohttp
from dotenv import load_dotenv
from pathlib import Path
import datetime


class PolymarketScout(Component):
    display_name = "Polymarket Scout (Scope Guard)"
    description = "Finds the best matching Polymarket event for a user query. Uses Qwen for fast semantic matching."
    
    inputs = [
        DataInput(name="slug_input", display_name="Slug Data"),
    ]

    outputs = [
        Output(display_name="Market Data", name="market_data", method="fetch_data"),
    ]

    async def fetch_data(self) -> Data:
        logs = self.slug_input.data.get("logs", [])
        slug = self.slug_input.data.get("slug", "unknown")
        user_query = self.slug_input.data.get("original_query", "")
        
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        logs.append(f"🕒 **{timestamp}** - Scout Received: Slug='{slug}', Query='{user_query}'")
        
        env_path = Path(__file__).parent.parent / '.env'
        load_dotenv(dotenv_path=env_path)
        ua_headers = {"User-Agent": "Mozilla/5.0"}

        # --- HELPER: SEMANTIC MARKET MATCHER (Qwen - Fast & Cheap) ---
        async def semantic_match(candidates, user_query):
            """
            Uses Qwen to semantically match user intent to market options.
            Fast and cost-effective for simple selection tasks.
            """
            if not candidates:
                return None
            
            CHUTES_KEY = os.getenv("CHUTES_API_KEY")
            if not CHUTES_KEY:
                logs.append("⚠️ **Matcher:** No API key")
                return None
            
            # Build options list
            options_text = "\n".join([f"[{i}] {c['label']} (Current odds: {c['price']*100:.1f}%)" for i, c in enumerate(candidates)])
            
            prompt = f"""Match the user's question to the best market option.

USER QUESTION: "{user_query}"

AVAILABLE OPTIONS:
{options_text}

SEMANTIC EQUIVALENCES:
- "cut rates" / "lower rates" = "decrease" / "bps decrease"
- "raise rates" / "hike rates" = "increase" / "bps increase"  
- "hold" / "pause" = "unchanged"
- "win" / "victory" = team/candidate names
- "release" / "launch" = release date markets

OUTPUT JSON ONLY:
{{"match": true, "index": <number>, "reasoning": "<brief>"}} or {{"match": false, "reasoning": "<why>"}}"""

            url = "https://llm.chutes.ai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {CHUTES_KEY}",
                "Content-Type": "application/json"
            }
            body = {
                "model": "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
                "max_tokens": 200,
                "temperature": 0.1
            }
            
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, headers=headers, json=body) as response:
                        if response.status == 200:
                            full_content = ""
                            async for line in response.content:
                                line = line.decode("utf-8").strip()
                                if line.startswith("data: "):
                                    data = line[6:]
                                    if data == "[DONE]":
                                        break
                                    try:
                                        chunk = json.loads(data)
                                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                                        content = delta.get("content", "")
                                        full_content += content
                                    except json.JSONDecodeError:
                                        continue
                            
                            # Clean response
                            clean = full_content.strip()
                            clean = clean.replace("```json", "").replace("```", "").strip()
                            
                            # Remove think tags if present
                            if "</think>" in clean:
                                clean = clean.split("</think>", 1)[-1].strip()
                            
                            if clean:
                                # Extract JSON
                                json_match = re.search(r"\{.*\}", clean, re.DOTALL)
                                if json_match:
                                    result = json.loads(json_match.group(0))
                                    
                                    if result.get("match") and "index" in result:
                                        idx = int(result["index"])
                                        if 0 <= idx < len(candidates):
                                            reasoning = result.get("reasoning", "Semantic match")
                                            logs.append(f"✅ **Qwen Match:** Index {idx} - {reasoning}")
                                            return candidates[idx]
                                    else:
                                        reasoning = result.get("reasoning", "No match found")
                                        logs.append(f"❌ **Matcher:** {reasoning}")
                        else:
                            logs.append(f"⚠️ **Matcher:** API status {response.status}")
                            
            except aiohttp.ClientTimeout:
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
            selected = await semantic_match(candidates, user_query)
        
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
                            selected = await semantic_match(all_candidates[:20], user_query)  # Limit to 20 for API
                            
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
