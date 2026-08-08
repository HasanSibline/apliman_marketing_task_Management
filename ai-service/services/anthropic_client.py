"""Anthropic (Claude) provider for the AI service.

Every other provider in this service talks raw REST over aiohttp because that is all
Gemini/Groq/OpenAI need here. Anthropic ships an official Python SDK, so we use that
instead: it gives us retries, typed errors, and correct streaming for free.

The key that reaches this module is either a company's own key or the platform-wide
key a super admin saved in Settings → AI Platform. Nothing is read from the
environment except the default model.
"""

import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Claude's most capable model. Override per-request with the platform "model" field,
# or globally with ANTHROPIC_MODEL. `claude-haiku-4-5` is the cheapest option and is
# more than adequate for task descriptions and short chat turns.
DEFAULT_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-5")

# Thinking + response share this budget, so leave headroom above the visible answer.
DEFAULT_MAX_TOKENS = int(os.getenv("ANTHROPIC_MAX_TOKENS", "8192"))

# low | medium | high | xhigh | max, controls how much the model deliberates.
DEFAULT_EFFORT = os.getenv("ANTHROPIC_EFFORT", "medium")

# Server-side refusal fallback: if Claude's safety classifiers decline a request,
# the API retries it on Anthropic's recommended fallback model inside the same call
# instead of handing us an empty response.
FALLBACK_BETA = "server-side-fallback-2026-07-01"

IMAGE_MIME_TYPES = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
}


class AnthropicProviderError(Exception):
    """Raised for provider failures the caller should surface to the user."""


def _client(api_key: str):
    try:
        from anthropic import AsyncAnthropic
    except ImportError as exc:  # pragma: no cover - dependency is in requirements.txt
        raise AnthropicProviderError(
            "The 'anthropic' package is not installed on the AI service. "
            "Run: pip install -r requirements.txt"
        ) from exc

    return AsyncAnthropic(api_key=api_key)


def _guess_image_media_type(name: str, mime: str) -> Optional[str]:
    """Return a Claude-acceptable image media type, or None if this isn't an image."""
    if mime and mime.lower() in IMAGE_MIME_TYPES:
        return IMAGE_MIME_TYPES[mime.lower()]

    lowered = (name or "").lower()
    for ext, media_type in (
        (".jpg", "image/jpeg"),
        (".jpeg", "image/jpeg"),
        (".png", "image/png"),
        (".gif", "image/gif"),
        (".webp", "image/webp"),
    ):
        if lowered.endswith(ext):
            return media_type
    return None


def build_user_content(text: str, files: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """Build a Claude user-content array from text plus any attached images/PDFs.

    Claude reads images and PDFs natively, so attachments become real content blocks
    rather than the "images need a Gemini key" error the other text-only providers
    return. Files without base64 payloads are skipped, the caller has already
    appended any extracted text to `text`.
    """
    content: List[Dict[str, Any]] = []

    for f in files or []:
        b64 = f.get("base64")
        if not b64:
            continue

        name = f.get("name", "")
        mime = f.get("type", "")

        media_type = _guess_image_media_type(name, mime)
        if media_type:
            content.append(
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}}
            )
            logger.info(f"🖼️ Attached image to Claude request: {name}")
            continue

        if name.lower().endswith(".pdf") or mime == "application/pdf":
            content.append(
                {
                    "type": "document",
                    "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
                }
            )
            logger.info(f"📄 Attached PDF to Claude request: {name}")

    # Documents read better when they precede the instruction, which is the order
    # we've built here, the text block goes last.
    content.append({"type": "text", "text": text})
    return content


def _extract_text(response) -> str:
    """Pull the visible answer out of a Claude response, guarding refusals."""
    if getattr(response, "stop_reason", None) == "refusal":
        category = getattr(getattr(response, "stop_details", None), "category", None)
        raise AnthropicProviderError(
            "Claude declined this request"
            + (f" ({category})" if category else "")
            + ". Try rephrasing it."
        )

    parts = [block.text for block in response.content if getattr(block, "type", None) == "text"]
    text = "".join(parts).strip()

    if not text and getattr(response, "stop_reason", None) == "max_tokens":
        raise AnthropicProviderError(
            "Claude ran out of output budget before answering. Raise ANTHROPIC_MAX_TOKENS."
        )

    return text


async def generate(
    api_key: str,
    prompt: str,
    system_prompt: Optional[str] = None,
    model: Optional[str] = None,
    files: Optional[List[Dict[str, Any]]] = None,
    max_tokens: Optional[int] = None,
    effort: Optional[str] = None,
) -> str:
    """Send one prompt to Claude and return the text response.

    Raises AnthropicProviderError with a message worth showing a user. Rate limits
    keep the literal "429" in the message so the NestJS layer classifies them the
    same way it does for the other providers.
    """
    import anthropic

    client = _client(api_key)
    model_id = model or DEFAULT_MODEL

    request: Dict[str, Any] = {
        "model": model_id,
        "max_tokens": max_tokens or DEFAULT_MAX_TOKENS,
        "output_config": {"effort": effort or DEFAULT_EFFORT},
        "messages": [{"role": "user", "content": build_user_content(prompt, files)}],
    }
    if system_prompt:
        request["system"] = system_prompt

    try:
        try:
            # Preferred path: refusals are retried server-side on a fallback model.
            response = await client.beta.messages.create(
                **request, betas=[FALLBACK_BETA], extra_body={"fallbacks": "default"}
            )
        except (anthropic.BadRequestError, TypeError) as beta_error:
            # Older SDK or an account without the beta, fall back to a plain call
            # rather than failing the user's request over an optional feature.
            logger.warning(f"Claude fallback beta unavailable ({beta_error}); retrying without it.")
            response = await client.messages.create(**request)

        return _extract_text(response)

    except anthropic.AuthenticationError as e:
        raise AnthropicProviderError(
            "The Anthropic API key is invalid or has been revoked. Update it in the admin panel."
        ) from e
    except anthropic.PermissionDeniedError as e:
        raise AnthropicProviderError(
            "This Anthropic API key does not have access to the requested model. "
            f"Model: {model_id}."
        ) from e
    except anthropic.NotFoundError as e:
        raise AnthropicProviderError(f"Unknown Anthropic model: {model_id}.") from e
    except anthropic.RateLimitError as e:
        raise AnthropicProviderError(
            f"AI quota exceeded (429) on the Anthropic key. Anthropic said: {e}"
        ) from e
    except anthropic.APIStatusError as e:
        if e.status_code == 400 and "credit balance" in str(e).lower():
            raise AnthropicProviderError(
                "The Anthropic account has no credit left. Add credit at console.anthropic.com/billing."
            ) from e
        raise AnthropicProviderError(f"Anthropic API error ({e.status_code}): {e}") from e
    except anthropic.APIConnectionError as e:
        raise AnthropicProviderError(f"Could not reach Anthropic: {e}") from e
    finally:
        await client.close()
