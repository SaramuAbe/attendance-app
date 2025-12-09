/**
 * Attendance System Logic (NORMA Style)
 */

// DOM Elements
const timeDisplay = document.getElementById('current-time');
const dateDisplay = document.getElementById('current-date');
const statusBadge = document.getElementById('status-badge');
const pageTitle = document.getElementById('page-title');

// Buttons
const btnClockIn = document.getElementById('btn-clock-in');
const btnClockOut = document.getElementById('btn-clock-out');
const btnBreakStart = document.getElementById('btn-break-start');
const btnBreakEnd = document.getElementById('btn-break-end');

// Views & Nav
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.content-view');

// History Views
const historyWeeklyView = document.getElementById('history-weekly-view');
const historyDetailView = document.getElementById('history-detail-view');
const weeklyListContainer = document.getElementById('weekly-list-container');
const detailWeekLabel = document.getElementById('detail-week-label');
const historyTableBody = document.getElementById('history-table-body');
const btnBackHistory = document.getElementById('btn-back-history');

// Weekly Summary in Home
const weeklyTotalDisplay = document.getElementById('weekly-total');
const weeklyProgressBar = document.getElementById('weekly-progress');

// Constants
const STATUS = {
    OFFLINE: 'offline',
    WORKING: 'working',
    ON_BREAK: 'on_break',
    FINISHED: 'finished'
};

const WEEKLY_GOAL_MS = 40 * 60 * 60 * 1000;

// State
let currentState = STATUS.OFFLINE;

// Initialization
function init() {
    updateClock();
    setInterval(updateClock, 1000);

    loadState();
    updateUI();
    updateHomeWeeklySummary();

    // Event Listeners for Actions
    if (btnClockIn) btnClockIn.addEventListener('click', () => handleAction('CLOCK_IN', STATUS.WORKING));
    if (btnClockOut) btnClockOut.addEventListener('click', () => handleAction('CLOCK_OUT', STATUS.FINISHED));
    if (btnBreakStart) btnBreakStart.addEventListener('click', () => handleAction('BREAK_START', STATUS.ON_BREAK));
    if (btnBreakEnd) btnBreakEnd.addEventListener('click', () => handleAction('BREAK_END', STATUS.WORKING));

    // Nav Logic
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            switchView(targetId);
        });
    });

    // History Back Button
    if (btnBackHistory) {
        btnBackHistory.addEventListener('click', () => {
            showWeeklyList();
        });
    }

    // Context Menu Close Listener
    document.addEventListener('click', hideContextMenu);
}

function switchView(viewName) {
    // Update Nav
    navItems.forEach(nav => {
        nav.classList.toggle('active', nav.getAttribute('data-target') === viewName);
    });

    // Update View
    views.forEach(view => {
        const isTarget = view.id === `view-${viewName}`;
        view.classList.toggle('active', isTarget);
    });

    // Update Title
    pageTitle.textContent = viewName === 'home' ? 'ホーム' : '出勤簿';
    if (viewName === 'timer') {
        pageTitle.textContent = 'タイマー';
    }
    if (viewName === 'todo') {
        pageTitle.textContent = 'TODOリスト';
    }

    // If history, render the list
    if (viewName === 'history') {
        renderWeeklyList();
        showWeeklyList(); // Ensure list is shown first
    }
}

function showWeeklyList() {
    if (historyWeeklyView) historyWeeklyView.style.display = 'block';
    if (historyDetailView) historyDetailView.style.display = 'none';
}

function showDetailView() {
    if (historyWeeklyView) historyWeeklyView.style.display = 'none';
    if (historyDetailView) historyDetailView.style.display = 'block';
}

// Clock Logic
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

    if (timeDisplay) timeDisplay.textContent = timeStr;
    if (dateDisplay) dateDisplay.textContent = dateStr;

    if (currentState === STATUS.WORKING) {
        updateHomeWeeklySummary();
    }
}

// Action Handler
function handleAction(actionType, newState) {
    const now = new Date();
    const timestamp = now.toISOString();

    const logEntry = {
        id: Date.now(),
        type: actionType,
        timestamp: timestamp
    };

    currentState = newState;

    saveState(logEntry);
    updateUI();
    updateHomeWeeklySummary();
}

// Storage Logic
function loadState() {
    const today = new Date().toLocaleDateString();
    const storageKey = `attendance_${today}`;
    const storedData = localStorage.getItem(storageKey);

    if (storedData) {
        const data = JSON.parse(storedData);
        currentState = data.currentState;
    } else {
        currentState = STATUS.OFFLINE;
    }
}

function saveState(newLogEntry) {
    const today = new Date().toLocaleDateString();
    const storageKey = `attendance_${today}`;

    let data = localStorage.getItem(storageKey)
        ? JSON.parse(localStorage.getItem(storageKey))
        : { currentState: STATUS.OFFLINE, logs: [] };

    data.currentState = currentState;
    if (newLogEntry) {
        data.logs.push(newLogEntry);
    }

    localStorage.setItem(storageKey, JSON.stringify(data));
}

function getLogsForDate(dateStr) {
    const storageKey = `attendance_${dateStr}`;
    const storedData = localStorage.getItem(storageKey);
    return storedData ? JSON.parse(storedData).logs : [];
}

// Helper: Get formatted duration
function formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

// Weekly Total Logic (Home Screen)
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

// History: Render Weekly List
function renderWeeklyList() {
    if (!weeklyListContainer) return;
    weeklyListContainer.innerHTML = '';

    // Group keys by Week
    const keys = Object.keys(localStorage).filter(k => k.startsWith('attendance_'));
    const weekMap = {}; // 'YYYY-MM-DD (Mon)' -> { totalMs: 0, dates: [] }

    keys.forEach(key => {
        const dateStr = key.replace('attendance_', '');
        const dateObj = new Date(dateStr);

        // Find Monday of this date
        const monday = getMonday(new Date(dateObj));
        const mondayStr = monday.toLocaleDateString('ja-JP');

        if (!weekMap[mondayStr]) {
            weekMap[mondayStr] = { totalMs: 0, startDate: monday };
        }

        const storedData = JSON.parse(localStorage.getItem(key));
        const dailyMs = calculateDailyWorkTime(storedData.logs, dateObj);
        weekMap[mondayStr].totalMs += dailyMs;
    });

    // Sort by week descending
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

// History: Render Detail Table
function renderDetailTable(startDate) {
    if (!historyTableBody) return;
    historyTableBody.innerHTML = '';

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    // Label
    if (detailWeekLabel) detailWeekLabel.textContent = `${startDate.toLocaleDateString()} 〜 ${endDate.toLocaleDateString()} の詳細`;

    // Iterate through the week (Mon-Sun)
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toLocaleDateString();
        const logs = getLogsForDate(dateStr);
        const storedDataRaw = localStorage.getItem(`attendance_${dateStr}`);
        const currentStateForStatus = storedDataRaw ? JSON.parse(storedDataRaw).currentState : STATUS.OFFLINE;

        if (logs.length === 0) continue;

        let firstIn = '-';
        let lastOut = '-';
        let breakTotal = 0;
        let workMs = calculateDailyWorkTime(logs, d);

        const ins = logs.filter(l => l.type === 'CLOCK_IN');
        if (ins.length > 0) {
            firstIn = new Date(ins[0].timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        }

        const outs = logs.filter(l => l.type === 'CLOCK_OUT');
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
            <td>${getStatusLabel(currentStateForStatus)}</td>
            <td>${firstIn}</td>
            <td>${lastOut}</td>
            <td>${breakMins > 0 ? breakMins + '分' : '-'}</td>
            <td>${formatDuration(workMs)}</td>
        `;
        historyTableBody.appendChild(row);
    }
}

// Logic Helpers (Reused)
function calculateDailyWorkTime(logs, dateObj) {
    if (!logs || logs.length === 0) return 0;

    let workTime = 0;
    let clockInTime = null;
    let breakStartTime = null;

    logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    logs.forEach(log => {
        const time = new Date(log.timestamp).getTime();

        if (log.type === 'CLOCK_IN') {
            clockInTime = time;
        } else if (log.type === 'CLOCK_OUT') {
            if (clockInTime) {
                workTime += (time - clockInTime);
                clockInTime = null;
            }
        } else if (log.type === 'BREAK_START') {
            breakStartTime = time;
        } else if (log.type === 'BREAK_END') {
            if (breakStartTime) {
                workTime -= (time - breakStartTime);
                breakStartTime = null;
            }
        }
    });

    const now = new Date();
    const isToday = dateObj.toDateString() === now.toDateString();

    if (isToday && currentState === STATUS.WORKING && clockInTime) {
        workTime += (now.getTime() - clockInTime);
    }
    if (isToday && currentState === STATUS.ON_BREAK && clockInTime && breakStartTime) {
        workTime += (now.getTime() - clockInTime);
        workTime -= (now.getTime() - breakStartTime);
    }

    return Math.max(0, workTime);
}

function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(),
        diff = d.getDate() - day + (day == 0 ? -6 : 1);
    return new Date(d.setDate(diff));
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
            btnClockIn.disabled = false;
            break;
        case STATUS.WORKING:
            statusBadge.textContent = '登校中';
            statusBadge.classList.add('status-working');
            btnBreakStart.disabled = false;
            btnClockOut.disabled = false;
            break;
        case STATUS.ON_BREAK:
            statusBadge.textContent = '休憩中';
            statusBadge.classList.add('status-break');
            btnBreakEnd.disabled = false;
            break;
        case STATUS.FINISHED:
            statusBadge.textContent = '帰宅済';
            statusBadge.classList.add('status-work-finished');
            btnClockIn.disabled = false;
            break;
    }
}


// ----------------------------------------
// POMODORO TIMER LOGIC
// ----------------------------------------

class PomodoroTimer {
    constructor() {
        // Elements
        this.container = document.getElementById('timer-container');
        this.statusLabel = document.getElementById('timer-status-label');
        this.display = document.getElementById('timer-count');
        this.btnToggle = document.getElementById('btn-timer-toggle');
        this.btnToggleText = document.getElementById('btn-timer-toggle-text');
        this.btnSkip = document.getElementById('btn-skip-timer');

        // SVG Circle Elements
        this.circleProgress = document.getElementById('timer-circle-progress');
        // Initial circumference for r=140 => 2 * PI * 140 = 879.64...
        this.circumference = 2 * Math.PI * 140;

        this.valWork = document.getElementById('work-val');
        this.valBreak = document.getElementById('break-val');
        this.autoSwitchCheck = document.getElementById('auto-switch-check');

        // Settings (Minutes)
        this.settings = {
            work: 25,
            break: 5
        };

        // State
        this.mode = 'work'; // 'work' or 'break'
        this.totalTime = this.settings.work * 60; // Total time for progress calc
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
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            this.container.style.backgroundImage = `url('${imageUrl}')`;
        };
    }

    initSVG() {
        this.circleProgress.style.strokeDasharray = `${this.circumference} ${this.circumference}`;
        this.circleProgress.style.strokeDashoffset = 0;
    }

    bindEvents() {
        this.btnToggle.addEventListener('click', () => {
            if (this.isRunning) {
                this.pause();
            } else {
                this.start();
            }
        });

        // Steppers
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
            this.btnToggleText.textContent = 'NEXT'; // Indicate finished
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
        if (!this.isRunning) {
            this.btnToggleText.textContent = 'START';
        }
    }
}


// ----------------------------------------
// TODO LIST LOGIC
// ----------------------------------------

let todos = [];
let calCurrentDate = new Date();

// Context Menu & Edit State
let contextMenuTargetId = null;

function initTodo() {
    loadTodos();
    renderTodos();
    renderCalendar();

    const btnAdd = document.getElementById('btn-add-todo');
    if (btnAdd) {
        btnAdd.addEventListener('click', addTodo);
    }

    // Calendar Nav
    const btnCalPrev = document.getElementById('cal-prev');
    const btnCalNext = document.getElementById('cal-next');
    if (btnCalPrev) btnCalPrev.addEventListener('click', () => changeCalMonth(-1));
    if (btnCalNext) btnCalNext.addEventListener('click', () => changeCalMonth(1));
}

function loadTodos() {
    const data = localStorage.getItem('norma_todos');
    if (data) {
        try {
            todos = JSON.parse(data);
        } catch (e) {
            todos = [];
        }
    }
}

function saveTodos() {
    localStorage.setItem('norma_todos', JSON.stringify(todos));
}

function addTodo() {
    const input = document.getElementById('todo-input');
    const dateInput = document.getElementById('todo-date');
    const priorityInput = document.getElementById('todo-priority');

    const text = input.value.trim();
    if (!text) return;

    const newTodo = {
        id: Date.now(),
        text: text,
        date: dateInput.value, // YYYY-MM-DD
        priority: priorityInput.value, // low, medium, high
        completed: false,
        createdAt: new Date().toISOString()
    };

    todos.push(newTodo);
    saveTodos();
    renderTodos();
    renderCalendar();

    input.value = '';
}

function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        saveTodos();
        renderTodos();
        renderCalendar();
    }
}

function deleteTodo(id) {
    todos = todos.filter(t => t.id !== id);
    saveTodos();
    renderTodos();
    renderCalendar();
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderTodos() {
    const listExpired = document.getElementById('todo-list-expired');
    const containerExpired = document.getElementById('todo-section-expired');
    const listToday = document.getElementById('todo-list-today');
    const listHigh = document.getElementById('todo-list-high');
    const listMedium = document.getElementById('todo-list-medium');
    const listLow = document.getElementById('todo-list-low');

    // Clear lists
    if (listExpired) listExpired.innerHTML = '';
    if (listToday) listToday.innerHTML = '';
    if (listHigh) listHigh.innerHTML = '';
    if (listMedium) listMedium.innerHTML = '';
    if (listLow) listLow.innerHTML = '';

    const todayStr = new Date().toISOString().split('T')[0];
    let hasExpired = false;

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
                <button class="btn-text-icon" onclick="toggleTodo(${todo.id})" title="完了/未完了">
                    <span class="material-symbols-rounded">${todo.completed ? 'check_box' : 'check_box_outline_blank'}</span>
                </button>
                <button class="btn-text-icon" onclick="openContextMenu(event, ${todo.id})" title="メニュー">
                    <span class="material-symbols-rounded">more_vert</span>
                </button>
            </div>
        `;

        // Logic for categorization
        const isExpired = todo.date && todo.date < todayStr && !todo.completed;

        if (isExpired) {
            if (listExpired) listExpired.appendChild(item);
            hasExpired = true;
        } else if (todo.date === todayStr) {
            if (listToday) listToday.appendChild(item);
        } else {
            // Priority based
            if (todo.priority === 'high') {
                if (listHigh) listHigh.appendChild(item);
            } else if (todo.priority === 'low') {
                if (listLow) listLow.appendChild(item);
            } else {
                if (listMedium) listMedium.appendChild(item);
            }
        }
    });

    // Show/Hide Expired Section
    if (containerExpired) {
        containerExpired.style.display = hasExpired ? 'block' : 'none';
    }
}

// Context Menu Logic
function openContextMenu(e, id) {
    e.stopPropagation();
    contextMenuTargetId = id;
    const menu = document.getElementById('todo-context-menu');
    if (!menu) return;

    menu.style.display = 'block';

    // Position menu near the click
    menu.style.left = `${e.pageX - 100}px`;
    menu.style.top = `${e.pageY}px`;
}

function hideContextMenu() {
    const menu = document.getElementById('todo-context-menu');
    if (menu) menu.style.display = 'none';
}

function openEditModal(id = null) {
    const targetId = id || contextMenuTargetId;
    if (!targetId) return;

    const todo = todos.find(t => t.id === targetId);
    if (!todo) return;

    // Fill Modal
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
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 200);
    }
}

function saveEditTodo() {
    if (!contextMenuTargetId) return;

    const textInput = document.getElementById('edit-text');
    const dateInput = document.getElementById('edit-date');
    const priorityInput = document.getElementById('edit-priority');

    const text = textInput ? textInput.value.trim() : '';
    const date = dateInput ? dateInput.value : '';
    const priority = priorityInput ? priorityInput.value : 'medium';

    if (!text) return;

    const todoIndex = todos.findIndex(t => t.id === contextMenuTargetId);
    if (todoIndex !== -1) {
        todos[todoIndex].text = text;
        todos[todoIndex].date = date;
        todos[todoIndex].priority = priority;

        saveTodos();
        renderTodos();
        renderCalendar();
    }

    closeEditModal();
}

function deleteFromContext() {
    if (contextMenuTargetId) {
        deleteTodo(contextMenuTargetId);
    }
}

function getPriorityLabel(p) {
    switch (p) {
        case 'high': return '高';
        case 'medium': return '中';
        case 'low': return '低';
        default: return p;
    }
}

function changeCalMonth(delta) {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + delta);
    renderCalendar();
}

function inputDate(dateStr) {
    const dateInput = document.getElementById('todo-date');
    if (dateInput) {
        dateInput.value = dateStr;
        dateInput.focus();
    }
}

function renderCalendar() {
    const calendarGrid = document.getElementById('todo-calendar');
    const monthLabel = document.getElementById('cal-current-month');

    if (!calendarGrid || !monthLabel) return;

    calendarGrid.innerHTML = '';
    monthLabel.textContent = calCurrentDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });

    // Days headers
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    weekdays.forEach(day => {
        const d = document.createElement('div');
        d.className = 'cal-header-cell';
        d.textContent = day;
        calendarGrid.appendChild(d);
    });

    // Dates
    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Empty cells
    for (let i = 0; i < firstDay; i++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell empty';
        calendarGrid.appendChild(cell);
    }

    // Days
    const todayStr = new Date().toISOString().split('T')[0];

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const hasTask = todos.some(t => t.date === dateStr && !t.completed);

        const cell = document.createElement('div');
        cell.className = `cal-cell ${dateStr === todayStr ? 'is-today' : ''} ${hasTask ? 'has-task' : ''}`;

        // Onclick to input date
        cell.onclick = () => inputDate(dateStr);

        let html = `<span>${d}</span>`;

        const dayTodos = todos.filter(t => t.date === dateStr && !t.completed);
        if (dayTodos.length > 0) {
            html += `<div class="cal-dots">•</div>`;

            // Tooltip generation
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

// Make functions global for inline onclick handlers
window.toggleTodo = toggleTodo;
window.deleteTodo = deleteTodo;
window.inputDate = inputDate;
window.openContextMenu = openContextMenu;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEditTodo = saveEditTodo;
window.deleteFromContext = deleteFromContext;


// Initialize Timer
const timerApp = new PomodoroTimer();

// Start App
init();
initTodo(); // Init TODO feature
