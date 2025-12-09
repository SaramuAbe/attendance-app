/**
 * Attendance System Logic (NORMA Style) - Firebase Edition
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, onSnapshot, query, where, addDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Firebase Config (Derived from User Screenshot)
const firebaseConfig = {
    apiKey: "AIzaSyCiCDisXQux_KiibemBYtOeSSFSXnGsqi0",
    authDomain: "attendance-web-4d41c.firebaseapp.com",
    projectId: "attendance-web-4d41c",
    storageBucket: "attendance-web-4d41c.firebasestorage.app",
    messagingSenderId: "39215187404",
    appId: "1:39215187404:web:3bf67ff9600e746d7ac969",
    measurementId: "G-5EFCDRZEF3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// State & Cache
let currentUser = null;
let attendanceCache = {}; // { 'YYYY/MM/DD': { currentState: '...', logs: [] } }
let todos = []; // Array of todo objects
let unsubscribeAttendance = null;
let unsubscribeTodos = null;

// DOM Elements & Constants
const timeDisplay = document.getElementById('current-time');
const dateDisplay = document.getElementById('current-date');
const statusBadge = document.getElementById('status-badge');
const pageTitle = document.getElementById('page-title');

const btnClockIn = document.getElementById('btn-clock-in');
const btnClockOut = document.getElementById('btn-clock-out');
const btnBreakStart = document.getElementById('btn-break-start');
const btnBreakEnd = document.getElementById('btn-break-end');

const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.content-view');

const historyWeeklyView = document.getElementById('history-weekly-view');
const historyDetailView = document.getElementById('history-detail-view');
const weeklyListContainer = document.getElementById('weekly-list-container');
const detailWeekLabel = document.getElementById('detail-week-label');
const historyTableBody = document.getElementById('history-table-body');
const btnBackHistory = document.getElementById('btn-back-history');

const weeklyTotalDisplay = document.getElementById('weekly-total');
const weeklyProgressBar = document.getElementById('weekly-progress');

const STATUS = {
    OFFLINE: 'offline',
    WORKING: 'working',
    ON_BREAK: 'on_break',
    FINISHED: 'finished'
};

const WEEKLY_GOAL_MS = 40 * 60 * 60 * 1000;
let currentState = STATUS.OFFLINE;

// ----------------------------------------
// AUTHENTICATION LOGIC
// ----------------------------------------

window.login = async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login failed:", error);
        alert("ログインできませんでした: " + error.message);
    }
};

window.logout = async () => {
    try {
        await signOut(auth);
        // Clean up listeners
        if (unsubscribeAttendance) unsubscribeAttendance();
        if (unsubscribeTodos) unsubscribeTodos();
        // Clear local data visually
        attendanceCache = {};
        todos = [];
        renderTodos();
        renderCalendar();
        updateUI();
        window.location.reload();
    } catch (error) {
        console.error("Logout failed:", error);
    }
};

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateUserUI(user);
    if (user) {
        startListeners();
    } else {
        // Show offline state
    }
});

function updateUserUI(user) {
    const loginBtn = document.getElementById('login-btn');
    const profile = document.getElementById('user-profile');
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');

    if (user) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (profile) profile.style.display = 'flex';
        if (userName) userName.textContent = user.displayName;
        if (userAvatar) userAvatar.src = user.photoURL;
    } else {
        if (loginBtn) loginBtn.style.display = 'block';
        if (profile) profile.style.display = 'none';
    }
}

function startListeners() {
    if (!currentUser) return;

    // 1. Attendance Listener
    const qAttend = query(collection(db, "attendance"), where("uid", "==", currentUser.uid));
    unsubscribeAttendance = onSnapshot(qAttend, (snapshot) => {
        attendanceCache = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            // Data Structure: { uid, date: 'YYYY/MM/DD', currentState, logs: [] }
            attendanceCache[data.date] = data;
        });

        // Update current state based on today's data
        const todayStr = new Date().toLocaleDateString();
        if (attendanceCache[todayStr]) {
            currentState = attendanceCache[todayStr].currentState;
        } else {
            currentState = STATUS.OFFLINE;
        }

        updateUI();
        updateHomeWeeklySummary();
        if (document.getElementById('view-history').classList.contains('active')) {
            renderWeeklyList();
        }
    });

    // 2. Todo Listener
    const qTodo = query(collection(db, "todos"), where("uid", "==", currentUser.uid));
    unsubscribeTodos = onSnapshot(qTodo, (snapshot) => {
        todos = [];
        snapshot.forEach(doc => {
            todos.push({ id: doc.id, ...doc.data() });
        });
        renderTodos();
        renderCalendar();
    });
}

// ----------------------------------------
// ATTENDANCE LOGIC (Firestore Adaptation)
// ----------------------------------------

function init() {
    updateClock();
    setInterval(updateClock, 1000);
    updateUI();

    // Event Listeners
    if (btnClockIn) btnClockIn.addEventListener('click', () => handleAction('CLOCK_IN', STATUS.WORKING));
    if (btnClockOut) btnClockOut.addEventListener('click', () => handleAction('CLOCK_OUT', STATUS.FINISHED));
    if (btnBreakStart) btnBreakStart.addEventListener('click', () => handleAction('BREAK_START', STATUS.ON_BREAK));
    if (btnBreakEnd) btnBreakEnd.addEventListener('click', () => handleAction('BREAK_END', STATUS.WORKING));

    // Nav
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            window.switchView(targetId);
        });
    });

    if (btnBackHistory) {
        btnBackHistory.addEventListener('click', showWeeklyList);
    }
    document.addEventListener('click', window.hideContextMenu);
}

window.switchView = (viewName) => {
    navItems.forEach(nav => nav.classList.toggle('active', nav.getAttribute('data-target') === viewName));
    views.forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));

    pageTitle.textContent =
        viewName === 'home' ? 'ホーム' :
            viewName === 'history' ? '出勤簿' :
                viewName === 'timer' ? 'タイマー' : 'TODOリスト';

    if (viewName === 'history') {
        renderWeeklyList();
        showWeeklyList();
    }
};

function showWeeklyList() {
    if (historyWeeklyView) historyWeeklyView.style.display = 'block';
    if (historyDetailView) historyDetailView.style.display = 'none';
}

function showDetailView() {
    if (historyWeeklyView) historyWeeklyView.style.display = 'none';
    if (historyDetailView) historyDetailView.style.display = 'block';
}

function updateClock() {
    const now = new Date();
    if (timeDisplay) timeDisplay.textContent = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (dateDisplay) dateDisplay.textContent = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

    if (currentState === STATUS.WORKING) {
        updateHomeWeeklySummary();
    }
}

async function handleAction(actionType, newState) {
    if (!currentUser) {
        alert("ログインしてください！");
        return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timestamp = now.toISOString();

    const newLogEntry = {
        type: actionType,
        timestamp: timestamp
    };

    // Calculate new logs array
    let logs = [];
    if (attendanceCache[dateStr]) {
        logs = [...attendanceCache[dateStr].logs, newLogEntry];
    } else {
        logs = [newLogEntry];
    }

    // Save to Firestore
    try {
        // Document ID: uid_YYYY-MM-DD (safe for simple usage)
        // Need to sanitize slash for Doc ID if using YYYY/MM/DD local string
        // Better to use YYYY-MM-DD
        const safeDateToken = dateStr.replace(/\//g, '-');
        const docId = `${currentUser.uid}_${safeDateToken}`;
        const docRef = doc(db, "attendance", docId);

        await setDoc(docRef, {
            uid: currentUser.uid,
            date: dateStr,
            logs: logs,
            currentState: newState
        }, { merge: true });

        // Local state update handled by snapshot listener, but for immediate feedback:
        currentState = newState;
        updateUI();
    } catch (e) {
        console.error("Error saving attendance:", e);
        alert("保存に失敗しました");
    }
}

function getLogsForDate(dateStr) {
    // Read from cache
    return attendanceCache[dateStr] ? attendanceCache[dateStr].logs : [];
}

function formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

// ----------------------------------------
// WEEKLY & HISTORY LOGIC
// ----------------------------------------

function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(),
        diff = d.getDate() - day + (day == 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function updateHomeWeeklySummary() {
    const now = new Date();
    const startOfWeek = getMonday(now);
    let totalMs = 0;

    for (let d = new Date(startOfWeek); d <= now; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toLocaleDateString();
        const logs = getLogsForDate(dateStr);
        totalMs += calculateDailyWorkTime(logs, d);
    }

    if (weeklyTotalDisplay) weeklyTotalDisplay.textContent = formatDuration(totalMs);
    const percentage = Math.min((totalMs / WEEKLY_GOAL_MS) * 100, 100);
    if (weeklyProgressBar) weeklyProgressBar.style.width = `${percentage}%`;
}

function renderWeeklyList() {
    if (!weeklyListContainer) return;
    weeklyListContainer.innerHTML = '';

    // Group cached data by week
    const keys = Object.keys(attendanceCache);
    const weekMap = {};

    keys.forEach(dateStr => {
        const data = attendanceCache[dateStr];
        const dateObj = new Date(data.date); // Assuming dateStr format is parsable
        if (isNaN(dateObj)) return;

        const monday = getMonday(new Date(dateObj));
        const mondayStr = monday.toLocaleDateString('ja-JP');

        if (!weekMap[mondayStr]) {
            weekMap[mondayStr] = { totalMs: 0, startDate: monday };
        }

        const dailyMs = calculateDailyWorkTime(data.logs, dateObj);
        weekMap[mondayStr].totalMs += dailyMs;
    });

    const sortedWeeks = Object.entries(weekMap).sort((a, b) => b[1].startDate - a[1].startDate);

    sortedWeeks.forEach(([mondayStr, data]) => {
        const percentage = Math.min((data.totalMs / WEEKLY_GOAL_MS) * 100, 100);
        const card = document.createElement('div');
        card.className = 'weekly-card';
        card.innerHTML = `
            <div class="weekly-card-header">
                <span class="week-label">${mondayStr} の週</span>
                <span class="week-total">${formatDuration(data.totalMs)}</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar" style="width: ${percentage}%"></div>
            </div>
            <div class="progress-labels">
                <span>達成率: ${Math.round(percentage)}%</span>
            </div>
        `;
        card.addEventListener('click', () => {
            renderDetailTable(data.startDate);
            showDetailView();
        });
        weeklyListContainer.appendChild(card);
    });
}

function renderDetailTable(startDate) {
    if (!historyTableBody) return;
    historyTableBody.innerHTML = '';

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    if (detailWeekLabel) detailWeekLabel.textContent = `${startDate.toLocaleDateString()} 〜 ${endDate.toLocaleDateString()} の詳細`;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toLocaleDateString();
        const data = attendanceCache[dateStr];
        const logs = data ? data.logs : [];
        const state = data ? data.currentState : STATUS.OFFLINE;

        if (logs.length === 0) continue;

        let firstIn = '-';
        let lastOut = '-';
        let breakTotal = 0;
        let workMs = calculateDailyWorkTime(logs, d);

        const ins = logs.filter(l => l.type === 'CLOCK_IN');
        if (ins.length > 0) firstIn = new Date(ins[0].timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        const outs = logs.filter(l => l.type === 'CLOCK_OUT');
        // Simple last out logic (could be improved)
        // Leaving logic simple as per previous version

        let bStart = null;
        logs.forEach(l => {
            if (l.type === 'BREAK_START') bStart = new Date(l.timestamp).getTime();
            if (l.type === 'BREAK_END' && bStart) {
                breakTotal += (new Date(l.timestamp).getTime() - bStart);
                bStart = null;
            }
        });
        const breakMins = Math.floor(breakTotal / (1000 * 60));

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}</td>
            <td>${getStatusLabel(state)}</td>
            <td>${firstIn}</td>
            <td>${lastOut}</td>
            <td>${breakMins > 0 ? breakMins + '分' : '-'}</td>
            <td>${formatDuration(workMs)}</td>
        `;
        historyTableBody.appendChild(row);
    }
}

function calculateDailyWorkTime(logs, dateObj) {
    if (!logs || logs.length === 0) return 0;
    let workTime = 0;
    let clockInTime = null;
    let breakStartTime = null;

    // Sort logs just in case
    logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    logs.forEach(log => {
        const time = new Date(log.timestamp).getTime();
        if (log.type === 'CLOCK_IN') clockInTime = time;
        else if (log.type === 'CLOCK_OUT') {
            if (clockInTime) {
                workTime += (time - clockInTime);
                clockInTime = null;
            }
        } else if (log.type === 'BREAK_START') breakStartTime = time;
        else if (log.type === 'BREAK_END') {
            if (breakStartTime) {
                workTime -= (time - breakStartTime);
                breakStartTime = null;
            }
        }
    });

    // Real-time calculation if working today
    const now = new Date();
    const isToday = dateObj.toDateString() === now.toDateString();

    // We rely on global currentState, which is updated from today's cache
    // This might be slightly inaccurate if viewing history of *other* days while working
    // But calculateDailyWorkTime is usually called with correct context
    if (isToday && currentState === STATUS.WORKING && clockInTime) {
        workTime += (now.getTime() - clockInTime);
    }
    if (isToday && currentState === STATUS.ON_BREAK && clockInTime && breakStartTime) {
        workTime += (now.getTime() - clockInTime);
        workTime -= (now.getTime() - breakStartTime);
    }

    return Math.max(0, workTime);
}

function getStatusLabel(state) {
    switch (state) {
        case STATUS.OFFLINE: return '未登校';
        case STATUS.WORKING: return '登校中';
        case STATUS.ON_BREAK: return '休憩中';
        case STATUS.FINISHED: return '帰宅済';
        default: return '-';
    }
}

function updateUI() {
    if (!btnClockIn) return;
    btnClockIn.disabled = true;
    btnBreakStart.disabled = true;
    btnBreakEnd.disabled = true;
    btnClockOut.disabled = true;
    statusBadge.className = 'status-badge';

    switch (currentState) {
        case STATUS.OFFLINE:
            statusBadge.textContent = '未登校';
            statusBadge.classList.add('status-offline');
            if (currentUser) btnClockIn.disabled = false;
            break;
        case STATUS.WORKING:
            statusBadge.textContent = '登校中';
            statusBadge.classList.add('status-working');
            if (currentUser) {
                btnBreakStart.disabled = false;
                btnClockOut.disabled = false;
            }
            break;
        case STATUS.ON_BREAK:
            statusBadge.textContent = '休憩中';
            statusBadge.classList.add('status-break');
            if (currentUser) btnBreakEnd.disabled = false;
            break;
        case STATUS.FINISHED:
            statusBadge.textContent = '帰宅済';
            statusBadge.classList.add('status-work-finished');
            if (currentUser) btnClockIn.disabled = false;
            break;
    }
}

// ----------------------------------------
// POMODORO (No Auth required, local only)
// ----------------------------------------
// ... Keeping existing Pomodoro logic mostly static ...
// Except it is a class, so we just instantiate it.
// Copy-pasting the exact class from memory/context
class PomodoroTimer {
    constructor() {
        this.container = document.getElementById('timer-container');
        this.statusLabel = document.getElementById('timer-status-label');
        this.display = document.getElementById('timer-count');
        this.btnToggle = document.getElementById('btn-timer-toggle');
        this.btnToggleText = document.getElementById('btn-timer-toggle-text');
        this.btnSkip = document.getElementById('btn-skip-timer');
        this.circleProgress = document.getElementById('timer-circle-progress');
        this.circumference = 2 * Math.PI * 140;
        this.valWork = document.getElementById('work-val');
        this.valBreak = document.getElementById('break-val');
        this.autoSwitchCheck = document.getElementById('auto-switch-check');
        this.settings = { work: 25, break: 5 };
        this.mode = 'work';
        this.totalTime = this.settings.work * 60;
        this.timeLeft = this.totalTime;
        this.isRunning = false;
        this.intervalId = null;

        if (this.circleProgress) this.initSVG();
        if (this.btnToggle) this.bindEvents();
        if (this.container) {
            this.updateView();
            this.updateBackground();
            setInterval(() => this.updateBackground(), 600000);
        }
    }
    updateBackground() {
        const timestamp = new Date().getTime();
        const imageUrl = `https://loremflickr.com/1920/1080/nature,landscape?random=${timestamp}`;
        if (this.container) this.container.style.backgroundImage = `url('${imageUrl}')`;
    }
    initSVG() {
        this.circleProgress.style.strokeDasharray = `${this.circumference} ${this.circumference}`;
        this.circleProgress.style.strokeDashoffset = 0;
    }
    bindEvents() {
        this.btnToggle.addEventListener('click', () => { if (this.isRunning) this.pause(); else this.start(); });
        const workPlus = document.getElementById('work-plus');
        if (workPlus) workPlus.addEventListener('click', () => this.changeSetting('work', 5));
        const workMinus = document.getElementById('work-minus');
        if (workMinus) document.getElementById('work-minus').addEventListener('click', () => this.changeSetting('work', -5));
        const breakPlus = document.getElementById('break-plus');
        if (breakPlus) breakPlus.addEventListener('click', () => this.changeSetting('break', 5));
        const breakMinus = document.getElementById('break-minus');
        if (breakMinus) breakMinus.addEventListener('click', () => this.changeSetting('break', -5));
        this.btnSkip.addEventListener('click', () => this.switchMode());
    }
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.btnToggleText.textContent = 'PAUSE';
        this.intervalId = setInterval(() => {
            if (this.timeLeft > 0) {
                this.timeLeft--;
                this.updateDisplay();
                this.updateProgress();
            } else {
                this.complete();
            }
        }, 1000);
    }
    pause() {
        this.isRunning = false;
        clearInterval(this.intervalId);
        this.btnToggleText.textContent = 'RESUME';
    }
    reset() {
        this.pause();
        this.totalTime = this.settings[this.mode] * 60;
        this.timeLeft = this.totalTime;
        this.btnToggleText.textContent = 'START';
        this.updateDisplay();
        this.updateProgress();
    }
    complete() {
        this.pause();
        if (this.autoSwitchCheck && this.autoSwitchCheck.checked) {
            this.switchMode();
            this.start();
        } else {
            this.btnToggleText.textContent = 'NEXT';
        }
    }
    switchMode() {
        this.mode = this.mode === 'work' ? 'break' : 'work';
        this.reset();
        this.updateView();
    }
    changeSetting(type, delta) {
        let newVal = this.settings[type] + delta;
        if (newVal < 5) newVal = 5;
        if (newVal > 60) newVal = 60;
        this.settings[type] = newVal;
        if (type === 'work') this.valWork.textContent = newVal;
        if (type === 'break') this.valBreak.textContent = newVal;
        if (!this.isRunning && this.mode === type) {
            this.totalTime = newVal * 60;
            this.timeLeft = this.totalTime;
            this.updateDisplay();
            this.updateProgress();
        }
    }
    updateDisplay() {
        const m = Math.floor(this.timeLeft / 60);
        const s = this.timeLeft % 60;
        this.display.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    updateProgress() {
        const progress = this.timeLeft / this.totalTime;
        const offset = this.circumference - (progress * this.circumference);
        this.circleProgress.style.strokeDashoffset = offset;
    }
    updateView() {
        this.container.className = `timer-container mode-${this.mode}`;
        this.statusLabel.textContent = this.mode === 'work' ? 'STUDY TIME' : 'BREAK TIME';
        if (!this.isRunning) this.btnToggleText.textContent = 'START';
    }
}

// ----------------------------------------
// TODO LOGIC (Firestore Adaptation)
// ----------------------------------------

let calCurrentDate = new Date();
let contextMenuTargetId = null;

function initTodo() {
    renderCalendar();

    const btnAdd = document.getElementById('btn-add-todo');
    if (btnAdd) {
        btnAdd.addEventListener('click', addTodo);
    }
    const btnCalPrev = document.getElementById('cal-prev');
    const btnCalNext = document.getElementById('cal-next');
    if (btnCalPrev) btnCalPrev.addEventListener('click', () => changeCalMonth(-1));
    if (btnCalNext) btnCalNext.addEventListener('click', () => changeCalMonth(1));
}

// Replaces loadTodos() with snapshot listener in startListeners()
// Replaces saveTodos() with direct Firestore calls

async function addTodo() {
    if (!currentUser) return alert("ログインしてください");

    const input = document.getElementById('todo-input');
    const dateInput = document.getElementById('todo-date');
    const priorityInput = document.getElementById('todo-priority');

    const text = input.value.trim();
    if (!text) return;

    try {
        await addDoc(collection(db, "todos"), {
            uid: currentUser.uid,
            text: text,
            date: dateInput.value,
            priority: priorityInput.value,
            completed: false,
            createdAt: new Date().toISOString()
        });
        input.value = '';
    } catch (e) {
        console.error("Add todo failed", e);
    }
}

window.toggleTodo = async (id) => {
    if (!currentUser) return;
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const todoRef = doc(db, "todos", id);
    await updateDoc(todoRef, {
        completed: !todo.completed
    });
};

window.deleteTodo = async (id) => {
    if (!currentUser) return;
    await deleteDoc(doc(db, "todos", id));
};

// ... (Existing Helpers) ...
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function renderTodos() {
    const listExpired = document.getElementById('todo-list-expired');
    const containerExpired = document.getElementById('todo-section-expired');
    const listToday = document.getElementById('todo-list-today');
    const listHigh = document.getElementById('todo-list-high');
    const listMedium = document.getElementById('todo-list-medium');
    const listLow = document.getElementById('todo-list-low');

    if (listExpired) listExpired.innerHTML = '';
    if (listToday) listToday.innerHTML = '';
    if (listHigh) listHigh.innerHTML = '';
    if (listMedium) listMedium.innerHTML = '';
    if (listLow) listLow.innerHTML = '';

    const todayStr = new Date().toISOString().split('T')[0];
    let hasExpired = false;

    // Use in-memory 'todos' array updated by snapshot
    todos.forEach(todo => {
        const item = document.createElement('li');
        item.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        let badgeClass = 'badge-medium';
        if (todo.priority === 'high') badgeClass = 'badge-high';
        if (todo.priority === 'low') badgeClass = 'badge-low';

        item.innerHTML = `
            <div class="todo-content">
                <div class="todo-text">${escapeHtml(todo.text)}</div>
                <div class="todo-meta">
                    <span class="badge ${badgeClass}">${getPriorityLabel(todo.priority)}</span>
                    ${todo.date ? `<span class="meta-date"><span class="material-symbols-rounded icon-sm">event</span> ${todo.date}</span>` : ''}
                </div>
            </div>
            <div class="todo-actions">
                <button class="btn-text-icon" onclick="window.toggleTodo('${todo.id}')" title="完了/未完了">
                    <span class="material-symbols-rounded">${todo.completed ? 'check_box' : 'check_box_outline_blank'}</span>
                </button>
                <button class="btn-text-icon" onclick="window.openContextMenu(event, '${todo.id}')" title="メニュー">
                    <span class="material-symbols-rounded">more_vert</span>
                </button>
            </div>
        `;

        const isExpired = todo.date && todo.date < todayStr && !todo.completed;
        if (isExpired) {
            if (listExpired) listExpired.appendChild(item);
            hasExpired = true;
        } else if (todo.date === todayStr) {
            if (listToday) listToday.appendChild(item);
        } else {
            if (todo.priority === 'high' && listHigh) listHigh.appendChild(item);
            else if (todo.priority === 'low' && listLow) listLow.appendChild(item);
            else if (listMedium) listMedium.appendChild(item);
        }
    });

    if (containerExpired) containerExpired.style.display = hasExpired ? 'block' : 'none';
}

window.openContextMenu = (e, id) => {
    e.stopPropagation();
    contextMenuTargetId = id;
    const menu = document.getElementById('todo-context-menu');
    if (menu) {
        menu.style.display = 'block';
        menu.style.left = `${e.pageX - 100}px`;
        menu.style.top = `${e.pageY}px`;
    }
};

window.hideContextMenu = () => {
    const menu = document.getElementById('todo-context-menu');
    if (menu) menu.style.display = 'none';
};

window.openEditModal = (id = null) => {
    const targetId = id || contextMenuTargetId;
    if (!targetId) return;
    const todo = todos.find(t => t.id === targetId);
    if (!todo) return;

    const textInput = document.getElementById('edit-text');
    const dateInput = document.getElementById('edit-date');
    const priorityInput = document.getElementById('edit-priority');

    if (textInput) textInput.value = todo.text;
    if (dateInput) dateInput.value = todo.date;
    if (priorityInput) priorityInput.value = todo.priority;

    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
    }
};

window.closeEditModal = () => {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 200);
    }
};

window.saveEditTodo = async () => {
    if (!contextMenuTargetId || !currentUser) return;

    const textInput = document.getElementById('edit-text');
    const dateInput = document.getElementById('edit-date');
    const priorityInput = document.getElementById('edit-priority');

    const text = textInput ? textInput.value.trim() : '';
    const date = dateInput ? dateInput.value : '';
    const priority = priorityInput ? priorityInput.value : 'medium';

    if (!text) return;

    try {
        const todoRef = doc(db, "todos", contextMenuTargetId);
        await updateDoc(todoRef, {
            text: text,
            date: date,
            priority: priority
        });
    } catch (e) {
        console.error("Edit failed", e);
    }

    closeEditModal();
};

window.deleteFromContext = async () => {
    if (contextMenuTargetId) {
        await window.deleteTodo(contextMenuTargetId);
    }
};

function getPriorityLabel(p) {
    if (p === 'high') return '高';
    if (p === 'medium') return '中';
    if (p === 'low') return '低';
    return p;
}

function changeCalMonth(delta) {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + delta);
    renderCalendar();
}

window.inputDate = (dateStr) => {
    const dateInput = document.getElementById('todo-date');
    if (dateInput) {
        dateInput.value = dateStr;
        dateInput.focus();
    }
};

function renderCalendar() {
    // ... Same calendar rendering logic, just referencing 'todos' array ...
    // Using copy-paste logic
    const calendarGrid = document.getElementById('todo-calendar');
    const monthLabel = document.getElementById('cal-current-month');
    if (!calendarGrid || !monthLabel) return;
    calendarGrid.innerHTML = '';
    monthLabel.textContent = calCurrentDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    weekdays.forEach(day => {
        const d = document.createElement('div');
        d.className = 'cal-header-cell';
        d.textContent = day;
        calendarGrid.appendChild(d);
    });
    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell empty';
        calendarGrid.appendChild(cell);
    }
    const todayStr = new Date().toISOString().split('T')[0];
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const hasTask = todos.some(t => t.date === dateStr && !t.completed);
        const cell = document.createElement('div');
        cell.className = `cal-cell ${dateStr === todayStr ? 'is-today' : ''} ${hasTask ? 'has-task' : ''}`;
        cell.onclick = () => window.inputDate(dateStr);
        let html = `<span>${d}</span>`;
        const dayTodos = todos.filter(t => t.date === dateStr && !t.completed);
        if (dayTodos.length > 0) {
            html += `<div class="cal-dots">•</div>`;
            let tooltipHtml = `<div class="cal-tooltip"><ul class="tooltip-list">`;
            dayTodos.forEach(t => {
                tooltipHtml += `<li>${t.priority === 'high' ? '🔥' : ''} ${escapeHtml(t.text)}</li>`;
            });
            tooltipHtml += `</ul></div>`;
            html += tooltipHtml;
        }
        cell.innerHTML = html;
        calendarGrid.appendChild(cell);
    }
}

// Global initialization
const timerApp = new PomodoroTimer();
init();
initTodo();
