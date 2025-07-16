from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import google.generativeai as genai
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import auth, credentials
from utils import load_all_policies, smart_format_response
import os
import shutil
from typing import List
from fastapi import UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import json
import base64

# Load environment variables
load_dotenv()
POLICY_TEXT = load_all_policies()

# Initialize app and Firebase

firebase_creds_str = os.getenv("FIREBASE_CREDS_JSON")
cred_dict = json.loads(firebase_creds_str)
cred = credentials.Certificate(cred_dict)
firebase_admin.initialize_app(cred)
    
# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

# Security
security = HTTPBearer()

app = FastAPI(title="Layla HR Policy Bot")



@app.get("/")
async def serve_Frontend_app():
    return FileResponse("./index.html")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


SYSTEM_PROMPT = """
You are Layla, a smart, warm, and friendly HR virtual assistant.

You help employees by answering their questions about HR policies using the official policy documents (such as leave policy, IT usage, etc.).

Your responses should follow these rules:

1. Always sound friendly and supportive, like a real HR professional.
2. Avoid robotic or formal responses like “I cannot answer” or “I do not have real-time access”.
3. If you dont know something, respond kindly and say something like:
   - "Thats a great question! I dont have the exact info, but HR can help you out with that."
   - "I might not have the details for that, but feel free to ask me anything about our policies!"
4. Do not repeat disclaimers like "based on this document" or "I do not have real-time access".
5. Present answers clearly, and break them into numbered points or short lines if needed.
6. Never use formatting symbols like *, **, #, or _ — keep it clean and plain text.

Even if an answer isn't found, always stay helpful, polite, and warm. You are here to make life easier for employees.

also if you see any 'PL' word it means privilege means so answer that way okay and answer in human and easy words. 

"""

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        decoded_token = auth.verify_id_token(token)
        email = decoded_token.get('email')

        if not email.endswith('@raapidinc.com'):
            raise HTTPException(status_code=403, detail="Access restricted to raapidinc.com emails only")

        return decoded_token
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.get("/")
async def health_check():
    return {"status": "PolicyBot backend is running"}

#RAG IMPLEMENTATION (PIPELINING --)

@app.post("/chat")
async def chat_endpoint(request: Request, user: dict = Depends(get_current_user)):
    try:
        data = await request.json()
        user_message = data.get("message", "")

        if not user_message:
            return {"response": "Please provide your question."}

        full_prompt = f"{SYSTEM_PROMPT}\n\n{POLICY_TEXT}\n\nEmployee: {user_message}\n\nLayla:"

        chat = model.start_chat()
        response = chat.send_message(
            full_prompt,
            generation_config={
                "max_output_tokens": 512,
                "temperature": 0.3
            }
        )

        raw_answer = response.text.strip()

        # ✅ Reformat Gemini response to numbered list on new lines
        formatted = smart_format_response(raw_answer)

        return {"response": formatted}

    except Exception as e:
        return {"response": f"Error processing your request: {str(e)}"}
    
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except HTTPException as e:
        if e.status_code == 401:
            return JSONResponse(
                status_code=401,
                content={"message": "Token expired. Please refresh your session."}
            )
        raise e

# Admin authentication function
async def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        decoded_token = auth.verify_id_token(token)
        email = decoded_token.get('email')

        # Only allow specific admin email
        if email != 'hetkpatel05@gmail.com':
            raise HTTPException(status_code=403, detail="Admin access denied")

        return decoded_token
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

# Admin endpoint to get list of policies
@app.get("/admin/policies")
async def get_policies(admin: dict = Depends(get_admin_user)):
    try:
        if not os.path.exists(POLICY_DIR):
            os.makedirs(POLICY_DIR)
        
        files = []
        for file in os.listdir(POLICY_DIR):
            if file.endswith(('.pdf', '.docx')):
                files.append(file)
        
        return {"policies": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading policies: {str(e)}")

#Admin (Policies Upload and Delete Endpoints)
@app.post("/admin/upload")
async def upload_policies(files: List[UploadFile] = File(...), admin: dict = Depends(get_admin_user)):
    try:
        if not files:
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": "No files provided"}
            )
        
        uploaded_files = []
        for file in files:
            if not file.filename.lower().endswith(('.pdf', '.docx')):
                continue
                
            file_path = os.path.join(POLICY_DIR, file.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            uploaded_files.append(file.filename)
        
        if not uploaded_files:
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": "No valid files were uploaded"}
            )
        
        
        global POLICY_TEXT
        POLICY_TEXT = load_all_policies() 
        
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "message": f"Uploaded {len(uploaded_files)} files",
                "files": uploaded_files
            }
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)}
        )


@app.delete("/admin/delete/{filename}")
async def delete_policy(filename: str, admin: dict = Depends(get_admin_user)):
    try:
        file_path = os.path.join(POLICY_DIR, filename)
        
        if not os.path.exists(file_path):
            return JSONResponse(
                status_code=404,
                content={"status": "error", "message": "File not found"}
            )
        
        os.remove(file_path)
        global POLICY_TEXT
        POLICY_TEXT = load_all_policies()
        
        return JSONResponse(
            status_code=200,
            content={"status": "success", "message": f"Deleted {filename}"}
        )


    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)}
        )

# Add POLICY_DIR constant at the top after load_all_policies()
POLICY_DIR = "./policies"
