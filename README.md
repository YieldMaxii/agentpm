# AgentPM: AI-Powered Polymarket Research Bot

## Overview
AgentPM is a sophisticated LangFlow-based application designed to analyze prediction markets on Polymarket. It uses a multi-stage pipeline to scout markets, define success conditions, conduct deep recursive research using Perplexity AI, and calculate "Fair Value" probabilities to identify trading edges.

## Pipeline Architecture

The system operates through a linear pipeline of custom LangFlow components:

### 1. Market Resolver (`components/market_resolver.py`)
- **Role:** Entry point.
- **Function:** Takes a user's natural language query (e.g., *"Will the Fed cut rates in December?"*) and resolves it to the most relevant Polymarket Event Group URL.
- **Logic:** Uses Perplexity to intelligently distinguish between broad queries (requiring event groups) and specific side-bets. It prioritizes "Parent" markets to ensure the analysis covers the main event.

### 2. Polymarket Scout (`components/polymarket_scout.py`)
- **Role:** Data Acquisition & Scope Guard.
- **Function:** Fetches live market data from the Polymarket Gamma API.
- **Logic:** 
    - Implements a **"Strict AI Judge"** to verify that the found market matches the user's intent (e.g., rejecting *"Will GTA 6 trailer release?"* if the user asked *"Will GTA 6 release?"*).
    - Performs a **"Smart Global Search"** if the initial match is poor, generating search variations and filtering results by relevance.

### 3. Strategy Planner (`components/strategy_planner.py`)
- **Role:** Research Architect.
- **Function:** Defines the "Game Plan" for analysis.
- **Logic:** Analyzes the market to determine:
    - **Success Condition:** The exact criteria for a "YES" outcome to prevent logic inversion.
    - **Key Factors:** 5-7 critical variables driving the outcome (Fundamental, Technical, Sentiment, Macro).

### 4. Recursive Researcher (`components/recursive_researcher.py`)
- **Role:** Deep Analysis & Synthesis.
- **Function:** Executes the research plan.
- **Logic:**
    - **Phase 1 (Search):** Queries Perplexity 'sonar' for evidence on each Key Factor defined by the Planner.
    - **Phase 2 (Synthesis):** Uses a **Quantitative Weighted Factor Model** to assign weights (0-10) and scores (-10 to +10) to each factor, deriving a "Fair Value Probability".
    - **Phase 3 (Self-Correction):** If data is insufficient, it triggers a gap-fill search and recalculates the probability.

### 5. Alpha Detector (`components/arbitrage_calculator.py`)
- **Role:** Decision Engine.
- **Function:** Compares Market Odds vs. AI Fair Value.
- **Logic:** 
    - Calculates the **"Edge"** (Model Odds - Market Odds).
    - Generates a final report with a **Buy/Hold/Sell** signal.
    - Renders a detailed markdown table of the First Principles Analysis and a collapsible section for the agent's thought process.

## Auxiliary Components

- **Correlation Scout (`components/correlation_scout.py`)**: Finds related markets to build a macro view (e.g., if analyzing *"Bitcoin > $100k"*, it finds *"Ethereum > $5k"*).
- **Deep Researcher (`components/perplexity_researcher.py`)**: A streamlined researcher node for quick, non-recursive analysis using the 'sonar' model.

## Setup & Requirements

### 1. Dependencies
Install the required packages:
```bash
pip install -r requirements.txt
```

### 2. Environment Variables
Create a `.env` file in the root directory:
```env
PERPLEXITY_API_KEY=your_api_key_here
```

### 3. Usage
1. Import the components into your LangFlow workspace.
2. Connect them in the order: **Resolver -> Scout -> Planner -> Researcher -> Calculator**.
3. Input a query into the **Market Resolver** to start the pipeline.

---
*AgentPM v2.1*
