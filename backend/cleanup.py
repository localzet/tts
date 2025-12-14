#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scheduled cleanup script for old TTS files
"""

import os
import sys
from datetime import datetime, timedelta
from minio import Minio
from minio.error import S3Error

# Configuration
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "tts-audio")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
CLEANUP_INTERVAL_HOURS = int(os.getenv("CLEANUP_INTERVAL_HOURS", "1"))

def cleanup_old_files():
    """Remove files older than CLEANUP_INTERVAL_HOURS"""
    try:
        minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE
        )
        
        if not minio_client.bucket_exists(MINIO_BUCKET):
            print(f"Bucket {MINIO_BUCKET} does not exist")
            return
        
        # List all objects
        objects = minio_client.list_objects(MINIO_BUCKET, recursive=True)
        
        deleted_count = 0
        now = datetime.utcnow()
        cutoff_time = now - timedelta(hours=CLEANUP_INTERVAL_HOURS)
        
        for obj in objects:
            if obj.last_modified:
                # Remove timezone info for comparison
                obj_time = obj.last_modified.replace(tzinfo=None)
                if obj_time < cutoff_time:
                    try:
                        minio_client.remove_object(MINIO_BUCKET, obj.object_name)
                        deleted_count += 1
                        print(f"Deleted: {obj.object_name} (age: {now - obj_time})")
                    except Exception as e:
                        print(f"Error deleting {obj.object_name}: {e}")
        
        print(f"Cleanup completed: {deleted_count} files deleted")
        return deleted_count
    
    except S3Error as e:
        print(f"MinIO error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error during cleanup: {e}")
        sys.exit(1)

if __name__ == "__main__":
    cleanup_old_files()

