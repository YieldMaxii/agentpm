import json
import re
from components.polymarket_scout import PolymarketScout
from components.strategy_planner import StrategyPlanner
from langflow.io import DataInput
from langflow.schema import Data

def clean_json(content):
    # Replicating the logic added to the components
    if content:
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        content = content.replace("```json", "").replace("```", "").strip()
        
        try:
            start_idx = content.find('{')
            end_idx = content.rfind('}')
            if start_idx != -1 and end_idx != -1:
                content = content[start_idx:end_idx+1]
            return json.loads(content)
        except json.JSONDecodeError:
            return None
    return None

def test_json_cleaning():
    print("Testing JSON Cleaning Logic...")
    
    # Case 1: Clean JSON
    case1 = '{"match_found": true}'
    assert clean_json(case1) == {"match_found": True}, "Failed Case 1"
    
    # Case 2: DeepSeek Think Tags
    case2 = '<think>Thinking...</think> {"match_found": true}'
    assert clean_json(case2) == {"match_found": True}, "Failed Case 2"
    
    # Case 3: Markdown Blocks
    case3 = '```json\n{"match_found": true}\n```'
    assert clean_json(case3) == {"match_found": True}, "Failed Case 3"
    
    # Case 4: Extra Text
    case4 = 'Here is the json: {"match_found": true} Hope it helps.'
    assert clean_json(case4) == {"match_found": True}, "Failed Case 4"
    
    print("✓ JSON Cleaning Logic Verified")

def test_planner_missing_data():
    print("\nTesting Planner Missing Data...")
    planner = StrategyPlanner()
    
    # Create dummy input with missing event/slug
    mock_data = Data(data={"logs": [], "original_query": "test"})
    planner.market_context = mock_data # Simulate input
    
    # We need to mock the input object structure that Langflow uses
    # But for direct component testing, we might need to adjust how we invoke it.
    # In the component code:
    # logs = self.market_context.data.get("logs", [])
    # event = self.market_context.data.get("event")
    
    result = planner.generate_plan()
    data = result.data
    
    if data.get("research_plan", {}).get("error") == "No market found":
        print("✓ Planner correctly handled missing market data")
    else:
        print(f"✗ Planner failed to handle missing data: {data}")

if __name__ == "__main__":
    test_json_cleaning()
    test_planner_missing_data()

