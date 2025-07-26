import asyncio
import os
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from deepgram import (
    DeepgramClient,
    DeepgramClientOptions,
    LiveTranscriptionEvents,
    LiveOptions,
)
from starlette.websockets import WebSocketState
import json # Import json for parsing incoming messages

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI app
app = FastAPI()

# Configure Deepgram client
config: DeepgramClientOptions = DeepgramClientOptions(
    verbose=os.getenv("DEEPGRAM_VERBOSE", "false").lower() == "true",
    options={ "keepalive": "true" }
)

deepgram_client = DeepgramClient(os.getenv("DEEPGRAM_API_KEY"), config)

# List to keep track of active WebSocket connections (though only one is expected for this app)
active_connections: list[WebSocket] = []

# Placeholder for LLM integration
# Replace this with your actual Gemini/other LLM API calls
async def analyze_transcript(transcript_text: str):
    """
    Simulates sending the full transcript to an LLM for summarization and
    action item extraction.
    """
    print(f"Simulating analysis for: {transcript_text[:100]}...") # Print first 100 chars
    await asyncio.sleep(2) # Simulate network delay for LLM processing

    # In a real application, you would make an API call to your LLM here
    # For example, using Google's Gemini API client:
    # from google.generativeai import GenerativeModel
    # model = GenerativeModel('gemini-pro')
    # response = model.generate_content(f"Summarize and extract action items from this meeting transcript: {transcript_text}")
    # summary = response.candidates[0].content.parts[0].text
    # action_items = extract_action_items_from_llm_response(response) # You'd need a function to parse this

    # Return mock data for now
    return {
        "summary": f"This is a summary of the meeting: '{transcript_text}'",
        "action_items": [
            "Action item 1: Review project status",
            "Action item 2: Schedule follow-up meeting"
        ]
    }

async def process_audio(websocket: WebSocket):
    """
    Handles the WebSocket connection for receiving audio, sending to Deepgram,
    and processing Deepgram responses.
    """
    full_transcript_collected = False
    full_transcript_parts = []
    recording_active = True # Flag to control the audio reception loop

    try:
        print("Deepgram Realtime Transcriber connected to Deepgram.")
        dg_connection = deepgram_client.listen.asynclive.v("1")

        # Define Deepgram event handlers
        async def on_message(self, result, **kwargs):
            nonlocal full_transcript_collected # Allow modification of outer scope variable
            sentence = result.channel.alternatives[0].transcript

            if len(sentence) == 0:
                return

            if result.is_final:
                full_transcript_parts.append(sentence)
                print(f"Received FINAL transcript chunk: {sentence}")
                # Send final transcript to frontend if WebSocket is still open
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json({"type": "transcript", "data": sentence})
                else:
                    print("WebSocket already disconnected, cannot send final transcript chunk.")
                full_transcript_collected = True
            else:
                print(f"Received PROVISIONAL transcript: {sentence}")
                # Send provisional transcript to frontend if WebSocket is still open
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json({"type": "transcript", "data": sentence})
                else:
                    print("WebSocket already disconnected, cannot send provisional transcript.")

        async def on_metadata(self, metadata, **kwargs):
            print(f"Received metadata: {metadata}")

        async def on_speech_started(self, speech_started, **kwargs):
            print("Deepgram has started detecting speech.")

        async def on_error(self, error, **kwargs):
            print(f"Deepgram error: {error}")
            # Send Deepgram error to frontend if WebSocket is still open
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json({"type": "error", "data": f"Deepgram Error: {str(error)}"})
            else:
                print("WebSocket already disconnected, cannot send Deepgram error.")

        async def on_close(self, *args, **kwargs):
            print(f"Deepgram connection closed. Args: {args}, Kwargs: {kwargs}")

        # Register Deepgram event handlers
        dg_connection.on(LiveTranscriptionEvents.Transcript, on_message)
        dg_connection.on(LiveTranscriptionEvents.Metadata, on_metadata)
        dg_connection.on(LiveTranscriptionEvents.SpeechStarted, on_speech_started)
        dg_connection.on(LiveTranscriptionEvents.Error, on_error)
        dg_connection.on(LiveTranscriptionEvents.Close, on_close)

        # Deepgram Live Transcription options
        options = LiveOptions(
            smart_format=True,
            language="en-US",
            encoding="linear16",
            sample_rate=16000,   # MUST match frontend audio capture sample rate
            channels=1,
            interim_results=True,
            punctuate=True,
            model="nova-2"
        )

        print("Deepgram connection started.")
        await dg_connection.start(options)

        try:
            # Loop to receive data from the frontend WebSocket
            while recording_active:
                message = await websocket.receive()
                if message["type"] == "websocket.receive":
                    # Check if the message contains binary (audio) data
                    if "bytes" in message:
                        data = message["bytes"]
                        await dg_connection.send(data)
                    # Check if the message contains text (JSON signal) data
                    elif "text" in message:
                        try:
                            text_data = message["text"]
                            json_message = json.loads(text_data)
                            if json_message.get("type") == "stop_recording":
                                print("Received stop_recording signal from frontend.")
                                recording_active = False # Set flag to exit the loop
                                # No need for break here, loop will naturally exit
                        except json.JSONDecodeError:
                            print(f"Received non-JSON text message: {text_data}")
                        except Exception as e:
                            print(f"Error processing text message: {e}")
                elif message["type"] == "websocket.disconnect":
                    print("WebSocket disconnected (client initiated).")
                    recording_active = False # Exit loop if client disconnects
                    # No need for break here, loop will naturally exit
        except WebSocketDisconnect:
            print("WebSocket disconnected (client initiated, outside explicit stop).")
            recording_active = False
        except Exception as e:
            print(f"Error receiving audio from client: {e}")
            # Send error to frontend if WebSocket is still open
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json({"type": "error", "data": f"Backend audio reception error: {str(e)}"})
            recording_active = False # Ensure loop stops on any error
        finally:
            print("Deepgram connection finished in finally block.")
            await dg_connection.finish() # Ensure Deepgram connection is properly closed

            # Analyze transcript if a full one was collected and parts exist
            if full_transcript_collected and full_transcript_parts:
                print("Full transcript collected. Analyzing...")
                final_transcript_text = " ".join(full_transcript_parts)
                print(f"Final Transcript for analysis: {final_transcript_text}")
                
                # Perform LLM analysis (this is where the real work happens)
                analysis_result = await analyze_transcript(final_transcript_text)

                # Send summary and action items back to the frontend
                # IMPORTANT: Check WebSocket state BEFORE sending to avoid errors on quick disconnects
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json({"type": "summary", "data": analysis_result["summary"]})
                    await websocket.send_json({"type": "action_items", "data": analysis_result["action_items"]})
                else:
                    print("WebSocket already disconnected, cannot send summary/action items.")
            else:
                print("No full transcript collected to analyze.")

    except Exception as e:
        # Catch any errors during the overall setup or main loop of process_audio
        print(f"Error in process_audio setup or outer loop: {e}")
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.send_json({"type": "error", "data": f"Backend internal error: {str(e)}"})

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Establishes the WebSocket connection and manages its lifecycle.
    """
    await websocket.accept()
    active_connections.append(websocket)
    print(f"WebSocket client connected at /ws.")
    try:
        await process_audio(websocket) # Hand off to the audio processing function
    except WebSocketDisconnect:
        print("connection closed by client.")
    except Exception as e:
        print(f"An unexpected error occurred in websocket_endpoint: {e}")
    finally:
        # Clean up connection
        if websocket in active_connections:
            active_connections.remove(websocket)
        print(f"WebSocket client disconnected from /ws.")

@app.get("/")
async def read_root():
    """
    Simple HTTP GET endpoint for checking if the backend is running.
    """
    return {"message": "Meeting AI Backend is running"}