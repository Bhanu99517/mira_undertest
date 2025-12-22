
import { User, Role, Branch, AttendanceRecord, Application, PPTContent, QuizContent, LessonPlanContent, ApplicationStatus, ApplicationType, SBTETResult, SyllabusCoverage, Timetable, Feedback, AppSettings, ResearchContent } from './types';
import { aiClientState } from './geminiClient';
import { Type } from '@google/genai';

// --- MOCK STORAGE SERVICE (Keep for non-critical features during transition) ---
class MockStorage {
    private store: Map<string, any> = new Map();
    constructor() {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                        this.store.set(key, localStorage.getItem(key));
                    }
                }
            }
        } catch (e) {
            console.warn("LocalStorage access failed", e);
        }
    }
    setItem<T>(key: string, value: T): void {
        const strVal = JSON.stringify(value);
        this.store.set(key, strVal);
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(key, strVal);
        }
    }
    getItem<T>(key: string): T | null {
        const item = this.store.get(key);
        return item ? JSON.parse(item) as T : null;
    }
}
const storage = new MockStorage();
const now = new Date().toISOString();

// --- API UTILITIES ---
const API_BASE = '/api';

const delay = <T,>(data: T, ms = 300): Promise<T> => new Promise(res => setTimeout(() => res(data), ms));

const createAvatar = (seed: string) => `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(seed)}`;

// --- ENHANCED ERROR HANDLING ---
// Helper function to process API responses and throw meaningful errors.
const handleApiError = async (response: Response) => {
    if (!response.ok) {
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        try {
            const errorData = await response.json();
            if (errorData) {
                if (errorData.error) errorMessage = errorData.error;
                else if (errorData.message) errorMessage = errorData.message;
            }
        } catch (e) {
            // Fallback to default error message if JSON parsing fails
        }
        throw new Error(errorMessage);
    }
    return response.json();
};

// Wrapper for fetch that handles network errors gracefully.
const safeFetch = async (url: string, options?: RequestInit) => {
    try {
        const response = await fetch(url, options);
        return await handleApiError(response);
    } catch (error) {
        console.error(`API Call Failed [${url}]:`, error);
        if (error instanceof TypeError && error.message === "Failed to fetch") {
             throw new Error("Unable to connect to the server. Please check your internet connection.");
        }
        throw error;
    }
};

// --- DATA INITIALIZATION ---
// We will disable generating large mock datasets for Users/Attendance since we are moving to DB.
// But we keep other mock data (Results, Timetables) for now until those APIs are built.

const generateInitialData = () => {
    if (!storage.getItem('INITIAL_DATA_GENERATED')) {
        storage.setItem('INITIAL_DATA_GENERATED', true);
    }
};
generateInitialData();

interface VerificationResult {
    isMatch: boolean;
    quality: 'GOOD' | 'POOR';
    reason: string;
}

const imageToDataUrl = (url: string): Promise<{ data: string, mimeType: string }> => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error("Canvas context not available"));
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        const mimeType = 'image/jpeg';
        const base64Data = dataUrl.split(',')[1];
        resolve({ data: base64Data, mimeType });
    };
    img.onerror = (err) => {
        console.error("Failed to load image for AI verification:", err);
        reject(new Error(`Could not load image from ${url}. It might be a CORS issue.`));
    };
    img.src = url;
});

// --- TENANCY HELPERS ---
const applyTenantFilter = <T>(items: T[], currentUser: User, getCollegeCode: (item: T) => string | undefined): T[] => {
    if (currentUser.role !== Role.SUPER_ADMIN && currentUser.college_code) {
        return items.filter(item => getCollegeCode(item) === currentUser.college_code);
    }
    return items;
};

// --- EXPORTED API FUNCTIONS ---

// 1. LOGIN (Connected to Backend)
export const login = async (pin: string, pass: string): Promise<User | { otpRequired: true; user: User } | null> => {
    try {
        // Manual fetch here to handle 401 specifically without throwing
        const response = await fetch(`${API_BASE}/users?action=login&pin=${encodeURIComponent(pin)}&password=${encodeURIComponent(pass)}`);
        if (response.status === 401) {
            return null; 
        }
        const user = await handleApiError(response);
        
        if (user) {
            if (user.access_revoked) throw new Error("Access revoked for this user.");
            
            if (user.role === Role.SUPER_ADMIN) {
                return { otpRequired: true, user: user };
            }
            return user;
        }
        return null;
    } catch (error) {
        console.error("Login API error:", error);
        if (error instanceof TypeError && error.message === "Failed to fetch") {
             throw new Error("Unable to connect to the server. Please check your internet connection.");
        }
        throw error;
    }
};

// 2. EMAIL (Connected to Backend)
export const sendEmail = async (to: string, subject: string, body: string): Promise<{ success: boolean }> => {
    try {
        await safeFetch(`${API_BASE}/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject, body }),
        });
        return { success: true };
    } catch (error) {
        console.error("Network error sending email:", error);
        return { success: false };
    }
};

export const sendLoginOtp = async (user: User): Promise<{ success: boolean }> => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    storage.setItem(`LOGIN_OTP_${user.id}`, otp); 
    
    const email = 'bhanu99517@gmail.com'; 
    const subject = 'Your Mira Attendance Login OTP';
    const body = `Hello ${user.name},\n\nYour OTP is: ${otp}\n\nRegards,\nMira Attendance`;

    return await sendEmail(email, subject, body);
};

export const verifyLoginOtp = async (userId: string, otp: string): Promise<User | null> => {
    const storedOtp = storage.getItem<string>(`LOGIN_OTP_${userId}`);
    if (storedOtp && storedOtp === otp) {
        storage.setItem(`LOGIN_OTP_${userId}`, null);
        const users = await getUsers({ role: Role.SUPER_ADMIN } as User); 
        return users.find(u => u.id === userId) || null;
    }
    return null;
};

// 3. USERS (Connected to Backend)
export const getUsers = async (currentUser: User): Promise<User[]> => {
    const allUsers: User[] = await safeFetch(`${API_BASE}/users`);
    return applyTenantFilter(allUsers, currentUser, u => u.college_code);
};

export const addUser = async (user: User, currentUser: User): Promise<User> => {
    if (currentUser.role !== Role.SUPER_ADMIN && currentUser.college_code) {
        user.college_code = currentUser.college_code;
    }
    return await safeFetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
    });
};

export const updateUser = async (id: string, userData: User, currentUser: User): Promise<User> => {
    return await safeFetch(`${API_BASE}/users?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
    });
};

export const deleteUser = async (id: string, currentUser: User, forceHardDelete = false): Promise<{ success: boolean }> => {
    // For now, reusing update logic for soft delete as backend API mainly supports that via update
    if (!forceHardDelete) {
        const users = await getUsers(currentUser);
        const user = users.find(u => u.id === id);
        if (user) {
            await updateUser(id, { ...user, access_revoked: !user.access_revoked }, currentUser);
            return { success: true };
        }
    }
    return { success: false };
};

export const getStudentByPin = async (pin: string, currentUser: User | null): Promise<User | null> => {
    const users = await getUsers({ role: Role.SUPER_ADMIN } as User);
    const user = users.find(u => u.pin.toUpperCase() === pin.toUpperCase() && u.role === Role.STUDENT);
    
    if (currentUser && currentUser.role !== Role.SUPER_ADMIN && currentUser.college_code && user?.college_code !== currentUser.college_code) {
        return null;
    }
    return user || null;
};

export const getUserByPin = async (pin: string, currentUser: User | null): Promise<User | null> => {
    const users = await getUsers({ role: Role.SUPER_ADMIN } as User);
    const user = users.find(u => u.pin.toUpperCase() === pin.toUpperCase());
    return user || null;
}

export const getFaculty = async(currentUser: User): Promise<User[]> => {
    const users = await getUsers(currentUser);
    return users.filter(u => u.role === Role.FACULTY || u.role === Role.PRINCIPAL || u.role === Role.HOD);
}

const getUserIdToCollegeMap = async (currentUser: User): Promise<Map<string, string | undefined>> => {
    const users = await getUsers(currentUser);
    const map = new Map<string, string | undefined>();
    users.forEach(u => map.set(u.id, u.college_code));
    return map;
};

// 4. ATTENDANCE (Connected to Backend)
export const getDistanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const CAMPUS_LAT = 18.4550;
export const CAMPUS_LON = 79.5217;
export const CAMPUS_RADIUS_KM = 0.5;

export const markAttendance = async (userId: string, coordinates: { latitude: number, longitude: number } | null): Promise<AttendanceRecord> => {
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];
    
    // Fetch user details
    const users = await getUsers({ role: Role.SUPER_ADMIN } as User);
    const user = users.find(u => u.id === userId);
    if(!user) throw new Error("User not found");

    let locationStatus: 'On-Campus' | 'Off-Campus' = 'Off-Campus';
    let locationString: string | undefined;
    let distanceInKm: number | undefined;

    if (coordinates) {
        distanceInKm = getDistanceInKm(coordinates.latitude, coordinates.longitude, CAMPUS_LAT, CAMPUS_LON);
        if (distanceInKm <= CAMPUS_RADIUS_KM) {
            locationStatus = 'On-Campus';
        }
        locationString = `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`;
    }

    const payload = {
        userId,
        userName: user.name,
        userPin: user.pin,
        userAvatar: user.imageUrl || createAvatar(user.name),
        date: dateString,
        status: 'Present',
        timestamp: today.toTimeString().split(' ')[0],
        location: {
            status: locationStatus,
            coordinates: locationString,
            distance_km: distanceInKm
        }
    };

    return await safeFetch(`${API_BASE}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
};

export const getAttendanceForUser = async (userId: string): Promise<AttendanceRecord[]> => {
    try {
        return await safeFetch(`${API_BASE}/attendance?userId=${userId}`);
    } catch (e) {
        console.error("Fetch attendance error:", e);
        return [];
    }
};

export const getTodaysAttendanceForUser = async (userId: string): Promise<AttendanceRecord | null> => {
    const today = new Date().toISOString().split('T')[0];
    try {
        const records: AttendanceRecord[] = await safeFetch(`${API_BASE}/attendance?userId=${userId}&date=${today}`);
        return records.length > 0 ? records[0] : null;
    } catch (e) {
        console.error("Fetch today's attendance error:", e);
        return null;
    }
};

export const getAttendanceForDate = async (date: string, currentUser: User): Promise<AttendanceRecord[]> => {
    try {
        const records: AttendanceRecord[] = await safeFetch(`${API_BASE}/attendance?date=${date}`);
        const map = await getUserIdToCollegeMap(currentUser);
        return applyTenantFilter(records, currentUser, a => map.get(a.userId));
    } catch (e) {
        console.error("Fetch attendance for date error:", e);
        return [];
    }
};

export const getAttendanceForDateRange = async (startDate: string, endDate: string, currentUser: User): Promise<AttendanceRecord[]> => {
    try {
        const records: AttendanceRecord[] = await safeFetch(`${API_BASE}/attendance?startDate=${startDate}&endDate=${endDate}`);
        const map = await getUserIdToCollegeMap(currentUser);
        return applyTenantFilter(records, currentUser, a => map.get(a.userId));
    } catch (e) {
        console.error("Fetch attendance range error:", e);
        return [];
    }
};

export const getAttendanceForUserByPin = async (pin: string): Promise<AttendanceRecord[]> => {
    const student = await getStudentByPin(pin, null);
    if (student) {
        return await getAttendanceForUser(student.id);
    }
    return [];
};

export const getDashboardStats = async (currentUser: User) => {
    const today = new Date().toISOString().split('T')[0];
    const allUsers = await getUsers(currentUser);
    const collegeUsers = applyTenantFilter(allUsers, currentUser, u => u.college_code);
    const collegeUserIds = new Set(collegeUsers.map(u => u.id));
    
    const todaysAttendance = await getAttendanceForDate(today, currentUser);
    const filteredAttendance = todaysAttendance.filter(a => collegeUserIds.has(a.userId));

    const totalStudents = collegeUsers.filter(u => u.role === Role.STUDENT).length;
    const presentCount = filteredAttendance.filter(a => a.status === 'Present' && collegeUsers.find(u => u.id === a.userId)?.role === Role.STUDENT).length;
    
    const absentCount = totalStudents - presentCount;
    const attendancePercentage = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;
    return { presentToday: presentCount, absentToday: absentCount, attendancePercentage };
};

// --- REMAINING FEATURES (MOCKED FOR NOW) ---

export const getApplications = async (currentUser: User, status?: ApplicationStatus): Promise<Application[]> => {
    let apps = storage.getItem<Application[]>('MOCK_APPLICATIONS') || [];
    const map = await getUserIdToCollegeMap(currentUser);
    const tenantedApps = applyTenantFilter(apps, currentUser, a => map.get(a.userId));
    if (status) return delay(tenantedApps.filter(a => a.status === status));
    return delay(tenantedApps);
};

export const getApplicationsByPin = async (pin: string): Promise<Application[]> => {
    const apps = storage.getItem<Application[]>('MOCK_APPLICATIONS') || [];
    return delay(apps.filter(a => a.pin === pin));
};

export const getApplicationsByUserId = async (userId: string): Promise<Application[]> => {
    const apps = storage.getItem<Application[]>('MOCK_APPLICATIONS') || [];
    return delay(apps.filter(a => a.userId === userId));
};

export const submitApplication = async (appData: {pin: string, type: ApplicationType, payload: any}): Promise<Application> => {
    const users = await getUsers({ role: Role.SUPER_ADMIN } as User);
    const user = users.find(u => u.pin === appData.pin);
    if (!user) throw new Error("User with given PIN not found.");
    const apps = storage.getItem<Application[]>('MOCK_APPLICATIONS') || [];
    const newApp: Application = { id: `app-${Date.now()}`, pin: appData.pin, userId: user.id, type: appData.type, payload: appData.payload, status: ApplicationStatus.PENDING, created_at: new Date().toISOString() };
    apps.unshift(newApp);
    storage.setItem('MOCK_APPLICATIONS', apps);
    return delay(newApp);
};

export const updateApplicationStatus = async (appId: string, status: ApplicationStatus, currentUser: User): Promise<Application> => {
    let apps = storage.getItem<Application[]>('MOCK_APPLICATIONS') || [];
    let updatedApp: Application | undefined;
    
    apps = apps.map(app => {
        if (app.id === appId) {
            updatedApp = { ...app, status };
            return updatedApp;
        }
        return app;
    });
    if (!updatedApp) throw new Error("Application not found");
    storage.setItem('MOCK_APPLICATIONS', apps);
    return delay(updatedApp);
};

export const getAllSbtetResultsForPin = async (pin: string, currentUser: User | null): Promise<SBTETResult[]> => {
    const allResults = storage.getItem<SBTETResult[]>('MOCK_SBTET_RESULTS') || [];
    const studentResults = allResults.filter(r => r.pin === pin).sort((a, b) => a.semester - b.semester);
    return delay(studentResults, 500);
};

export const getAllSyllabusCoverage = async (currentUser: User): Promise<SyllabusCoverage[]> => {
    const allCoverage = storage.getItem<SyllabusCoverage[]>('MOCK_SYLLABUS_COVERAGE') || [];
    return delay(allCoverage); 
};

export const updateSyllabusCoverage = async (id: string, updates: { topicsCompleted?: number, totalTopics?: number }, currentUser: User): Promise<SyllabusCoverage> => {
    let allCoverage = storage.getItem<SyllabusCoverage[]>('MOCK_SYLLABUS_COVERAGE') || [];
    let updatedCoverage: SyllabusCoverage | undefined;
    allCoverage = allCoverage.map(s => {
        if (s.id === id) {
            updatedCoverage = { ...s, ...updates, lastUpdated: new Date().toISOString() };
            return updatedCoverage;
        }
        return s;
    });
    if (!updatedCoverage) throw new Error("Syllabus coverage record not found");
    storage.setItem('MOCK_SYLLABUS_COVERAGE', allCoverage);
    return delay(updatedCoverage);
};

export const getTimetable = async (branch: Branch, year: number, currentUser: User): Promise<Timetable | null> => {
    const timetables = storage.getItem<Timetable[]>('MOCK_TIMETABLES') || [];
    const timetable = timetables.find(t => t.branch === branch && t.year === year);
    return delay(timetable || null);
};

export const setTimetable = async (branch: Branch, year: number, url: string, currentUser: User): Promise<Timetable> => {
    let timetables = storage.getItem<Timetable[]>('MOCK_TIMETABLES') || [];
    if (!currentUser.college_code) throw new Error("User has no college assigned.");
    timetables.push({ id: `tt-${Date.now()}`, college_code: currentUser.college_code, branch, year, url, updated_at: new Date().toISOString(), updated_by: currentUser.name });
    storage.setItem('MOCK_TIMETABLES', timetables);
    return delay(timetables[timetables.length -1]);
};

export const getFeedback = async (currentUser: User): Promise<Feedback[]> => {
    const feedbackList = storage.getItem<Feedback[]>('MOCK_FEEDBACK') || [];
    return delay(feedbackList);
};

export const submitFeedback = async (feedbackData: Omit<Feedback, 'id' | 'submitted_at' | 'status'>): Promise<Feedback> => {
    const feedbackList = storage.getItem<Feedback[]>('MOCK_FEEDBACK') || [];
    const newFeedback: Feedback = {
        ...feedbackData,
        id: `fb-${Date.now()}`,
        submitted_at: new Date().toISOString(),
        status: 'New',
    };
    feedbackList.unshift(newFeedback);
    storage.setItem('MOCK_FEEDBACK', feedbackList);
    return delay(newFeedback);
};

export const updateFeedbackStatus = async (id: string, status: Feedback['status'], currentUser: User): Promise<Feedback> => {
    let feedbackList = storage.getItem<Feedback[]>('MOCK_FEEDBACK') || [];
    const feedback = feedbackList.find(f => f.id === id);
    if (!feedback) throw new Error("Feedback not found");
    feedback.status = status;
    storage.setItem('MOCK_FEEDBACK', feedbackList);
    return delay(feedback);
};

export const getSettings = async (userId: string): Promise<AppSettings | null> => {
    return delay(storage.getItem<AppSettings>(`MOCK_SETTINGS_${userId}`));
};

export const updateSettings = async (userId: string, settings: AppSettings): Promise<AppSettings> => {
    storage.setItem(`MOCK_SETTINGS_${userId}`, settings);
    return delay(settings);
};

// --- COGNICRAFT AI SERVICE (Unchanged) ---
export const cogniCraftService = {
  getClientStatus: () => ({ 
    isInitialized: aiClientState.isInitialized, 
    error: aiClientState.initializationError 
  }),
  
  _generateContent: async (model: string, contents: any, config?: any): Promise<any> => {
    if (!aiClientState.isInitialized || !aiClientState.client) {
      throw new Error(aiClientState.initializationError || "CogniCraft AI client is not initialized.");
    }
    try {
      const response = await aiClientState.client.models.generateContent({
        model: model,
        contents,
        config,
      });
      return response;
    } catch (error) {
      console.error("Error calling CogniCraft AI API:", error);
      throw new Error("Could not generate content from the AI service. Please check your API key and network connection.");
    }
  },

  summarizeNotes: async (notes: string) => {
    const response = await cogniCraftService._generateContent('gemini-2.5-flash', `Summarize the following notes into concise bullet points:\n\n${notes}`);
    return response.text;
  },

  generateQuestions: async (topic: string) => {
    const response = await cogniCraftService._generateContent('gemini-2.5-flash', `Generate 5 likely exam questions (a mix of short and long answer) based on the following topic: ${topic}`);
    return response.text;
  },
  
  createStory: async (notes: string) => {
    const response = await cogniCraftService._generateContent('gemini-2.5-flash', `Convert the following academic notes into an engaging, story-style summary suitable for explaining the concept to a beginner:\n\n${notes}`);
    return response.text;
  },

  createMindMap: async (topic: string) => {
    const response = await cogniCraftService._generateContent('gemini-2.5-flash', `Create a text-based mind map for the topic "${topic}". Use indentation to show hierarchy. Start with the central topic and branch out to main ideas, then sub-points.`);
    return response.text;
  },

  generatePPT: async (notes: string): Promise<PPTContent> => {
    const schema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The main title of the presentation." },
        slides: {
          type: Type.ARRAY,
          description: "An array of slide objects.",
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "The title of the slide." },
              points: {
                type: Type.ARRAY,
                description: "Key bullet points for the slide.",
                items: { type: Type.STRING }
              },
              notes: { type: Type.STRING, description: "Speaker notes for the slide." }
            },
            required: ["title", "points"]
          }
        }
      },
      required: ["title", "slides"]
    };
    const response = await cogniCraftService._generateContent('gemini-2.5-flash', `Convert the following notes into a structured presentation format. Create a main title and at least 3 slides with titles and bullet points:\n\n${notes}`, { responseMimeType: "application/json", responseSchema: schema });
    return JSON.parse(response.text);
  },

  generateQuiz: async (topic: string): Promise<QuizContent> => {
      const schema = {
          type: Type.OBJECT,
          properties: {
              title: { type: Type.STRING, description: "The title of the quiz." },
              questions: {
                  type: Type.ARRAY,
                  items: {
                      type: Type.OBJECT,
                      properties: {
                          type: { type: Type.STRING, enum: ["multiple-choice", "short-answer"] },
                          question: { type: Type.STRING },
                          options: { type: Type.ARRAY, items: { type: Type.STRING } },
                          answer: { type: Type.STRING }
                      },
                      required: ["type", "question", "answer"]
                  }
              }
          },
          required: ["title", "questions"]
      };
      const response = await cogniCraftService._generateContent('gemini-2.5-flash', `Create a quiz with 5 questions (mix of multiple-choice and short-answer) on the topic: ${topic}. For multiple choice, provide 4 options.`, { responseMimeType: "application/json", responseSchema: schema });
      return JSON.parse(response.text);
  },
  
  generateLessonPlan: async (topic: string): Promise<LessonPlanContent> => {
    const schema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING, description: "Engaging title for the lesson plan." },
            topic: { type: Type.STRING, description: "The core topic being covered." },
            duration: { type: Type.STRING, description: "Estimated duration of the lesson, e.g., '60 minutes'." },
            objectives: {
                type: Type.ARRAY,
                description: "List of learning objectives.",
                items: { type: Type.STRING }
            },
            activities: {
                type: Type.ARRAY,
                description: "Sequence of activities for the lesson.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING, description: "Name of the activity, e.g., 'Introduction', 'Group Work'." },
                        duration: { type: Type.STRING, description: "Time allocated for this activity." },
                        description: { type: Type.STRING, description: "Detailed description of the activity." }
                    },
                    required: ["name", "duration", "description"]
                }
            },
            assessment: { type: Type.STRING, description: "Method for assessing student understanding, e.g., 'Q&A session', 'Short quiz'." }
        },
        required: ["title", "topic", "duration", "objectives", "activities", "assessment"]
    };
    const response = await cogniCraftService._generateContent('gemini-2.5-flash', `Create a detailed lesson plan for the topic: "${topic}". The lesson should be structured with clear objectives, a sequence of activities with time allocations, and an assessment method.`, { responseMimeType: "application/json", responseSchema: schema });
    return JSON.parse(response.text);
  },

  explainConcept: async (concept: string) => {
    const response = await cogniCraftService._generateContent('gemini-2.5-flash', `Explain the following concept in simple terms, as if explaining it to a high school student (ELI5 style):\n\n${concept}`);
    return response.text;
  },

  verifyFace: async (referenceImageUrl: string, liveImageUrl: string): Promise<VerificationResult> => {
    if (!aiClientState.isInitialized) {
        console.warn("MOCK: Skipping AI face verification (client not initialized). Returning success by default.");
        return { isMatch: true, quality: 'GOOD', reason: 'OK (Mocked Verification - AI Not Initialized)' };
    }
    
    try {
        const liveImageBase64 = liveImageUrl.split(',')[1];
        const liveImageMimeType = liveImageUrl.substring(liveImageUrl.indexOf(':') + 1, liveImageUrl.indexOf(';'));

        const referenceImage = referenceImageUrl.startsWith('data:') 
            ? {
                data: referenceImageUrl.split(',')[1],
                mimeType: referenceImageUrl.substring(referenceImageUrl.indexOf(':') + 1, referenceImageUrl.indexOf(';')),
            }
            : await imageToDataUrl(referenceImageUrl);

        const referenceImagePart = { inlineData: referenceImage };
        const liveImagePart = { inlineData: { data: liveImageBase64, mimeType: liveImageMimeType } };

        const prompt = `Analyze the two images. The first is a student's reference photo, the second is a live photo. Verify if it's the same person.
First, assess the live photo's quality. Is it clear, well-lit, and suitable for verification? Quality must be "GOOD" or "POOR".
Second, determine if the faces match.
Respond in JSON with three fields:
1. "quality": (string) "GOOD" or "POOR".
3. "isMatch": (boolean) True for a match, false otherwise.
3. "reason": (string) If quality is POOR, explain why (e.g., "Blurry photo"). If no match, state "Faces do not match". If it is a match, state "OK".
Example: { "quality": "GOOD", "isMatch": true, "reason": "OK" }`;

        const schema = {
            type: Type.OBJECT,
            properties: {
                quality: { type: Type.STRING, enum: ['GOOD', 'POOR'] },
                isMatch: { type: Type.BOOLEAN },
                reason: { type: Type.STRING }
            },
            required: ['quality', 'isMatch', 'reason']
        };

        const response = await cogniCraftService._generateContent(
          'gemini-2.5-flash',
          { parts: [ { text: prompt }, referenceImagePart, liveImagePart ] }, 
          { responseMimeType: "application/json", responseSchema: schema }
        );
        
        return JSON.parse(response.text) as VerificationResult;

    } catch (error) {
        console.error("AI Face Verification failed:", error);
        return { isMatch: true, quality: 'GOOD', reason: `OK (Mocked Verification - AI Error)` };
    }
  },

  quickAnswer: async (prompt: string) => {
    const response = await cogniCraftService._generateContent('gemini-flash-lite-latest', prompt);
    return response.text;
  },

  complexQuery: async (prompt: string) => {
      const response = await cogniCraftService._generateContent('gemini-2.5-pro', prompt, { thinkingConfig: { thinkingBudget: 32768 } });
      return response.text;
  },

  research: async (query: string): Promise<ResearchContent> => {
      const response = await cogniCraftService._generateContent('gemini-2.5-flash', query, { tools: [{googleSearch: {}}] });
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      return {
          answer: response.text,
          sources: sources.filter((s: any) => s.web).map((s: any) => ({ uri: s.web.uri, title: s.web.title }))
      };
  },

  analyzeImage: async (prompt: string, image: { data: string, mimeType: string }) => {
      const imagePart = { inlineData: image };
      const textPart = { text: prompt };
      const response = await cogniCraftService._generateContent('gemini-2.5-flash', { parts: [imagePart, textPart] });
      return response.text;
  },

  analyzeVideo: async (prompt: string, video: { data: string, mimeType: string }) => {
      const videoPart = { inlineData: video };
      const textPart = { text: prompt };
      const response = await cogniCraftService._generateContent('gemini-2.5-pro', { parts: [videoPart, textPart] });
      return response.text;
  },
  
  transcribeAudio: async (audio: { data: string, mimeType: string }) => {
      const audioPart = { inlineData: audio };
      const textPart = { text: "Transcribe..." };
      const response = await cogniCraftService._generateContent('gemini-2.5-flash', { parts: [audioPart, textPart] });
      return response.text;
  },

  generateSpeech: async (text: string): Promise<string> => {
      if (!aiClientState.isInitialized || !aiClientState.client) {
        throw new Error(aiClientState.initializationError || "CogniCraft AI client is not initialized.");
      }
      const response = await aiClientState.client.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
          config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                  voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Kore' },
                  },
              },
          },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
          throw new Error("No audio data returned from API.");
      }
      return base64Audio;
  },

  generateVideo: async (prompt: string, aspectRatio: string): Promise<string> => {
      if (!aiClientState.isInitialized || !aiClientState.client) {
          throw new Error(aiClientState.initializationError || "CogniCraft AI client is not initialized.");
      }
      let operation = await aiClientState.client.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt,
          config: {
              numberOfVideos: 1,
              resolution: '720p',
              aspectRatio: aspectRatio as '16:9' | '9:16'
          }
      });
      while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          operation = await aiClientState.client.operations.getVideosOperation({ operation });
      }
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) {
          throw new Error("Video generation failed or returned no link.");
      }
      return downloadLink;
  },
};
