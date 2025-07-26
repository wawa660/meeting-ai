# backend/main.py

import os
import google.generativeai as genai
import assemblyai as aai
import asyncio
import json
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from models import Transcript, AnalysisResult, ActionItem
from datetime import datetime
import functools
from dotenv import load_dotenv # Import load_dotenv

app = FastAPI()

# Configure the API keys to read from .env file first
try:
    load_dotenv() # Load environment variables from .env file

    gemini_api_key = os.getenv("GEMINI_API_KEY")
    assemblyai_api_key = os.getenv("ASSEMBLYAI_API_KEY")

    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY not found. Please set it in your .env file or environment variables.")
    if not assemblyai_api_key:
        raise ValueError("ASSEMBLYAI_API_KEY not found. Please set it in your .env file or environment variables.")

    genai.configure(api_key=gemini_api_key)
    aai.api_key = assemblyai_api_key

except Exception as e:
    # Minimal error reporting here after attempting to load
    raise RuntimeError(f"Failed to configure API keys: {e}. Ensure they are set in your .env file or shell environment.")

model = genai.GenerativeModel('gemini-2.0-flash')

full_transcript_buffer = []


@app.post("/analyze")
async def analyze_endpoint(transcript: Transcript):
    """
    HTTP endpoint to trigger analysis of a provided transcript.
    """
    return await analyze_transcript_data(transcript.text)


async def analyze_transcript_data(transcript_text: str):
    """
    Helper function to perform Gemini analysis on a given transcript text.
    """
    current_date = datetime.now().strftime("%Y-%m-%d")

    prompt = f"""
    You are an AI assistant designed to summarize meeting transcripts and extract action items.
    Follow these rules strictly:

    1.  **Summarize the entire transcript** concisely, covering all key decisions, reasons, and main discussion points. Ignore pleasantries and off-topic conversations.
    2.  **Extract all specific action items**. For each action item, you must identify:
        * `task`: A clear and concise description of the task.
        * `owner`: The name of the person assigned to the task. Infer this from the speaker labels and conversation context. If no one is assigned, state "Unassigned".
        * `deadline`: The specific deadline for the task. Infer this from phrases like "by Friday", "end of day", "next week". Convert all relative dates to a specific `YYYY-MM-DD` format based on the meeting date ({current_date}). If no deadline is mentioned, state "Not specified".

    Provide your final output in a single JSON object with two keys: "summary" and "action_items". The "action_items" key should contain an array of objects.

    Transcript:
    {transcript_text}
    """

    try:
        response = await model.generate_content_async(prompt)
        import re

        match = re.search(r"```json\n(.*?)```", response.text, re.DOTALL)
        if match:
            json_string = match.group(1)
        else:
            json_string = response.text

        result = json.loads(json_string)
        analysis_result = AnalysisResult(**result)
        return analysis_result

    except json.JSONDecodeError as e:
        print(f"JSON Decode Error: {e} - Response text: {response.text}")
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response JSON: {e}")
    except Exception as e:
        print(f"Error during AI analysis: {e} - Response text (if available): {getattr(response, 'text', 'N/A')}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze transcript: {e}")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global full_transcript_buffer
    await websocket.accept()
    print("WebSocket client connected at /ws.")

    full_transcript_buffer = []

    current_loop = asyncio.get_running_loop()

    async def on_data_handler(data: bytes):
        pass

    async def on_partial_handler(transcript: aai.RealtimeTranscript):
        if transcript.text:
            await websocket.send_json({"type": "transcript", "data": transcript.text})

    async def on_final_handler(transcript: aai.RealtimeTranscript):
        if transcript.text:
            full_transcript_buffer.append(transcript.text)
            await websocket.send_json({"type": "transcript", "data": transcript.text})
            print(f"Received final transcript chunk: {transcript.text}")

    def on_error_handler(error: aai.RealtimeError):
        print(f"AssemblyAI Realtime Error: {error}")
        async def send_error_to_websocket():
            try:
                await websocket.send_json({"type": "error", "data": str(error)})
            except Exception as e:
                print(f"Error sending error message to WebSocket: {e}")

        current_loop.call_soon_threadsafe(
            lambda: asyncio.create_task(send_error_to_websocket())
        )

    def on_close_handler():
        print("AssemblyAI Realtime Transcriber connection closed.")

    transcriber = None
    try:
        if aai.api_key:
            transcriber = aai.RealtimeTranscriber(
                sample_rate=16000,
                on_data=on_data_handler,
                on_error=on_error_handler,
                # REMOVED: model='universal-streaming' - This is the change from before
            )
            transcriber.on_partial_transcript = on_partial_handler
            transcriber.on_final_transcript = on_final_handler
            transcriber.on_close = on_close_handler

            transcriber.connect()
            print("AssemblyAI RealtimeTranscriber connected to AAI.")

            while True:
                try:
                    audio_chunk = await websocket.receive_bytes()
                    transcriber.stream(audio_chunk)

                except WebSocketDisconnect:
                    print("WebSocket disconnected (client initiated).")
                    break
                except RuntimeError as e:
                    if "WebSocket is not connected" in str(e):
                        print("WebSocket already disconnected (server-side check).")
                        break
                    raise e
                except Exception as e:
                    print(f"Error receiving audio via WebSocket: {e}")
                    break

        else:
            await websocket.send_json({"type": "error", "data": "AssemblyAI API key not configured. Cannot transcribe."})
            print("AssemblyAI API key not configured for real-time transcription.")

    except WebSocketDisconnect:
        print("WebSocket client disconnected gracefully.")
    except Exception as e:
        print(f"An unexpected error occurred in WebSocket endpoint: {e}")
        await websocket.send_json({"type": "error", "data": f"Server error: {e}"})
    finally:
        if transcriber:
            transcriber.close()
            print("AssemblyAI RealtimeTranscriber closed in finally block.")
        
        if full_transcript_buffer:
            final_transcript_text = " ".join(full_transcript_buffer)
            print(f"Collected final transcript ({len(final_transcript_text)} chars). Triggering final analysis...")
            try:
                analysis_result = await analyze_transcript_data(final_transcript_text)
                await websocket.send_json({"type": "summary", "data": analysis_result.summary})
                await websocket.send_json({"type": "action_items", "data": [item.dict() for item in analysis_result.action_items]})
                print("Analysis results (summary, action items) sent to client.")
            except Exception as e:
                print(f"Error during final analysis and sending results: {e}")
                await websocket.send_json({"type": "error", "data": f"Analysis failed: {e}"})
        else:
            print("No full transcript collected to analyze.")