#!/usr/bin/env python3
"""
Pre-download ChromaDB embedding model during Docker build.
This avoids timeout issues during container startup.
"""
import os
import httpx
from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2

# Monkey-patch httpx.Client to use extended timeout for model downloads
original_client = httpx.Client

def patched_client(*args, **kwargs):
    # Set 5-minute timeout for downloading large model files
    kwargs.setdefault('timeout', 300.0)
    return original_client(*args, **kwargs)

httpx.Client = patched_client

# Create model directory
os.makedirs('chroma/models', exist_ok=True)

# Download the model
print("Downloading ChromaDB embedding model (ONNXMiniLM_L6_V2)...")
print("This may take 3-5 minutes for ~79MB download...")
ef = ONNXMiniLM_L6_V2()
ef.DOWNLOAD_PATH = 'chroma/models'
ef._download_model_if_not_exists()
print("Model download complete!")
