#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FastAPI backend for text-to-speech service
"""

import os
import re
import uuid
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import edge_tts
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel, Field
from minio import Minio
from minio.error import S3Error
import uvicorn

# Configuration
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "tts-audio")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

TEMP_DIR = Path("/tmp/tts")
TEMP_DIR.mkdir(exist_ok=True)

# File cleanup interval (1 hour)
CLEANUP_INTERVAL = timedelta(hours=1)

app = FastAPI(title="TTS Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MinIO client
minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)

# Ensure bucket exists
try:
    if not minio_client.bucket_exists(MINIO_BUCKET):
        minio_client.make_bucket(MINIO_BUCKET)
except S3Error as e:
    print(f"Warning: Could not connect to MinIO: {e}")


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000, description="Text to convert to speech")
    voice: Optional[str] = Field(default="en-US-DavisNeural", description="Voice name for TTS")
    language: Optional[str] = Field(default="en", description="Language code")


class TTSResponse(BaseModel):
    file_id: str
    download_url: str
    expires_at: str


def clean_text(text: str) -> str:
    """Clean text for TTS - remove markdown, fix formatting"""
    # Remove markdown links but keep text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    # Remove markdown bold/italic
    text = re.sub(r'\*\*([^\*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^\*]+)\*', r'\1', text)
    # Remove code blocks
    text = re.sub(r'```[^`]+```', '', text, flags=re.DOTALL)
    # Remove inline code but keep text
    text = re.sub(r'`([^`]+)`', r'\1', text)
    # Remove HTML tags if any
    text = re.sub(r'<[^>]+>', '', text)
    # Remove extra whitespace and normalize
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    
    # Fix common technical terms for better pronunciation
    replacements = {
        'kubectl': 'kube control',
        '2FA': 'two factor authentication',
        'SSH': 'S S H',
        'HTTP': 'H T T P',
        'HTTPS': 'H T T P S',
        'API': 'A P I',
        'CRUD': 'C R U D',
        'SMTP': 'S M T P',
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    # Fix punctuation for better TTS flow
    text = text.replace('...', '.')
    text = text.replace('--', '-')
    
    return text


async def generate_audio_async(text: str, output_file: str, voice: str = "en-US-DavisNeural") -> bool:
    """Generate MP3 audio file from text using edge-tts"""
    max_length = 10000
    
    if len(text) <= max_length:
        return await _generate_single_audio_async(text, output_file, voice)
    else:
        # Split text into parts
        parts = []
        sentences = re.split(r'([.!?]\s+)', text)
        current_part = []
        current_length = 0
        
        for i in range(0, len(sentences), 2):
            sentence = sentences[i] + (sentences[i+1] if i+1 < len(sentences) else '')
            sentence_length = len(sentence)
            
            if current_length + sentence_length > max_length and current_part:
                parts.append(''.join(current_part))
                current_part = [sentence]
                current_length = sentence_length
            else:
                current_part.append(sentence)
                current_length += sentence_length
        
        if current_part:
            parts.append(''.join(current_part))
        
        # Generate each part
        temp_files = []
        for i, part in enumerate(parts):
            temp_file = output_file.replace('.mp3', f'_part{i+1}.mp3')
            if await _generate_single_audio_async(part, temp_file, voice):
                temp_files.append(temp_file)
            else:
                # Cleanup on error
                for tf in temp_files:
                    try:
                        os.remove(tf)
                    except:
                        pass
                return False
        
        # Merge parts using pydub
        if temp_files:
            if len(temp_files) == 1:
                os.rename(temp_files[0], output_file)
            else:
                try:
                    from pydub import AudioSegment
                    combined = AudioSegment.empty()
                    for tf in temp_files:
                        combined += AudioSegment.from_mp3(tf)
                    combined.export(output_file, format="mp3")
                    # Remove temp files
                    for tf in temp_files:
                        try:
                            os.remove(tf)
                        except:
                            pass
                except ImportError:
                    # If pydub not available, use first part
                    for tf in temp_files[1:]:
                        try:
                            os.remove(tf)
                        except:
                            pass
                    os.rename(temp_files[0], output_file)
            return True
        
        return False


async def _generate_single_audio_async(text: str, output_file: str, voice: str, max_retries: int = 3) -> bool:
    """Generate single audio file with retry logic"""
    for attempt in range(max_retries):
        try:
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(output_file)
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = (attempt + 1) * 2
                await asyncio.sleep(wait_time)
            else:
                print(f"Error after {max_retries} attempts: {e}")
                return False
    return False


def upload_to_minio(file_path: str, object_name: str) -> str:
    """Upload file to MinIO and return object name"""
    try:
        minio_client.fput_object(MINIO_BUCKET, object_name, file_path)
        return object_name
    except S3Error as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload to MinIO: {str(e)}")


@app.get("/")
async def root():
    return {"message": "TTS Service API", "version": "1.0.0"}


@app.get("/api/voices")
async def list_voices(language: Optional[str] = None):
    """List available voices"""
    try:
        voices = await edge_tts.list_voices()
        if language:
            voices = [v for v in voices if v['Locale'].startswith(language)]
        return {"voices": voices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list voices: {str(e)}")


@app.get("/api/preview")
async def preview_voice(voice: str, language: Optional[str] = "en"):
    """Generate a short preview of a voice"""
    # Preview texts for different languages
    preview_texts = {
        "en": "Hello, this is a voice preview. How does this sound?",
        "ru": "Привет, это пример голоса. Как вам звучание?",
    }
    
    preview_text = preview_texts.get(language, preview_texts["en"])
    
    preview_id = str(uuid.uuid4())
    temp_file = TEMP_DIR / f"preview_{preview_id}.mp3"
    
    try:
        # Generate preview audio
        communicate = edge_tts.Communicate(preview_text, voice)
        await communicate.save(str(temp_file))
        
        # Read file content
        with open(temp_file, "rb") as f:
            content = f.read()
        
        # Clean up temp file
        try:
            os.remove(temp_file)
        except:
            pass
        
        # Return as streaming response
        return Response(
            content=content,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=preview.mp3"}
        )
    
    except Exception as e:
        # Clean up on error
        try:
            if temp_file.exists():
                os.remove(temp_file)
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to generate preview: {str(e)}")


@app.post("/api/generate", response_model=TTSResponse)
async def generate_tts(request: TTSRequest):
    """Generate TTS audio from text"""
    try:
        # Clean text
        cleaned_text = clean_text(request.text)
        
        if not cleaned_text:
            raise HTTPException(status_code=400, detail="Text is empty after cleaning")
        
        # Generate unique file ID
        file_id = str(uuid.uuid4())
        temp_file = TEMP_DIR / f"{file_id}.mp3"
        
        # Generate audio
        success = await generate_audio_async(cleaned_text, str(temp_file), request.voice)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to generate audio")
        
        # Upload to MinIO
        object_name = f"{file_id}.mp3"
        upload_to_minio(str(temp_file), object_name)
        
        # Remove temp file
        try:
            os.remove(temp_file)
        except:
            pass
        
        # Calculate expiration time
        expires_at = datetime.utcnow() + CLEANUP_INTERVAL
        
        return TTSResponse(
            file_id=file_id,
            download_url=f"/api/download/{file_id}",
            expires_at=expires_at.isoformat()
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating audio: {str(e)}")


@app.get("/api/download/{file_id}")
async def download_file(file_id: str):
    """Download audio file from MinIO"""
    try:
        object_name = f"{file_id}.mp3"
        temp_file = TEMP_DIR / f"{file_id}.mp3"
        
        # Download from MinIO
        minio_client.fget_object(MINIO_BUCKET, object_name, str(temp_file))
        
        # Return file
        return FileResponse(
            path=temp_file,
            media_type="audio/mpeg",
            filename=f"{file_id}.mp3",
            background=lambda: os.remove(temp_file) if temp_file.exists() else None
        )
    
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error downloading file: {str(e)}")


@app.delete("/api/cleanup")
async def cleanup_old_files():
    """Manual cleanup of old files (called by scheduled task)"""
    try:
        # List all objects in bucket
        objects = minio_client.list_objects(MINIO_BUCKET, recursive=True)
        
        deleted_count = 0
        now = datetime.utcnow()
        
        for obj in objects:
            # Check if object is older than cleanup interval
            if obj.last_modified and (now - obj.last_modified.replace(tzinfo=None)) > CLEANUP_INTERVAL:
                try:
                    minio_client.remove_object(MINIO_BUCKET, obj.object_name)
                    deleted_count += 1
                except:
                    pass
        
        return {"deleted": deleted_count, "message": "Cleanup completed"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during cleanup: {str(e)}")


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check MinIO connection
        minio_client.bucket_exists(MINIO_BUCKET)
        return {"status": "healthy", "minio": "connected"}
    except:
        return {"status": "degraded", "minio": "disconnected"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

