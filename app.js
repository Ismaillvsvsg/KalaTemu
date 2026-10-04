import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// PASTE FIREBASE CONFIG MILIKMU DI SINI
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCeDjXXoMFx9cVOScrNwvEhxy0a38-xE_s",
  authDomain: "kalatemuu.firebaseapp.com",
  projectId: "kalatemuu",
  storageBucket: "kalatemuu.firebasestorage.app",
  messagingSenderId: "382961472785",
  appId: "1:382961472785:web:da9dc00021e748dfde68b0"
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
let rawResponses = []; 

// CEK URL UNTUK AUTO-FILL KODE AGENDA & TAMPILKAN WELCOME POP-UP
window.addEventListener('DOMContentLoaded', () => {
    
    // Panggil Pop-up Sambutan
    showWelcomeModal();

    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('code');
    if (codeFromUrl) {
        document.getElementById('join-code').value = codeFromUrl.toUpperCase();
        showView('view-join');
    }
});

window.showView = (viewId) => {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');

    const mainHeader = document.getElementById('main-header');
    if (mainHeader) {
        if (viewId === 'view-fill') mainHeader.classList.add('hidden');
        else mainHeader.classList.remove('hidden');
    }
};

function getDatesInRange(startDate, endDate) {
    const dates = [];
    let current = new Date(startDate);
    const end = new Date(endDate);
    current.setHours(0,0,0,0); end.setHours(0,0,0,0);
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
    return { dayName: days[date.getDay()], dateMonth: `${date.getDate()} ${months[date.getMonth()]}` };
}

document.getElementById('form-create').addEventListener('submit', async (e) => {
    e.preventDefault();
    const hostName = document.getElementById('host-name').value.trim();
    const title = document.getElementById('agenda-name').value;
    const startStr = document.getElementById('start-date').value;
    const endStr = document.getElementById('end-date').value;
    
    // PERBAIKAN: Mengambil angka jam dari input tipe "time" ("09:00" -> 9)
    const rawStartHour = document.getElementById('start-hour').value;
    const rawEndHour = document.getElementById('end-hour').value;
    const startHour = parseInt(rawStartHour.split(':')[0]);
    const endHour = parseInt(rawEndHour.split(':')[0]);
    
    if (new Date(startStr) > new Date(endStr)) return alert("Tanggal mulai tidak boleh melewati tanggal selesai!");
    if (startHour >= endHour) return alert("Jam mulai harus lebih awal dari jam selesai!");
    const selectedDays = getDatesInRange(startStr, endStr);
    if (selectedDays.length > 14) return alert("Maksimal rentang waktu adalah 14 hari.");

    currentRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    currentUserName = hostName;
    currentUserSavedSlots = []; 
    roomData = { title, days: selectedDays, startHour, endHour, createdAt: new Date() };

    try {
        await setDoc(doc(db, "rooms", currentRoomCode), roomData);
        document.getElementById('btn-back-host')?.classList.remove('hidden'); 
        initWorkspace();
    } catch (error) {
        console.error("Error: ", error);
        alert("Gagal membuat Acara.");
    }
});

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
            
            document.getElementById('btn-back-host')?.classList.add('hidden'); 
            window.history.replaceState({}, document.title, window.location.pathname);
            initWorkspace();
        } else {
            alert("Kode agenda tidak valid!");
        }
    } catch (error) {
        console.error("Error joining: ", error);
    }
});

document.getElementById('btn-share-wa').addEventListener('click', () => {
    const url = window.location.origin + window.location.pathname + "?code=" + currentRoomCode;
    const text = `Halo! Yuk isi ketersediaan waktu untuk agenda *${roomData.title}*.\n\n🌐 Buka Link Ini: ${url}\n🔑 Kode: *${currentRoomCode}*\n\nBantu isi secepatnya ya di KalaTemu agar jadwal cepat fix!`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
});

function initWorkspace() {
    document.getElementById('fill-agenda-name').innerText = roomData.title;
    document.getElementById('fill-title').innerText = `Hai ${currentUserName}, Tandai Waktu Kosongmu`;
    document.getElementById('workspace-code').innerText = currentRoomCode;

    renderGrid('schedule-grid', roomData, true);
    renderGrid('heatmap-grid', roomData, false);
    showView('view-fill');

    setTimeout(setupScrollSlider, 150);

    if (unsubscribeHeatmap) unsubscribeHeatmap();
    const responsesRef = collection(db, "rooms", currentRoomCode, "responses");
    unsubscribeHeatmap = onSnapshot(responsesRef, (snapshot) => {
        rawResponses = [];
        snapshot.forEach(doc => rawResponses.push(doc.data()));
        document.getElementById('total-participants-badge').innerText = rawResponses.length;
        calculateHeatmap(rawResponses);
        generateModalContent(); 
    });
}

function renderGrid(containerId, data, isInteractive = false) {
    const table = document.getElementById(containerId);
    table.innerHTML = '';
    let thead = `<thead><tr><th class="p-2 border border-gray-200 bg-gray-50 text-gray-700 font-bold rounded-tl-lg text-[10px] md:text-xs w-12 md:w-16">Jam</th>`;
    
    data.days.forEach((dateStr, index) => {
        let roundedClass = (index === data.days.length - 1) ? 'rounded-tr-lg' : '';
        const dateObj = formatDateDisplay(dateStr);
        thead += `<th class="p-1.5 md:p-2 border border-gray-200 bg-gray-50 text-gray-700 text-xs min-w-[70px] md:min-w-[90px] ${roundedClass} leading-tight">
            <span class="font-bold">${dateObj.dayName}</span><br>
            <span class="text-[9px] md:text-[10px] font-semibold text-gray-500">${dateObj.dateMonth}</span>
        </th>`;
    });
    thead += `</tr></thead><tbody>`;
    
    for (let h = data.startHour; h < data.endHour; h++) {
        let timeLabel = `${h.toString().padStart(2, '0')}:00`;
        thead += `<tr><td class="p-1 md:p-2 border border-gray-200 text-[10px] md:text-xs font-semibold text-gray-500 bg-white align-middle">${timeLabel}</td>`;
        
        data.days.forEach(dateStr => {
            const slotId = `${dateStr}|${timeLabel}`;
            if (isInteractive) {
                thead += `<td class="time-slot p-2 border border-gray-200 bg-white" data-slot="${slotId}"></td>`;
            } else {
                thead += `<td class="heatmap-cell p-2 border border-gray-200 bg-white" data-slot="${slotId}"></td>`;
            }
        });
        thead += `</tr>`;
    }
    table.innerHTML = thead + `</tbody>`;
}

const scheduleWrapper = document.getElementById('schedule-wrapper');
const heatmapWrapper = document.getElementById('heatmap-wrapper');
const scrollSlider = document.getElementById('scroll-slider');

function setupScrollSlider() {
    if (!scheduleWrapper || !scrollSlider) return;
    const maxScroll = scheduleWrapper.scrollWidth - scheduleWrapper.clientWidth;
    if (maxScroll > 0) {
        scrollSlider.max = maxScroll;
        scrollSlider.value = scheduleWrapper.scrollLeft;
        scrollSlider.classList.remove('hidden');
    } else {
        scrollSlider.classList.add('hidden');
    }
}

// Sinkronisasi slider dengan tabel
scrollSlider.addEventListener('input', (e) => {
    scheduleWrapper.scrollLeft = e.target.value;
    if(heatmapWrapper) heatmapWrapper.scrollLeft = e.target.value;
});

const scheduleTable = document.getElementById('schedule-grid');
let lastTouchedCell = null;

scheduleTable.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('time-slot')) {
        isDragging = true;
        isSelecting = !e.target.classList.contains('bg-blue-600');
        toggleCell(e.target);
    }
});
scheduleTable.addEventListener('mouseover', (e) => {
    if (isDragging && e.target.classList.contains('time-slot')) toggleCell(e.target);
});
document.addEventListener('mouseup', () => { isDragging = false; });

scheduleTable.addEventListener('touchstart', (e) => {
    if (e.target.classList.contains('time-slot')) {
        e.preventDefault(); 
        isDragging = true;
        isSelecting = !e.target.classList.contains('bg-blue-600');
        toggleCell(e.target);
        lastTouchedCell = e.target;
    }
}, {passive: false});

scheduleTable.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && target.classList.contains('time-slot') && target !== lastTouchedCell) {
        toggleCell(target);
        lastTouchedCell = target;
    }
}, {passive: false});

document.addEventListener('touchend', () => {
    isDragging = false;
    lastTouchedCell = null;
});

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
        
        const btn = document.getElementById('btn-save-schedule');
        const originalText = btn.innerText;
        btn.innerText = "Tersimpan! ✅";
        btn.classList.replace('bg-blue-600', 'bg-green-500');
        btn.classList.replace('hover:bg-blue-700', 'hover:bg-green-600');
        
        setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.replace('bg-green-500', 'bg-blue-600');
            btn.classList.replace('hover:bg-green-600', 'hover:bg-blue-700');
        }, 2000);

    } catch (error) {
        console.error("Error saving schedule: ", error);
        alert("Gagal menyimpan ketersediaan jadwal.");
    }
});

document.getElementById('btn-back-host').addEventListener('click', () => {
    showView('view-create');
});

function calculateHeatmap(responses) {
    const totalMembers = responses.length;
    const slotCounts = {};
    const slotNames = {}; 

    responses.forEach(res => {
        if(res.name === currentUserName) {
            currentUserSavedSlots = res.slots;
            currentUserSavedSlots.forEach(slot => {
                const cell = document.querySelector(`.time-slot[data-slot="${slot}"]`);
                if (cell) {
                    cell.classList.remove('bg-white');
                    cell.classList.add('bg-blue-600', 'shadow-inner');
                }
            });
        }
        res.slots.forEach(slot => {
            slotCounts[slot] = (slotCounts[slot] || 0) + 1;
            if (!slotNames[slot]) slotNames[slot] = [];
            slotNames[slot].push(res.name);
        });
    });

    document.querySelectorAll('.heatmap-cell').forEach(cell => {
        const slot = cell.getAttribute('data-slot');
        const count = slotCounts[slot] || 0;
        cell.className = 'heatmap-cell relative group p-1 md:p-2 border border-gray-200 text-[10px] md:text-xs font-bold transition-colors duration-300';
        
        if (count > 0 && totalMembers > 0) {
            const ratio = count / totalMembers;
            const alpha = Math.max(0.15, ratio);
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

    const sortedSlots = Object.entries(slotCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const recomContainer = document.getElementById('top-recommendations');
    recomContainer.innerHTML = '';
    
    if (sortedSlots.length === 0) {
        recomContainer.innerHTML = '<li class="text-xs md:text-sm text-gray-400 italic bg-white p-3 md:p-4 rounded-lg border border-gray-200 col-span-full">Menunggu irisan jadwal peserta...</li>';
        return;
    }

    sortedSlots.forEach((item, index) => {
        const [slotString, count] = item;
        const percentage = Math.round((count / totalMembers) * 100);
        const [dateStr, time] = slotString.split('|');
        const dateObj = formatDateDisplay(dateStr);
        const names = slotNames[slotString].join(', ');
        
        recomContainer.innerHTML += `
            <li class="relative group flex items-center justify-between bg-white p-2 md:p-3 rounded-lg border border-gray-200 shadow-sm transition-transform hover:-translate-y-0.5 gap-2 w-full overflow-visible cursor-help">
                <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-[200px] bg-gray-800 text-white text-[10px] md:text-[11px] font-normal rounded py-2 px-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-lg pointer-events-none text-center leading-relaxed">
                    <span class="text-blue-300 font-bold block mb-0.5">Daftar Hadir:</span>
                    ${names}
                    <svg class="absolute text-gray-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255"><polygon class="fill-current" points="0,0 127.5,127.5 255,0"/></svg>
                </div>
                <div class="flex items-center gap-2 md:gap-3 min-w-0">
                    <span class="font-bold text-gray-300 text-base md:text-lg w-5 shrink-0">${index + 1}.</span>
                    <div class="min-w-0">
                        <p class="font-bold text-gray-800 text-xs md:text-sm whitespace-nowrap">${dateObj.dayName}, <span class="text-blue-600">${time}</span></p>
                        <p class="text-[9px] md:text-[10px] text-gray-500 font-semibold mb-0.5">${dateObj.dateMonth}</p>
                        <p class="text-[10px] md:text-[11px] text-gray-400 truncate">${names}</p>
                    </div>
                </div>
                <div class="text-right flex flex-col items-end shrink-0 pl-2">
                    <p class="font-bold text-blue-600 text-sm md:text-base leading-tight">${count}<span class="text-[9px] md:text-[10px] font-normal text-gray-500"> / ${totalMembers}</span></p>
                    <p class="text-[8px] md:text-[9px] font-semibold text-blue-700 bg-blue-100 px-1.5 md:px-2 py-0.5 rounded mt-1 whitespace-nowrap">${percentage}%</p>
                </div>
            </li>
        `;
    });
}

const modal = document.getElementById('modal-participants');
const btnOpenModal = document.getElementById('btn-open-modal');
const btnCloseModal = document.getElementById('btn-close-modal');

btnOpenModal.addEventListener('click', () => {
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.firstElementChild.classList.remove('scale-95');
    }, 10);
});

function closeModal() {
    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

btnCloseModal.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });

function generateModalContent() {
    const container = document.getElementById('modal-participant-list');
    if (rawResponses.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500 italic text-center py-4">Belum ada yang mengisi jadwal.</p>';
        return;
    }

    let html = '';
    rawResponses.forEach(res => {
        let slotInfo = '<p class="text-xs text-red-400 italic mt-1">Belum memilih waktu luang</p>';
        
        if (res.slots && res.slots.length > 0) {
            const grouped = {};
            res.slots.forEach(slotStr => {
                const [date, time] = slotStr.split('|');
                if (!grouped[date]) grouped[date] = [];
                grouped[date].push(time);
            });
            
            const detailStr = Object.keys(grouped).map(date => {
                const d = formatDateDisplay(date);
                const times = grouped[date].sort().join(', ');
                return `<li class="text-[11px] text-gray-600"><strong class="text-gray-800">${d.dayName}, ${d.dateMonth}:</strong> ${times}</li>`;
            }).join('');
            
            slotInfo = `<ul class="mt-2 space-y-1 pl-1 border-l-2 border-blue-200">${detailStr}</ul>`;
        }

        html += `
            <div class="bg-gray-50 p-3 md:p-4 rounded-xl border border-gray-100">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs uppercase">${res.name.charAt(0)}</div>
                    <p class="font-bold text-gray-800 text-sm md:text-base">${res.name}</p>
                </div>
                ${slotInfo}
            </div>
        `;
    });
    container.innerHTML = html;
}

// ==========================================
// LOGIKA MODAL WELCOME (SAMBUTAN AWAL)
// ==========================================
const welcomeModal = document.getElementById('modal-welcome');
const btnCloseWelcome = document.getElementById('btn-close-welcome');

function showWelcomeModal() {
    // Cek apakah user sudah pernah menutup pop up ini sebelumnya
    if (!localStorage.getItem('kalatemu_welcome_shown')) {
        welcomeModal.classList.remove('hidden');
        setTimeout(() => {
            welcomeModal.classList.remove('opacity-0');
            welcomeModal.firstElementChild.classList.remove('scale-95');
        }, 10);
    }
}

function hideWelcomeModal() {
    welcomeModal.classList.add('opacity-0');
    welcomeModal.firstElementChild.classList.add('scale-95');
    // Simpan data di browser agar tidak muncul lagi besok-besok
    localStorage.setItem('kalatemu_welcome_shown', 'true');
    setTimeout(() => welcomeModal.classList.add('hidden'), 300);
}

if (btnCloseWelcome) {
    btnCloseWelcome.addEventListener('click', hideWelcomeModal);
}
