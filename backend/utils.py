import os
import fitz  # PyMuPDF
from docx import Document
import re

POLICY_DIR = os.path.join(os.path.dirname(__file__), "policies")

def extract_text_from_pdf(filepath):
    text = ""
    with fitz.open(filepath) as doc:
        for page in doc:
            text += page.get_text()
    return text


def extract_text_from_docx(filepath):
    doc = Document(filepath)
    return "\n".join([para.text for para in doc.paragraphs])


def load_all_policies():
    text = ""
    for file in os.listdir(POLICY_DIR):
        filepath = os.path.join(POLICY_DIR, file)
        if file.endswith(".pdf"):
            text += extract_text_from_pdf(filepath)
        elif file.endswith(".docx"):
            text += extract_text_from_docx(filepath)
    return text.strip()

def smart_format_response(text: str) -> str:
    # Remove polite intros and closings
    text = re.sub(r"(?i)\b(hi|hello|hey)[^.!?\n]*[.!?]", "", text)
    text = re.sub(r"(?i)\b(that'?s a (great|good) question)[^.!?\n]*[.!?]", "", text)
    text = re.sub(r"(?i)(i'?m always happy to help|i hope this helps)[^.!?\n]*[.!?]", "", text)

    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()

    # Force newline before each numbered item (e.g., 1. 2. 3.)
    text = re.sub(r"\s*(\d+\.)\s*", r"\n\1 ", text)

    # Final cleanup
    return text.strip()
