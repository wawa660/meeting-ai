import os
import google.generativeai as genai
import assemblyai as aai
from fastapi import FastAPI, HTTPException, UploadFile, File
from models import Transcript, AnalysisResult, ActionItem
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

# Configure the Gemini API key
# IMPORTANT: Replace "YOUR_API_KEY" with your actual Google AI API key
# For production, use a secure method like environment variables or a secret manager
try:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]
except KeyError:
    raise HTTPException(status_code=500, detail="API keys not found in environment variables or .env file. Please set GEMINI_API_KEY and ASSEMBLYAI_API_KEY.")

# Initialize the Gemini model
model = genai.GenerativeModel('gemini-2.0-flash')

@app.post("/analyze", response_model=AnalysisResult)
async def analyze_audio(audio_file: UploadFile = File(...)):
    """
    Transcribes an audio file and then analyzes the transcript to generate a summary and extract action items.
    """
    try:
        # Save the uploaded audio file temporarily
        file_location = f"/tmp/{audio_file.filename}"
        with open(file_location, "wb") as file_object:
            file_object.write(audio_file.file.read())

        # Transcribe the audio file using AssemblyAI
        transcriber = aai.Transcriber()
        transcript_aai = transcriber.transcribe(file_location)

        if transcript_aai.text:
            transcript_text = transcript_aai.text
        else:
            raise HTTPException(status_code=500, detail="Failed to transcribe audio.")

        # Clean up the temporary file
        os.remove(file_location)

    except Exception as e:
        import traceback
        traceback.print_exc() # This will print the full traceback to the console
        raise HTTPException(status_code=500, detail=f"Audio transcription failed: {e}")

    prompt = f"""
    You are an expert AI assistant specializing in meeting analysis. Your task is to process a meeting transcript and extract critical information.

    Analyze the provided transcript, which includes speaker labels. The meeting took place on Friday, July 25, 2025.

    Your instructions are:

    1.  **Generate a brief, executive-level summary** of the meeting's key decisions, conclusions, and main discussion points. Ignore pleasantries and off-topic conversations.
    2.  **Extract all specific action items**. For each action item, you must identify:
        * `task`: A clear and concise description of the task.
        * `owner`: The name of the person assigned to the task. Infer this from the speaker labels and conversation context. If no one is assigned, state "Unassigned".
        * `deadline`: The specific deadline for the task. Infer this from phrases like "by Friday", "end of day", "next week". Convert all relative dates to a specific `YYYY-MM-DD` format based on the meeting date. If no deadline is mentioned, state "Not specified".

    Provide your final output in a single JSON object with two keys: "summary" and "action_items". The "action_items" key should contain an array of objects.

    Transcript:
    {transcript_text}
    """

    try:
        response = model.generate_content(prompt)
        import json
        import re

        # Extract JSON string from markdown code block
        match = re.search(r"```json\n(.*?)```", response.text, re.DOTALL)
        if match:
            json_string = match.group(1)
        else:
            # If no markdown block, assume it's raw JSON (for robustness)
            json_string = response.text

        result = json.loads(json_string)
        result['transcript'] = transcript_text
        return AnalysisResult(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze transcript: {e}")

