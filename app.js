import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// PASTE FIREBASE CONFIG MILIKMU DI SINI
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "kalatemuu.firebaseapp.com",
    projectId: "kalatemuu",
    storageBucket: "kalatemuu.firebasestorage.app",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentRoomCode = '';
let currentUserName = '';
let currentUserSavedSlots = []; 
let roomData = null;
let isDragging = false;
let isSelecting = true;
let unsubscribeHeatmap = null;

window.showView = (viewId) => {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
};

function getDatesInRange(startDate, endDate) {
    const dates = [];
    let current = new Date(startDate);
    const end = new Date(endDate);
    current.setHours(0,0,0,0);
    end.setHours(0,0,0,0);

    while (current <= end) {
        const yyyy = current.getFullYear();
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        dates.push(`${yyyy}-${mm}-${dd}`);
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

function formatDateDisplay(dateString) {
    const date = new Date(dateString);
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    return {
        dayName: days[date.getDay()],
        dateMonth: `${date.getDate()} ${months[date.getMonth()]}`
    };
}

// HOST: Buat Rapat
document.getElementById('form-create').addEventListener('submit', async (e) => {
    e.preventDefault();
    const hostName = document.getElementById('host-name').value.trim();
    const title = document.getElementById('agenda-name').value;
    const startStr = document.getElementById('start-date').value;
    const endStr = document.getElementById('end-date').value;
    const startHour = parseInt(document.getElementById('start-hour').value);
    const endHour = parseInt(document.getElementById('end-hour').value);
    
    if (new Date(startStr) > new Date(endStr)) {
        return alert("Tanggal mulai tidak boleh melewati tanggal selesai!");
    }

    const selectedDays = getDatesInRange(startStr, endStr);
    if (selectedDays.length > 14) {
        return alert("Maksimal rentang waktu adalah 14 hari agar tabel tetap nyaman dilihat.");
    }

    currentRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    currentUserName = hostName;
    currentUserSavedSlots = []; 
    roomData = { title, days: selectedDays, startHour, endHour, createdAt: new Date() };

    try {
        await setDoc(doc(db, "rooms", currentRoomCode), roomData);
        document.getElementById('fill-title').innerText = `Hai ${currentUserName}, Tandai Waktu Kosongmu`;
        
        document.getElementById('btn-cancel-edit')?.classList.add('hidden');
        document.getElementById('btn-back-host')?.classList.remove('hidden'); 
        
        renderGrid('schedule-grid', roomData, true);
        showView('view-fill');
    } catch (error) {
        console.error("Error: ", error);
        alert("Gagal membuat agenda. Coba periksa koneksi internet Anda.");
    }
});

// MEMBER: Gabung Rapat
document.getElementById('form-join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    const name = document.getElementById('join-name').value.trim();
    
    try {
        const roomSnap = await getDoc(doc(db, "rooms", code));
        if (roomSnap.exists()) {
            currentRoomCode = code;
            currentUserName = name;
            currentUserSavedSlots = [];
            roomData = roomSnap.data();
            
            document.getElementById('fill-title').innerText = `Hai ${name}, Tandai Waktu Kosongmu`;
            
            document.getElementById('btn-cancel-edit')?.classList.add('hidden');
            document.getElementById('btn-back-host')?.classList.add('hidden'); 
            
            renderGrid('schedule-grid', roomData, true);
            showView('view-fill');
        } else {
            alert("Kode agenda tidak valid!");
        }
    } catch (error) {
        console.error("Error joining: ", error);
    }
});

// GENERATE GRID KALENDER (TEMA BLUE & PROFESSIONAL)
function renderGrid(containerId, data, isInteractive = false) {
    const table = document.getElementById(containerId);
    table.innerHTML = '';

    let thead = `<thead><tr><th class="p-3 border border-gray-200 bg-gray-50 text-gray-700 font-bold rounded-tl-lg text-sm w-20">Jam</th>`;
    data.days.forEach((dateStr, index) => {
        let roundedClass = (index === data.days.length - 1) ? 'rounded-tr-lg' : '';
        const dateObj = formatDateDisplay(dateStr);
        thead += `<th class="p-2 border border-gray-200 bg-gray-50 text-gray-700 text-sm min-w-[100px] ${roundedClass} leading-tight">
            <span class="font-bold">${dateObj.dayName}</span><br>
            <span class="text-[10px] font-semibold text-gray-500">${dateObj.dateMonth}</span>
        </th>`;
    });
    thead += `</tr></thead>`;
    table.innerHTML = thead;

    let tbody = `<tbody>`;
    for (let h = data.startHour; h < data.endHour; h++) {
        let timeLabel = `${h.toString().padStart(2, '0')}:00`;
        tbody += `<tr><td class="p-2 border border-gray-200 text-xs font-semibold text-gray-500 bg-white align-middle">${timeLabel}</td>`;
        
        data.days.forEach(dateStr => {
            const slotId = `${dateStr}|${timeLabel}`;
            if (isInteractive) {
                tbody += `<td class="time-slot p-2 border border-gray-200 bg-white" data-slot="${slotId}"></td>`;
            } else {
                tbody += `<td class="heatmap-cell p-2 border border-gray-200 bg-white" data-slot="${slotId}"></td>`;
            }
        });
        tbody += `</tr>`;
    }
    tbody += `</tbody>`;
    table.innerHTML += tbody;
}

const scheduleTable = document.getElementById('schedule-grid');
scheduleTable.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('time-slot')) {
        isDragging = true;
        isSelecting = !e.target.classList.contains('bg-blue-600');
        toggleCell(e.target);
    }
});
scheduleTable.addEventListener('mouseover', (e) => {
    if (isDragging && e.target.classList.contains('time-slot')) {
        toggleCell(e.target);
    }
});
document.addEventListener('mouseup', () => { isDragging = false; });

function toggleCell(cell) {
    if (isSelecting) {
        cell.classList.remove('bg-white');
        cell.classList.add('bg-blue-600', 'shadow-inner');
    } else {
        cell.classList.add('bg-white');
        cell.classList.remove('bg-blue-600', 'shadow-inner');
    }
}

document.getElementById('btn-clear-schedule').addEventListener('click', () => {
    document.querySelectorAll('.time-slot').forEach(cell => {
        cell.classList.add('bg-white');
        cell.classList.remove('bg-blue-600', 'shadow-inner');
    });
});

document.getElementById('btn-save-schedule').addEventListener('click', async () => {
    const selectedCells = document.querySelectorAll('.time-slot.bg-blue-600');
    const availableSlots = Array.from(selectedCells).map(cell => cell.getAttribute('data-slot'));
    currentUserSavedSlots = availableSlots;

    try {
        const responseRef = doc(db, "rooms", currentRoomCode, "responses", currentUserName);
        await setDoc(responseRef, { name: currentUserName, slots: availableSlots, updatedAt: new Date() });
        initDashboard();
    } catch (error) {
        console.error("Error saving schedule: ", error);
        alert("Gagal menyimpan ketersediaan jadwal.");
    }
});

document.getElementById('btn-edit-schedule')?.addEventListener('click', () => {
    document.getElementById('fill-title').innerText = `Edit Jadwalmu, ${currentUserName}`;
    
    document.getElementById('btn-cancel-edit')?.classList.remove('hidden');
    document.getElementById('btn-back-host')?.classList.add('hidden'); 
    
    renderGrid('schedule-grid', roomData, true); 
    currentUserSavedSlots.forEach(slot => {
        const cell = document.querySelector(`.time-slot[data-slot="${slot}"]`);
        if (cell) {
            cell.classList.remove('bg-white');
            cell.classList.add('bg-blue-600', 'shadow-inner');
        }
    });
    
    showView('view-fill');
});

function initDashboard() {
    document.getElementById('dash-title').innerText = roomData.title;
    document.getElementById('dash-code').innerText = currentRoomCode;
    renderGrid('heatmap-grid', roomData, false);
    showView('view-dashboard');

    if (unsubscribeHeatmap) unsubscribeHeatmap();
    const responsesRef = collection(db, "rooms", currentRoomCode, "responses");
    unsubscribeHeatmap = onSnapshot(responsesRef, (snapshot) => {
        const responses = [];
        snapshot.forEach(doc => responses.push(doc.data()));
        document.getElementById('total-participants').innerText = responses.length;
        calculateHeatmap(responses);
    });
}

document.getElementById('btn-back-host').addEventListener('click', () => {
    showView('view-create');
});

function calculateHeatmap(responses) {
    const totalMembers = responses.length;
    const slotCounts = {};
    const slotNames = {}; 
    const participantNames = [];

    responses.forEach(res => {
        participantNames.push(res.name);
        if(res.name === currentUserName) currentUserSavedSlots = res.slots;
        res.slots.forEach(slot => {
            slotCounts[slot] = (slotCounts[slot] || 0) + 1;
            if (!slotNames[slot]) slotNames[slot] = [];
            slotNames[slot].push(res.name);
        });
    });

    const listContainer = document.getElementById('participant-list');
    if (participantNames.length > 0) {
        listContainer.innerHTML = participantNames.map(n => `<span class="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm font-semibold border border-gray-200">${n}</span>`).join('');
    } else {
        listContainer.innerHTML = '<span class="text-sm text-gray-400 italic">Belum ada...</span>';
    }

    document.querySelectorAll('.heatmap-cell').forEach(cell => {
        const slot = cell.getAttribute('data-slot');
        const count = slotCounts[slot] || 0;
        
        cell.className = 'heatmap-cell relative group p-2 border border-gray-200 text-xs font-bold transition-colors duration-300';
        
        if (count > 0 && totalMembers > 0) {
            const ratio = count / totalMembers;
            const alpha = Math.max(0.15, ratio);
            
            // Konversi warna ke variasi Biru Google (rgba 37, 99, 235)
            cell.style.backgroundColor = `rgba(37, 99, 235, ${alpha})`;
            cell.style.color = ratio > 0.6 ? 'white' : '#1e3a8a'; 
            
            const namesList = slotNames[slot].join(', ');
            
            cell.innerHTML = `
                <div class="w-full h-full flex items-center justify-center cursor-help">${count}</div>
                <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 w-max max-w-[140px] bg-gray-800 text-white text-[10px] font-normal rounded py-1.5 px-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-lg pointer-events-none text-center">
                    <span class="text-blue-300 font-bold block mb-0.5">Bisa Hadir:</span>
                    ${namesList}
                    <svg class="absolute text-gray-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255"><polygon class="fill-current" points="0,0 127.5,127.5 255,0"/></svg>
                </div>
            `;
        } else {
            cell.style.backgroundColor = 'white';
            cell.innerHTML = '';
        }
    });

    const sortedSlots = Object.entries(slotCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    const recomContainer = document.getElementById('top-recommendations');
    recomContainer.innerHTML = '';
    
    if (sortedSlots.length === 0) {
        recomContainer.innerHTML = '<li class="text-sm text-gray-400 italic bg-white p-4 rounded-lg border border-gray-200">Menunggu irisan jadwal peserta...</li>';
        return;
    }

    sortedSlots.forEach((item, index) => {
        const [slotString, count] = item;
        const percentage = Math.round((count / totalMembers) * 100);
        
        const [dateStr, time] = slotString.split('|');
        const dateObj = formatDateDisplay(dateStr);
        const names = slotNames[slotString].join(', ');
        
        recomContainer.innerHTML += `
            <li class="relative group flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm transition-transform hover:-translate-y-0.5 gap-2 w-full overflow-visible cursor-help">
                <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-[200px] bg-gray-800 text-white text-[11px] font-normal rounded py-2 px-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-lg pointer-events-none text-center leading-relaxed">
                    <span class="text-blue-300 font-bold block mb-0.5">Daftar Hadir:</span>
                    ${names}
                    <svg class="absolute text-gray-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255"><polygon class="fill-current" points="0,0 127.5,127.5 255,0"/></svg>
                </div>

                <div class="flex items-center gap-3 min-w-0">
                    <span class="font-bold text-gray-300 text-lg w-5 shrink-0">${index + 1}.</span>
                    <div class="min-w-0">
                        <p class="font-bold text-gray-800 text-sm whitespace-nowrap">${dateObj.dayName}, <span class="text-blue-600">${time}</span></p>
                        <p class="text-[10px] text-gray-500 font-semibold mb-0.5">${dateObj.dateMonth}</p>
                        <p class="text-[11px] text-gray-400 truncate">${names}</p>
                    </div>
                </div>

                <div class="text-right flex flex-col items-end shrink-0 pl-2">
                    <p class="font-bold text-blue-600 text-base leading-tight">${count}<span class="text-[10px] font-normal text-gray-500"> / ${totalMembers}</span></p>
                    <p class="text-[9px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded mt-1 whitespace-nowrap">${percentage}%</p>
                </div>
            </li>
        `;
    });
}