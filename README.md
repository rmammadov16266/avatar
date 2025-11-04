# Voice Bot - AI Voice Assistant

A web application that allows you to interact with an AI assistant using voice. Speak to it, and it will respond with both text and voice.

## Features

- 🎤 **Voice Recording**: Record your voice using the microphone
- 🗣️ **Speech-to-Text**: Transcribe audio using OpenAI Whisper
- 💬 **AI Chat**: Get intelligent responses using GPT-4o-mini
- 🔊 **Text-to-Speech**: Listen to responses using OpenAI TTS

## Tech Stack

### Backend
- FastAPI
- OpenAI API (Whisper, GPT-4o-mini, TTS)
- Python 3.8+

### Frontend
- React 18
- Tailwind CSS
- Axios
- Sonner (Toast notifications)
- Lucide React (Icons)

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file:
   ```bash
   OPENAI_API_KEY=your-openai-api-key-here
   ```

5. Run the server:
   ```bash
   uvicorn server:app --reload --port 8000
   ```

The backend will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file (optional, defaults to localhost:8000):
   ```bash
   REACT_APP_API_URL=http://localhost:8000/api
   ```

4. Start the development server:
   ```bash
   npm start
   ```

The frontend will be available at `http://localhost:3000`

## Usage

1. Make sure both backend and frontend servers are running
2. Open your browser and go to `http://localhost:3000`
3. Click the microphone button to start recording
4. Speak your message
5. Click the microphone button again to stop recording
6. The app will:
   - Transcribe your audio
   - Get an AI response
   - Play the response as audio

## API Endpoints

- `POST /api/transcribe` - Transcribe audio file
- `POST /api/chat` - Get AI chat response
- `POST /api/speak` - Convert text to speech

## Requirements

- Python 3.8 or higher
- Node.js 16 or higher
- OpenAI API key
- Microphone access (for voice recording)

