import asyncio
import logging
import gc
from typing import Dict, Any, Optional
import torch

logger = logging.getLogger(__name__)

class ModelManager:
    """Manages model loading and unloading for memory efficiency"""
    
    def __init__(self):
        self.loaded_models: Dict[str, Any] = {}
        self.model_loading = set()
        self.max_models_in_memory = 1  # Only keep 1 model in memory at a time
        
    async def load_model(self, model_name: str, load_func) -> Any:
        """Load a model on-demand, unloading others if needed"""
        if model_name in self.loaded_models:
            logger.info(f"Model {model_name} already loaded")
            return self.loaded_models[model_name]
            
        if model_name in self.model_loading:
            # Wait for ongoing loading to complete
            while model_name in self.model_loading:
                await asyncio.sleep(0.1)
            return self.loaded_models.get(model_name)
            
        try:
            self.model_loading.add(model_name)
            logger.info(f"Loading model {model_name} on-demand...")
            
            # Unload other models if we're at the limit
            await self._unload_other_models(model_name)
            
            # Load the new model
            model = await load_func()
            self.loaded_models[model_name] = model
            
            logger.info(f"✅ Model {model_name} loaded successfully")
            return model
            
        except Exception as e:
            logger.error(f"❌ Failed to load model {model_name}: {e}")
            return None
        finally:
            self.model_loading.discard(model_name)
    
    async def unload_model(self, model_name: str):
        """Unload a specific model to free memory"""
        if model_name in self.loaded_models:
            logger.info(f"Unloading model {model_name} to free memory")
            del self.loaded_models[model_name]
            
            # Force garbage collection
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                
    async def _unload_other_models(self, keep_model: str):
        """Unload other models to make room for new one"""
        if len(self.loaded_models) >= self.max_models_in_memory:
            models_to_unload = [name for name in self.loaded_models.keys() if name != keep_model]
            for model_name in models_to_unload:
                await self.unload_model(model_name)
    
    async def cleanup_all(self):
        """Unload all models and clean up memory"""
        logger.info("Cleaning up all models...")
        for model_name in list(self.loaded_models.keys()):
            await self.unload_model(model_name)
        
        # Final cleanup
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            
    def get_loaded_models(self) -> list:
        """Get list of currently loaded models"""
        return list(self.loaded_models.keys())
    
    def is_model_loaded(self, model_name: str) -> bool:
        """Check if a model is currently loaded"""
        return model_name in self.loaded_models
