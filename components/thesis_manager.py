from langflow.custom import Component
from langflow.io import DataInput, Output
from langflow.schema import Data
import json
import os
from datetime import datetime
from pathlib import Path


class ThesisManager(Component):
    display_name = "Thesis Manager (Memory)"
    description = "Bayesian state management. READ mode loads previous thesis, WRITE mode saves new thesis."

    inputs = [
        DataInput(name="market_context", display_name="Market Data (from Scout)"),
        DataInput(name="research_result", display_name="New Analysis (Optional - for saving)"),
    ]

    outputs = [
        Output(display_name="Context with History", name="history_data", method="manage_state"),
    ]

    def _get_memory_file(self) -> Path:
        """Get path to memory file."""
        return Path(__file__).parent.parent / "agent_memory.json"

    def _load_history(self) -> dict:
        """Load history from memory file."""
        memory_file = self._get_memory_file()
        if not memory_file.exists():
            with open(memory_file, "w") as f:
                json.dump({}, f)
            return {}
        
        try:
            with open(memory_file, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}

    def _save_history(self, history: dict) -> None:
        """Save history to memory file."""
        memory_file = self._get_memory_file()
        with open(memory_file, "w") as f:
            json.dump(history, f, indent=2)

    def manage_state(self) -> Data:
        """
        Dual-mode operation:
        - WRITE MODE: If research_result is connected, save it to memory
        - READ MODE: If only market_context, load previous thesis and inject history_context
        """
        # Pass through skip marker
        if self.market_context and hasattr(self.market_context, 'data') and self.market_context.data.get("__skip__"):
            return Data(data={"__skip__": True, "logs": self.market_context.data.get("logs", [])})
        
        # Initialize
        history = self._load_history()
        
        # Handle missing input
        if not self.market_context:
            return Data(data={
                "error": "No market context provided",
                "logs": ["⚠️ **Memory:** No market context provided"]
            })
        
        # Unpack input
        slug = self.market_context.data.get("slug", "unknown")
        event_name = self.market_context.data.get("event", "Unknown Event")
        logs = self.market_context.data.get("logs", []).copy()
        original_query = self.market_context.data.get("original_query", "")

        # --- WRITE MODE ---
        # If research_result is connected and has data, we save it
        if self.research_result and self.research_result.data:
            new_prob = self.research_result.data.get("model_confidence")
            new_summary = self.research_result.data.get("research_summary", "")
            factor_data = self.research_result.data.get("factor_data", [])
            
            # Get previous probability for delta calculation
            prior_data = history.get(slug, {})
            prior_prob = prior_data.get("probability")
            
            # Calculate delta
            delta_text = ""
            if prior_prob is not None and new_prob is not None:
                delta = new_prob - prior_prob
                if abs(delta) >= 5:
                    delta_text = f" (Δ {delta:+.0f}% from previous)"
                    logs.append(f"📈 **Memory:** Probability changed: {prior_prob:.0f}% → {new_prob:.0f}%{delta_text}")
                else:
                    logs.append(f"📊 **Memory:** Probability stable at {new_prob:.0f}% (Δ {delta:+.0f}%)")
            
            # Save to history
            history[slug] = {
                "last_updated": datetime.now().isoformat(),
                "event_name": event_name,
                "probability": new_prob,
                "thesis": new_summary,
                "factors": factor_data,
                "query": original_query
            }
            
            self._save_history(history)
            logs.append(f"💾 **Memory:** Thesis saved for '{slug}'")
            
            # Pass through research result with updated logs
            output_data = self.research_result.data.copy()
            output_data["logs"] = logs
            output_data["delta_text"] = delta_text
            return Data(data=output_data)

        # --- READ MODE ---
        # Load previous thesis if exists
        prior_data = history.get(slug)
        
        if prior_data:
            last_prob = prior_data.get("probability")
            last_time = prior_data.get("last_updated", "Unknown")
            last_thesis = prior_data.get("thesis", "")
            last_factors = prior_data.get("factors", [])
            
            # Format time nicely
            try:
                dt = datetime.fromisoformat(last_time)
                time_ago = datetime.now() - dt
                if time_ago.days > 0:
                    time_str = f"{time_ago.days} day(s) ago"
                elif time_ago.seconds > 3600:
                    time_str = f"{time_ago.seconds // 3600} hour(s) ago"
                else:
                    time_str = f"{time_ago.seconds // 60} minute(s) ago"
            except (ValueError, TypeError):
                time_str = last_time
            
            # Build history context for the researcher
            history_text = (
                f"PREVIOUS ANALYSIS (Updated: {time_str}):\n"
                f"- Probability: {last_prob}%\n"
                f"- Thesis Summary: {last_thesis[:500]}{'...' if len(last_thesis) > 500 else ''}\n\n"
                f"INSTRUCTION: Apply Bayesian updating.\n"
                f"- INERTIA: If new evidence is noise/unchanged, keep the previous probability.\n"
                f"- PIVOT: Only change the probability if specific new facts materially alter the outlook.\n"
                f"- Always explain what changed (or didn't change) compared to the previous analysis."
            )
            
            logs.append(f"📜 **Memory:** Loaded previous thesis ({last_prob}%) from {time_str}")
            
        else:
            # No history - fresh analysis
            history_text = (
                "NO PREVIOUS ANALYSIS FOUND.\n"
                "Form a fresh thesis based on current evidence.\n"
                "This will become the baseline for future Bayesian updates."
            )
            logs.append(f"🆕 **Memory:** No history for '{slug}'. Starting fresh analysis.")

        # Inject history into the data object
        output_data = self.market_context.data.copy()
        output_data["history_context"] = history_text
        output_data["has_prior"] = prior_data is not None
        output_data["prior_probability"] = prior_data.get("probability") if prior_data else None
        output_data["logs"] = logs
        
        return Data(data=output_data)

