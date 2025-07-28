# GenAI Agentic Bot: The "Meeting AI"

## Overview

The **Meeting AI Agent** is an automated system designed to ingest raw meeting transcripts, analyze them using a Large Language Model (LLM), and produce structured, actionable outputs. The core function is to transform unstructured conversation into a concise summary and a clear list of tasks, complete with owners and deadlines, which can then be seamlessly shared across various collaboration platforms.

This agent operates by breaking down the problem into a sequence of specialized tasks: transcription, information extraction, summarization, and distribution.

-----

## System Architecture & Workflow

The architecture is designed as a modular pipeline, allowing for flexibility and scalability.

**High-Level Flow:**

`System Audio` → `Electron Frontend (Audio Capture)` → `Real-time Audio Stream (WebSocket)` → `Core Backend Agent (FastAPI)` → `Real-time Transcription Service` → `Raw Transcript Chunks` → `LLM for Incremental Analysis` → `Structured JSON Output (Summary & Action Items)` → `Electron Frontend (Display)` → `Database (Persistence)`

**Components:**

1.  **Electron Frontend:** The desktop application built with Electron, responsible for:
    *   Capturing system audio.
    *   **Buffering captured audio for replay and quality testing.**
    *   Establishing a WebSocket connection to the backend to stream audio.
    *   Displaying live transcripts, summaries, and action items.
    *   Providing a user interface for managing meetings and viewing historical data.
2.  **Core Backend Agent (Python/FastAPI):** This is the brains of the operation.
    *   Receives real-time audio streams from the Electron app via WebSocket.
    *   Forwards audio to a real-time transcription service.
    *   Receives transcript chunks from the transcription service.
    *   Orchestrates incremental calls to the LLM for analysis.
    *   Parses the LLM's structured output.
    *   Stores meeting data in the database.
    *   Streams analysis results back to the Electron frontend.
3.  **Real-time Transcription Service:** Utilizes a service like **AssemblyAI** or **Deepgram**. The key requirement is **speaker diarization**—accurately identifying *who* said *what* and when, in real-time.
4.  **LLM (Google Gemini 2.0 Flash):** Performs incremental analysis of transcript chunks to generate summaries and extract action items.
5.  **Database:** Persists meeting transcripts, summaries, and action items for historical viewing and management.

-----

## The Agentic LLM Workflow 🤖

The magic happens in how the agent prompts the LLM. Instead of a single, massive prompt, a more robust approach involves a chained or multi-step prompt strategy.

### Step 1: Pre-processing the Transcript

The raw transcript is cleaned and formatted slightly to be more LLM-friendly.

**Input Example:**

```
[00:01:15] [Speaker_A_Maria]: Okay team, let's sync on the Q3 launch. Where are we with the marketing assets?
[00:01:22] [Speaker_B_John]: I'm on it. The final designs should be ready for review by this Friday. I'll need final approval from Sarah before they go to print.
[00:01:35] [Speaker_C_Sarah]: Sounds good, John. I'll make sure to review them by end of day Friday. Let's have David take the lead on drafting the announcement blog post. He's the best writer we have.
[00:01:49] [Speaker_D_David]: I can handle that. I'll have a first draft ready for the team to review by our next call on Tuesday.
```

### Step 2: The Core LLM Prompt

The backend sends a detailed prompt to the LLM. The key is to ask for a structured JSON output, which is easy to parse.

> **System Prompt Example:**
>
> You are an expert AI assistant specializing in meeting analysis. Your task is to process a meeting transcript and extract critical information.
>
> Analyze the provided transcript, which includes speaker labels. The meeting took place on **Friday, July 25, 2025**.
>
> **Your instructions are:**
>
> 1.  **Generate a brief, executive-level summary** of the meeting's key decisions, conclusions, and main discussion points. Ignore pleasantries and off-topic conversations.
> 2.  **Extract all specific action items**. For each action item, you must identify:
>       * `task`: A clear and concise description of the task.
>       * `owner`: The name of the person assigned to the task. Infer this from the speaker labels and conversation context. If no one is assigned, state "Unassigned".
>       * `deadline`: The specific deadline for the task. Infer this from phrases like "by Friday", "end of day", "next week". Convert all relative dates to a specific `YYYY-MM-DD` format based on the meeting date. If no deadline is mentioned, state "Not specified".
>
> **Provide your final output in a single JSON object with two keys: "summary" and "action\_items".** The "action\_items" key should contain an array of objects.

### Step 3: Parsing the LLM's JSON Output

The backend receives a clean JSON response from the LLM.

**Expected JSON Output:**

```json
{
  "summary": "The team synchronized on the Q3 launch status. Key responsibilities for marketing assets and the announcement blog post were assigned. Final design approval processes and draft review timelines were established.",
  "action_items": [
    {
      "task": "Finalize marketing asset designs for review.",
      "owner": "John",
      "deadline": "2025-07-25"
    },
    {
      "task": "Review and provide final approval for marketing designs.",
      "owner": "Sarah",
      "deadline": "2025-07-25"
    },
    {
      "task": "Draft the announcement blog post.",
      "owner": "David",
      "deadline": "2025-07-29"
    }
  ]
}
```

### Step 4: Formatting and Distribution

The backend now uses this structured data to create human-readable messages for different platforms.

-----

## Proposed Tech Stack

  * **Backend:** **Python** with **FastAPI** – Excellent for async operations (calling external APIs) and the standard for ML/AI applications.
  * **LLM:** **Google Gemini 2.0 Flash** – Optimized for speed and cost-effectiveness in real-time applications.
  * **Transcription:** **AssemblyAI** or **Deepgram** – Services providing highly accurate real-time speaker diarization, crucial for ownership detection.
  * **Frontend (Desktop Application):** **Electron** – For building a cross-platform desktop application that can capture system audio and provide a rich user interface.
  * **System Audio Capture:** Leveraging Node.js capabilities within Electron to interact with native audio APIs or external tools like `ffmpeg`.
  * **Database:** A database (e.g., SQLite for prototyping) to persist meeting data (transcripts, summaries, action items).
  * **Integrations:**
      * **Email:** Standard SMTP libraries.

-----

## Example Output (Slack Message Format)

Here is how the final output would look when posted to a Slack channel.

**Meeting Summary: Q3 Launch Sync (2025-07-25)**

The team synchronized on the Q3 launch status. Key responsibilities for marketing assets and the announcement blog post were assigned. Final design approval processes and draft review timelines were established.

**Action Items ✅**

  * Finalize marketing asset designs for review.
      * **Owner**: **John**
      * **Deadline**: **Friday, July 25, 2025**
  * Review and provide final approval for marketing designs.
      * **Owner**: **Sarah**
      * **Deadline**: **Friday, July 25, 2025**
  * Draft the announcement blog post.
      * **Owner**: **David**
      * **Deadline**: **Tuesday, July 29, 2025**
