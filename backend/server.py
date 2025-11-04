from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from openai import OpenAI
import io
import json
import websockets
import asyncio

# Load environment variables
ROOT_DIR = Path(__file__).parent
env_path = ROOT_DIR / '.env'
# Load .env file - override=True to ensure it loads even if variables exist
load_dotenv(env_path, override=False)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Check if .env file exists
if env_path.exists():
    logger.info(f"✅ Found .env file at: {env_path}")
else:
    logger.warning(f"⚠️  .env file not found at: {env_path}")

# OpenAI client
api_key = os.environ.get('OPENAI_API_KEY')
if not api_key:
    # Try reading directly from file as fallback
    if env_path.exists():
        try:
            # Try multiple encodings
            for encoding in ['utf-8', 'utf-8-sig', 'latin-1']:
                try:
                    with open(env_path, 'r', encoding=encoding) as f:
                        content = f.read()
                        # Try splitting by both \n and \r\n
                        lines = content.replace('\r\n', '\n').split('\n')
                        for line in lines:
                            line = line.strip()
                            # Skip comments and empty lines
                            if line and not line.startswith('#'):
                                if line.startswith('OPENAI_API_KEY='):
                                    api_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                                    if api_key:
                                        logger.info(f"✅ Loaded API key from .env file (encoding: {encoding})")
                                        break
                        if api_key:
                            break
                except UnicodeDecodeError:
                    continue
        except Exception as e:
            logger.error(f"Error reading .env file: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
    # Only show warning if we couldn't load from .env file either
    if not api_key:
        logger.warning("⚠️  OPENAI_API_KEY not found in environment variables or .env file!")
    
if not api_key:
    logger.error("❌ OPENAI_API_KEY still not found! Please check backend/.env file")
    logger.error(f"File exists: {env_path.exists()}, Path: {env_path}")
    if env_path.exists():
        try:
            with open(env_path, 'rb') as f:
                raw_content = f.read()
                logger.error(f"File content (first 100 bytes): {raw_content[:100]}")
        except:
            pass
    openai_client = None
else:
    # Mask the key for logging (only show first 7 and last 4 characters)
    masked_key = f"{api_key[:7]}...{api_key[-4:]}" if len(api_key) > 11 else "***"
    logger.info(f"✅ OpenAI API key loaded: {masked_key} (length: {len(api_key)})")
    try:
        openai_client = OpenAI(api_key=api_key)
    except Exception as e:
        logger.error(f"Error initializing OpenAI client: {e}")
        openai_client = None

# Create FastAPI app
app = FastAPI(title="Voice Bot API", version="1.0.0")

# Setup CORS - allow all origins for local file access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local HTML file access
    allow_credentials=False,  # Must be False when using allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create API router
api_router = APIRouter(prefix="/api")

# Request/Response Models
class ChatMessage(BaseModel):
    text: str

class ChatResponse(BaseModel):
    response: str

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Voice Bot API is running"}

@api_router.get("/realtime-session")
async def get_realtime_session():
    """Get configuration for Realtime API session"""
    if not openai_client:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    
    # Get API key
    api_key = None
    if openai_client and hasattr(openai_client, '_client'):
        if hasattr(openai_client._client, 'api_key'):
            api_key = openai_client._client.api_key
    if not api_key:
        api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        if env_path.exists():
            try:
                with open(env_path, 'r', encoding='utf-8-sig') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('OPENAI_API_KEY='):
                            api_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                            break
            except:
                pass
    
    if not api_key:
        raise HTTPException(status_code=500, detail="API key not available")
    
    return {
        "apiKey": api_key,
        "model": "gpt-4o-realtime-preview-2024-10-01"
    }

@api_router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe audio using OpenAI Whisper API"""
    if not openai_client:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured. Please set OPENAI_API_KEY in backend/.env")
    try:
        # Read audio file
        audio_data = await file.read()
        file_size = len(audio_data)
        file_type = file.content_type or "unknown"
        filename = file.filename or "audio.webm"
        
        logger.info(f"Received audio file: {filename}, size: {file_size} bytes, type: {file_type}")
        
        # Validate file size
        if file_size < 1000:
            logger.warning(f"Audio file too small: {file_size} bytes")
            raise HTTPException(status_code=400, detail=f"Audio file too small ({file_size} bytes). Please record for longer.")
        
        audio_file = io.BytesIO(audio_data)
        audio_file.name = filename
        
        # Transcribe using Whisper with language hint for better accuracy
        # Remove prompt as it might interfere with very short recordings
        transcript = openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="en",  # Language hint - change to your language if different
            temperature=0.0,  # More deterministic, less creative
            response_format="text"  # Explicitly request text format
        )
        
        # Handle both string and object responses
        if isinstance(transcript, str):
            transcription_text = transcript.strip()
        else:
            transcription_text = transcript.text.strip() if hasattr(transcript, 'text') else str(transcript).strip()
        
        logger.info(f"📝 Transcription result: '{transcription_text}' (length: {len(transcription_text)}, file_size: {file_size})")
        
        if not transcription_text or len(transcription_text) < 1:
            logger.warning("Empty transcription received from Whisper")
            raise HTTPException(status_code=400, detail="No speech detected in audio. Please try speaking more clearly or longer.")
        
        return {"transcription": transcription_text}
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/chat", response_model=ChatResponse)
async def chat(message: ChatMessage):
    """Get chat response from OpenAI"""
    if not openai_client:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured. Please set OPENAI_API_KEY in backend/.env")
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful AI assistant. Keep responses concise and conversational."},
                {"role": "user", "content": message.text}
            ]
        )
        
        bot_response = response.choices[0].message.content
        return ChatResponse(response=bot_response)
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/chat/stream")
async def chat_stream(message: ChatMessage):
    """Stream chat response from OpenAI"""
    if not openai_client:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured. Please set OPENAI_API_KEY in backend/.env")
    
    async def generate():
        try:
            stream = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful AI assistant. Keep responses concise and conversational."},
                    {"role": "user", "content": message.text}
                ],
                stream=True
            )
            
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'content': content})}\n\n"
        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")

@api_router.post("/speak")
async def text_to_speech(message: ChatMessage):
    """Convert text to speech using OpenAI TTS"""
    if not openai_client:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured. Please set OPENAI_API_KEY in backend/.env")
    try:
        response = openai_client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=message.text
        )
        
        # Stream the audio response
        audio_data = io.BytesIO(response.content)
        
        return StreamingResponse(
            audio_data,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=speech.mp3"}
        )
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Include router
app.include_router(api_router)

# WebSocket endpoint for Realtime API
@app.websocket("/ws/realtime")
async def websocket_realtime(websocket: WebSocket):
    """WebSocket endpoint that proxies to OpenAI Realtime API"""
    await websocket.accept()
    
    if not openai_client:
        await websocket.close(code=1008, reason="OpenAI API key not configured")
        return
    
    openai_ws = None
    try:
        # Get API key
        api_key = None
        if openai_client and hasattr(openai_client, '_client'):
            # Try to get from the OpenAI client's internal client
            if hasattr(openai_client._client, 'api_key'):
                api_key = openai_client._client.api_key
        if not api_key:
            api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            # Read directly from .env file
            if env_path.exists():
                try:
                    with open(env_path, 'r', encoding='utf-8-sig') as f:
                        for line in f:
                            line = line.strip()
                            if line.startswith('OPENAI_API_KEY='):
                                api_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                                break
                except:
                    pass
        
        if not api_key:
            await websocket.close(code=1008, reason="API key not available")
            return
        
        # Connect to OpenAI Realtime API
        # OpenAI Realtime API endpoint
        openai_ws_url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "OpenAI-Beta": "realtime=v1"
        }
        
        async with websockets.connect(openai_ws_url, extra_headers=headers) as openai_ws:
            logger.info("Connected to OpenAI Realtime API")
            
            # Forward messages from client to OpenAI
            async def client_to_openai():
                try:
                    while True:
                        data = await websocket.receive_text()
                        logger.debug(f"Client->OpenAI: {data[:100]}...")  # Log first 100 chars
                        await openai_ws.send(data)
                except WebSocketDisconnect:
                    logger.info("Client disconnected")
                except Exception as e:
                    logger.error(f"Error forwarding client->openai: {e}")
            
            # Forward messages from OpenAI to client
            async def openai_to_client():
                try:
                    async for message in openai_ws:
                        logger.debug(f"OpenAI->Client: {message[:100]}...")  # Log first 100 chars
                        # Log message types to debug
                        try:
                            msg_json = json.loads(message)
                            msg_type = msg_json.get('type', 'unknown')
                            logger.info(f"📨 Received message type: {msg_type}")
                            
                            # Log specific important messages
                            if msg_type == 'error':
                                logger.error(f"❌ Error from OpenAI: {msg_json}")
                            elif msg_type == 'response.created':
                                logger.info(f"✅ Response created!")
                            elif msg_type == 'response.audio.started':
                                logger.info(f"🎵 Audio response started!")
                            elif msg_type == 'response.audio.delta':
                                logger.debug(f"🎵 Audio delta received")
                            elif msg_type == 'response.done':
                                logger.info(f"✅ Response done!")
                        except Exception as parse_error:
                            logger.debug(f"Could not parse message as JSON: {parse_error}")
                        await websocket.send_text(message)
                except Exception as e:
                    logger.error(f"Error forwarding openai->client: {e}")
            
            # Run both forwarding tasks concurrently
            await asyncio.gather(
                client_to_openai(),
                openai_to_client()
            )
            
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass
    finally:
        if openai_ws:
            try:
                await openai_ws.close()
            except:
                pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

