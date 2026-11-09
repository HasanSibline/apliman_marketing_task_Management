"""
Reading a Gemini generateContent reply safely.

Gemini's current models think before they answer, and the thinking is spent from the
same maxOutputTokens allowance as the answer. A small cap (200 tokens for a one-word
classification) can therefore be used up before any visible text is written, and the
reply arrives with a candidate but no `parts`. Reading `content['parts'][0]['text']`
directly raised KeyError there, the AI service answered 500, and the backend benched a
healthy Gemini entry for a minute: creating a task could take chat down with it.
"""
from typing import Any, Dict, Optional, Tuple

# The smallest output allowance a Gemini call is given, whatever the caller asked for.
# Callers that ask for less want a short answer, and their prompts already say so; the
# cap only has to leave room for the thinking that comes first.
MIN_OUTPUT_TOKENS = 1024

# Finish reasons that mean the prompt or answer was refused, not that something broke.
_REFUSED = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"}


def output_cap(requested: Optional[int]) -> Optional[int]:
    """The maxOutputTokens to send for a requested cap (None means no cap)."""
    if not requested:
        return None
    return max(requested, MIN_OUTPUT_TOKENS)


def reply_text(data: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """
    The visible answer and the finish reason.

    The text is None when the reply carries nothing a person would read: no candidate,
    no parts, or only thought parts.
    """
    candidates = data.get("candidates") or []
    if not candidates:
        return None, (data.get("promptFeedback") or {}).get("blockReason")
    candidate = candidates[0] or {}
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(
        part.get("text", "") for part in parts if isinstance(part, dict) and not part.get("thought")
    )
    return (text if text.strip() else None), candidate.get("finishReason")


def empty_reply_error(finish_reason: Optional[str]) -> str:
    """
    Why a reply had no text, worded so the backend's classifier reads it correctly:
    "max tokens" is not the provider's fault and must not bench it, and a refusal is a
    property of the prompt, so it must not be shopped around the chain.
    """
    if finish_reason == "MAX_TOKENS":
        return "Gemini reached max tokens before writing an answer."
    if finish_reason in _REFUSED:
        return f"Gemini response blocked by safety filter ({finish_reason})."
    return f"Gemini returned an empty response (finish reason: {finish_reason or 'none'})."


def usage_counts(metadata: Optional[Dict[str, Any]]) -> Tuple[Optional[int], Optional[int]]:
    """Prompt and output tokens. Thinking is billed as output, so it is counted as output."""
    meta = metadata or {}
    output = meta.get("candidatesTokenCount")
    thoughts = meta.get("thoughtsTokenCount")
    if thoughts:
        output = (output or 0) + thoughts
    return meta.get("promptTokenCount"), output
