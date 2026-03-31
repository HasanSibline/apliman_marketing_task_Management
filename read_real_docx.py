from docx import Document
import sys
import os

try:
    path = "d:\\Marketing task management\\CDA Blog_ Three Years On_ From Coordination to Implementation - FINAL-fr.docx"
    doc = Document(path)
    text = "\n".join([para.text for para in doc.paragraphs])
    print(f"--- START OF DOCUMENT ---")
    print(text[:2000])
    print(f"--- END OF SAMPLE ---")
except Exception as e:
    print(f"FAILED: {e}")
