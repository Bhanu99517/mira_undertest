# Mira Attendance System

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Tech Stack](https://img.shields.io/badge/stack-React%20%7C%20TypeScript%20%7C%20Node.js%20%7C%20MongoDB-orange)

**Mira Attendance** is a comprehensive, production-ready facial attendance management web application designed for educational institutions. It features facial recognition for attendance, role-based access control (RBAC), AI-powered tools for faculty (CogniCraft AI), and detailed reporting, all wrapped in a modern, responsive interface with light/dark themes and a specialized "Hacker Mode" for Super Admins.

---

## 📂 Project Structure (Aligned)

The project is structured to support both a standard **Vite/React + Express** setup and a **Vercel Serverless** deployment.

```text
/
├── public/                  # Static assets (images, icons)
├── src/
│   ├── api/                 # Vercel Serverless Functions (Optional deployment)
│   ├── components/          # React UI Components & Pages
│   │   ├── Icons.tsx        # Shared SVG Icons
│   │   ├── Header.tsx       # App Navigation Header
│   │   ├── LandingPage.tsx  # Public Student Portal
│   │   └── ... (Pages like Dashboard, Reports, NotebookLLMPage)
│   ├── models/              # Shared Mongoose Schemas (User, Attendance)
│   ├── App.tsx              # Main Application Component & Routing
│   ├── constants.tsx        # Navigation Links & Global Constants
│   ├── geminiClient.ts      # Google GenAI SDK Configuration
│   ├── index.tsx            # Entry Point
│   ├── services.ts          # Frontend API Services & Mock Data Logic
│   └── types.ts             # TypeScript Interfaces & Enums
├── backend/                 # Standalone Node.js/Express Server
│   ├── models/              # Backend Mongoose Models
│   ├── database.js          # Database Connection Logic
│   ├── server.js            # Express Server Entry Point
│   └── package.json         # Backend Dependencies
├── index.html               # Main HTML Template
├── metadata.json            # App Permissions Metadata
└── README.md                # Project Documentation
```

---

## ✨ Key Features

### 🔐 Authentication & Roles
*   **Role-Based Access:** Super Admin, Principal, HOD, Faculty, Staff, and Student roles.
*   **Secure Login:** PIN + Password authentication with OTP support for Admins.
*   **Super Admin Theme:** A unique "Hacker/Terminal" theme for the highest privilege level.

### 📸 Facial Attendance
*   **Geofencing:** Ensures attendance is marked only within campus coordinates (`CAMPUS_LAT`, `CAMPUS_LON`).
*   **Liveness Detection:** Requires user interaction (blinking) to prevent spoofing.
*   **AI Verification:** Compares live camera feed against stored reference images using Google Gemini 2.5 Flash.

### 🤖 CogniCraft AI (Powered by Gemini)
*   **NotebookLLM:** Chat with AI to summarize notes, generate quizzes, and create lesson plans.
*   **Multi-Modal:** Supports text, image analysis, and audio transcription.
*   **Content Generation:** Generates PPT outlines, lesson plans, and synthesized speech (TTS).

### 📊 Academic Management
*   **SBTET Results:** Students can check semester-wise results and backlogs.
*   **Syllabus Tracker:** Faculty can track and update topic coverage.
*   **Timetables:** View and upload class schedules.
*   **Reports:** Visual charts (Recharts) and CSV export for attendance logs.

---

## 🚀 Getting Started

### Prerequisites
*   **Node.js** (v18 or higher)
*   **MongoDB** (Atlas or Local)
*   **Google Gemini API Key** (Get one at aistudio.google.com)

### 1. Environment Setup

Create a `.env` file in the root directory:

```env
# Frontend & AI
API_KEY=your_google_gemini_api_key

# Backend / Database
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/mira_db
PORT=5001

# Email Service (Nodemailer)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

### 2. Installation

**Frontend:**
```bash
npm install
```

**Backend:**
```bash
cd backend
npm install
```

### 3. Running the Application

**Option A: Full Stack (Frontend + Express Backend)**

1.  Start the Backend:
    ```bash
    cd backend
    npm start
    # Server runs on http://localhost:5001
    ```

2.  Start the Frontend (in a new terminal):
    ```bash
    npm start # or npm run dev depending on your bundler script
    # App runs on http://localhost:3000
    ```

*Note: Ensure your `vite.config.ts` or `package.json` proxy points `/api` to `http://localhost:5001`.*

**Option B: Vercel / Serverless**

The project includes an `api/` folder compatible with Vercel functions.
1.  Install Vercel CLI: `npm i -g vercel`
2.  Run: `vercel dev`

---

## 🛠 Configuration Details

### Tailwind CSS
The project uses a custom Tailwind configuration supporting `darkMode: 'class'` and custom animations defined in `index.html` script tag (for this specific setup).

### Google GenAI
The AI features rely on the `@google/genai` SDK. Ensure you do not expose your `API_KEY` in client-side code in a production environment without proper proxying or restrictions.

### Geolocation
The attendance feature requires HTTPS (or localhost) to access `navigator.geolocation` and `navigator.mediaDevices`.

---

## 🤝 Contributing

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.
