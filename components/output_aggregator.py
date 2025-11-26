from langflow.custom import Component
from langflow.io import MessageInput, Output
from langflow.schema import Message


class OutputAggregator(Component):
    display_name = "Output Aggregator"
    description = "Combines outputs from QuickAnswer and AlphaDetector. Returns whichever path produced a real result (ignores __SKIP__ markers)."

    inputs = [
        MessageInput(name="quick_answer", display_name="Quick Answer (SIMPLE path)"),
        MessageInput(name="deep_answer", display_name="Deep Answer (COMPLEX path)"),
    ]

    outputs = [
        Output(display_name="Final Output", name="final_output", method="aggregate"),
    ]

    def aggregate(self) -> Message:
        """Return whichever input has valid data (not a skip marker)."""
        
        # Check Quick Answer path
        if self.quick_answer:
            text = None
            if hasattr(self.quick_answer, 'text'):
                text = self.quick_answer.text
            
            # Return if valid (not a skip marker)
            if text and text != "__SKIP__":
                return Message(text=text)
        
        # Check Deep Answer path
        if self.deep_answer:
            text = None
            if hasattr(self.deep_answer, 'text'):
                text = self.deep_answer.text
            
            # Return if valid (not a skip marker)
            if text and text != "__SKIP__":
                return Message(text=text)
        
        # Fallback if both are None or skip markers
        return Message(text="⚠️ No response received from either path. Please try again.")
