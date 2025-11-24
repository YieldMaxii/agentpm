import os
import json
from dotenv import load_dotenv
from langflow.schema import Data
from components.strategy_planner import StrategyPlanner
from components.polymarket_scout import PolymarketScout
from components.recursive_researcher import RecursiveResearcher

# Load env
load_dotenv()

def test_strategy_planner():
    print("\n--- Testing StrategyPlanner (DeepSeek) ---")
    planner = StrategyPlanner()
    
    # Mock Input
    mock_data = Data(data={
        "event": "Grand Theft Auto VI Release Date",
        "slug": "gta-6-release-date",
        "original_query": "Will GTA 6 release in 2025?",
        "logs": []
    })
    planner.market_context = mock_data
    
    # Run
    result = planner.generate_plan()
    
    # Verify
    plan = result.data.get("research_plan", {})
    logs = result.data.get("logs", [])
    
    print(f"Success Condition: {plan.get('success_condition')}")
    print(f"Factors Found: {len(plan.get('factors', []))}")
    # print("Logs:")
    # for log in logs:
    #     print(log)
    return result

def test_recursive_researcher(plan_data):
    print("\n--- Testing RecursiveResearcher (DeepSeek Loop) ---")
    researcher = RecursiveResearcher()
    
    # Input from Planner
    researcher.plan_input = plan_data
    
    # Run
    result = researcher.execute_research()
    
    # Verify
    summary = result.data.get("research_summary", "")
    confidence = result.data.get("model_confidence", 0)
    logs = result.data.get("logs", [])
    
    print(f"Confidence: {confidence}%")
    print(f"Summary Start: {summary[:100]}...")
    print("Logs (Last 10):")
    for log in logs[-10:]:
        print(log)

if __name__ == "__main__":
    plan_result = test_strategy_planner()
    test_recursive_researcher(plan_result)
