const firebaseConfig = {
    apiKey: "AIzaSyDbHnqvuydyGEKZ65-Zg9PyS9Y9c5MGt0o",
    authDomain: "hr-policy-chatbot-80f6b.firebaseapp.com",
    projectId: "hr-policy-chatbot-80f6b",
    storageBucket: "hr-policy-chatbot-80f6b.firebasestorage.app",
    messagingSenderId: "306724905980",
    appId: "1:306724905980:web:70a0c3b3515631025c0879",
    measurementId: "G-VPXV9TKLSX"
  };

firebase.initializeApp(firebaseConfig);
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((error) => {
        console.error('Error setting auth persistence:', error);
    });

const auth = firebase.auth();

const loginContainer = document.getElementById('login-container');
const loginCard = document.querySelector('.login-card');
const chatContainer = document.getElementById('chat-container');
const adminContainer = document.getElementById('admin-container');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const signOutBtn = document.getElementById('signOutBtn');
const adminSignOutBtn = document.getElementById('adminSignOutBtn');
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const policiesList = document.getElementById('policiesList');

// Backend URLs
const BACKEND_URL = 'http://localhost:8000/chat';
const ADMIN_URL = 'http://localhost:8000/admin';


let isAdminMode = false;

// Check auth state
// Replace the existing onAuthStateChanged listener with this:
auth.onAuthStateChanged((user) => {
    if (user) {
        if (isAdminMode) {
            // Admin login
            if (user.email === 'hetkpatel05@gmail.com') {
                showAdminPanel();
                loadPolicies();
            } else {
                // Don't sign out automatically - show message first
                alert('Admin access denied. Only authorized admin can access this panel.');
                auth.signOut();
            }
        } else {
            if (user.email && user.email.endsWith('@raapidinc.com')) {
                showChatInterface();
            } else {
                // Don't sign out automatically - show message first
                alert('Only @raapidinc.com emails are allowed to access this application.');
                auth.signOut();
            }
        }
    } else {
        showLoginScreen();
    }
}, (error) => {
    console.error('Auth state error:', error);
    // Don't automatically sign out on errors
});

// Show/Hide functions
function showLoginScreen() {
    loginContainer.style.display = 'flex';
    chatContainer.classList.remove('visible');
    adminContainer.classList.remove('visible');
    isAdminMode = false;
}

function showChatInterface() {
    loginContainer.style.display = 'none';
    chatContainer.classList.add('visible');
    adminContainer.classList.remove('visible');
}

function showAdminPanel() {
    loginContainer.style.display = 'none';
    chatContainer.classList.remove('visible');
    adminContainer.classList.add('visible');
}

// Add these at the top of your app.js
function showSuccessToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// Login event listeners
googleSignInBtn.addEventListener('click', () => {
    isAdminMode = false;
    signInWithGoogle();
});

adminLoginBtn.addEventListener('click', () => {
    isAdminMode = true;
    signInWithGoogle();
});

function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    
    // Add custom parameters if needed
    provider.setCustomParameters({
        prompt: 'select_account'
    });

    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            console.log("Signed in user:", result.user);
        })
        .catch((error) => {
            console.error("Error details:", error);
            showErrorToast("Sign in failed. Please try again.");
        });
}

// Sign out listeners
signOutBtn.addEventListener('click', () => auth.signOut());
adminSignOutBtn.addEventListener('click', () => auth.signOut());

// File upload functionality
fileInput.addEventListener('change', (e) => {
    uploadBtn.disabled = e.target.files.length === 0;
});

uploadBtn.addEventListener('click', uploadFiles);
async function refreshToken() {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.log('No user found');
            return null;  // ✅ Do NOT sign out here
        }

        // Always force refresh
        return await user.getIdToken(true);
    } catch (error) {
        console.error('Token refresh failed:', error);
        return null;  // ✅ Still no logout
    }
}


// Then modify your admin functions to use this:
async function uploadFiles() {
    const files = fileInput.files;
    if (files.length === 0) return;

    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    try {
        const idToken = await refreshToken();
        if (!idToken) {
            showErrorToast('Session expired. Please sign in again.');
            return;
        }
        
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });

        const response = await fetch(`${ADMIN_URL}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Upload failed');
        }

        const data = await response.json();
        showSuccessToast(`Success: ${data.message}`);
        fileInput.value = '';
        loadPolicies();
    } catch (error) {
        console.error('Upload error:', error);
        showErrorToast(error.message || 'Upload failed');
        // Don't sign out automatically
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Files';
    }
}

function handleUploadSuccess(data) {
    showSuccessToast(`Success: ${data.message}`);
    fileInput.value = '';
    loadPolicies();
}


async function loadPolicies() {
    try {
        policiesList.innerHTML = '<div class="loading-policies"><i class="fas fa-spinner fa-spin"></i> Loading policies...</div>';
        
        const idToken = await refreshToken();
        if (!idToken) {
            throw new Error('Session expired. Please sign in again.');
        }

        const response = await fetch(`${ADMIN_URL}/policies`, {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to load policies');
        }

        const data = await response.json();
        displayPolicies(data.policies);
    } catch (error) {
        console.error('Failed to load policies:', error);
        policiesList.innerHTML = `<div class="loading-policies">Error: ${error.message}</div>`;
        // Don't sign out automatically
    }
}

function displayPolicies(policies) {
    if (policies.length === 0) {
        policiesList.innerHTML = '<div class="loading-policies">No policies found</div>';
        return;
    }

    // Dynamically insert the bulk delete button
    let html = `
        <div class="policy-item" style="justify-content: flex-end;">
            <button id="bulkDeleteBtn" class="delete-btn" style="background-color: #6c757d;">
                <i class="fas fa-trash-alt"></i> Delete Selected
            </button>
        </div>
    `;

    // Add each policy row with checkbox
    html += policies.map(policy => `
        <div class="policy-item">
            <div class="policy-info">
                <input type="checkbox" class="policy-checkbox" value="${policy}">
                <i class="fas fa-file-${policy.endsWith('.pdf') ? 'pdf' : 'word'}"></i>
                <span>${policy}</span>
            </div>
            <button class="delete-btn" onclick="deletePolicy('${policy}')">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `).join('');

    policiesList.innerHTML = html;

    // Attach event listener for the bulk delete button
    attachBulkDeleteListener();
}
function attachBulkDeleteListener() {
    const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
    if (!bulkDeleteBtn) return;

    bulkDeleteBtn.onclick = async () => {
        const selectedCheckboxes = document.querySelectorAll(".policy-checkbox:checked");
        const selectedPolicies = Array.from(selectedCheckboxes).map(cb => cb.value);

        if (selectedPolicies.length === 0) {
            showErrorToast("Please select at least one policy to delete.");
            return;
        }

        if (!confirm(`Are you sure you want to delete ${selectedPolicies.length} selected policies?`)) return;

        try {
            const idToken = await refreshToken();
            for (const filename of selectedPolicies) {
                await fetch(`${ADMIN_URL}/delete/${encodeURIComponent(filename)}`, {
                    method: "DELETE",
                    headers: {
                        "Authorization": `Bearer ${idToken}`
                    }
                });
            }

            showSuccessToast("Selected policies deleted successfully.");
            loadPolicies();
        } catch (err) {
            console.error("Bulk delete error:", err);
            showErrorToast("Error deleting selected policies.");
        }
    };
}


async function deletePolicy(filename) {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;

    try {
        const idToken = await refreshToken();
        if (!idToken) {
            showErrorToast('Session expired. Please sign in again.');
            return;
        }
        
        const response = await fetch(`${ADMIN_URL}/delete/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Delete failed');
        }

        const data = await response.json();
        showSuccessToast(`Success: ${data.message}`);
        loadPolicies();
    } catch (error) {
        console.error('Delete error:', error);
        showErrorToast(error.message || 'Delete failed');
        // Don't sign out automatically
    }
}

function handleDeleteSuccess(data) {
    showSuccessToast(`Success: ${data.message}`);
    loadPolicies();
}

async function sendMessageToBackend(message, idToken) {
    try {   
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ message })
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return { response: "Failed to connect to policy server. Please try again." };
    }
}

async function handleUserInput() {
    const question = userInput.value.trim();
    if (!question) return;

    addMessage(question, true);
    userInput.value = '';
    userInput.disabled = true;
    sendBtn.disabled = true;

    const loadingDiv = addTypingIndicator();
    
    try {
        const idToken = await auth.currentUser.getIdToken(true);  // Force refresh token

        const data = await sendMessageToBackend(question, idToken);
        chatMessages.removeChild(loadingDiv);
        addMessage(data.response, false);
    } catch (error) {
        chatMessages.removeChild(loadingDiv);
        addMessage("⚠️ Error: Could not connect to HR policy database", false);
    }

    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
}

function addMessage(text, isUser) {
    const container = document.createElement('div');
    container.className = `message-container ${isUser ? 'user-message-container' : 'bot-message-container'}`;

    if (isUser) {
        const userBubble = document.createElement('div');
        userBubble.className = 'user-message';
        userBubble.textContent = text;
        container.appendChild(userBubble);
    } else {
        container.innerHTML = `
            <img src="f2.png" alt="Layla Avatar" class="bot-avatar-img">
            <div class="bot-message">
                <p class="message-content">${text}</p>
            </div>
        `;
    }

    chatMessages.appendChild(container);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return container;
}

function addTypingIndicator() {
    const container = document.createElement('div');
    container.className = 'message-container bot-message-container';

    container.innerHTML = `
        <img src="f4.png" alt="Layla Avatar" class="bot-avatar-img">
        <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;

    chatMessages.appendChild(container);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return container;
}


// Event listeners for chat
sendBtn.addEventListener('click', handleUserInput);
userInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleUserInput());

// Smooth scroll observer
const observer = new MutationObserver(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
});
observer.observe(chatMessages, { childList: true });

