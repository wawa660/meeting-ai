from pydantic import BaseModel
from typing import List, Optional

class ActionItem(BaseModel):
    task: str
    owner: str
    deadline: str

class AnalysisResult(BaseModel):
    summary: str
    action_items: List[ActionItem]
    transcript: Optional[str] = None

class Transcript(BaseModel):
    text: str
