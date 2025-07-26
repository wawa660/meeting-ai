from pydantic import BaseModel
from typing import List

class ActionItem(BaseModel):
    task: str
    owner: str
    deadline: str

class AnalysisResult(BaseModel):
    summary: str
    action_items: List[ActionItem]

class Transcript(BaseModel):
    text: str
