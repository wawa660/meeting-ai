import os
import google.generativeai as genai
import assemblyai as aai
import asyncio
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from models import Transcript, AnalysisResult, ActionItem

app = FastAPI()

# Configure the Gemini API key
# IMPORTANT: Replace "YOUR_API_KEY" with your actual Google AI API key
# For production, use a secure method like environment variables or a secret manager
try:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    aai.api_key = os.environ["ASSEMBLYAI_API_KEY"]
except KeyError:
    # This is a fallback for local development and not recommended for production
    # Create a .env file in the backend directory with the line:
    # GEMINI_API_KEY="your_api_key_here"
    # ASSEMBLYAI_API_KEY="your_assemblyai_api_key_here"
    from dotenv import load_dotenv
    load_dotenv()
    if "GEMINI_API_KEY" in os.environ and "ASSEMBLYAI_API_KEY" in os.environ:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        aai.api_key = os.environ["ASSEMBLYAI_API_KEY"]
    else:
        print("API keys not found in environment variables or .env file.")
        # You might want to handle this more gracefully
        # For now, we'll let it raise an exception if the key is not found

# Initialize the Gemini model
model = genai.GenerativeModel('gemini-2.0-flash')

@app.websocket("/ws/audio")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        # Initialize AssemblyAI Realtime Transcriber
        # You might want to configure sample_rate, word_boost, etc.
        transcriber = aai.RealtimeTranscriber()
        await transcriber.connect()

        print("AssemblyAI Realtime Transcriber connected.")

        async def send_audio_to_aai():
            print("Starting send_audio_to_aai task.")
            while True:
                try:
                    print("Backend: Waiting for audio data...")
                    data = await websocket.receive_bytes()
                    print(f"Backend: Received {len(data)} bytes from Electron. First 10 bytes: {data[:10].hex()}") # Log first 10 bytes
                    await transcriber.stream(data)
                except WebSocketDisconnect:
                    print("Backend: Client disconnected from audio stream.")
                    break
                except Exception as e:
                    print(f"Backend: Error receiving audio from client or sending to AAI: {e}")
                    break
            print("send_audio_to_aai task finished.")

        async def receive_transcripts_from_aai():
            print("Starting receive_transcripts_from_aai task.")
            try:
                async for transcript in transcriber.listen():
                    if transcript.text:
                        print(f"Backend: Received transcript from AAI: {transcript.text}")
                        # Send transcript back to Electron app
                        await websocket.send_json({"type": "transcript", "content": transcript.text})
                        # TODO: Integrate LLM for summary and action items here
                        # For now, just sending transcript
            except Exception as e:
                print(f"Backend: Error receiving transcripts from AAI: {e}")
            print("receive_transcripts_from_aai task finished.")

        # Run both tasks concurrently
        await asyncio.gather(send_audio_to_aai(), receive_transcripts_from_aai())

    except WebSocketDisconnect:
        print("Backend: Client disconnected from WebSocket.")
    except Exception as e:
        print(f"Backend: WebSocket error: {e}")
    finally:
        if 'transcriber' in locals() and transcriber.is_connected:
            await transcriber.close()
            print("Backend: AssemblyAI Realtime Transcriber closed.")

@app.post("/analyze", response_model=AnalysisResult)
async def analyze_transcript(transcript: Transcript):
    """
    Analyzes a meeting transcript to generate a summary and extract action items.
    """
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
    {transcript.text}
    """

    try:
        response = await model.generate_content_async(prompt)
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
        return AnalysisResult(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze transcript: {e}")

