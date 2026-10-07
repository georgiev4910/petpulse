// PetPulse - Beta v0.1
// Local-first PWA for pet care tracking

const STORAGE_KEY = 'petpulse_data_v1';

const PET_TYPES = {
  dog: { label: 'Куче', emoji: '🐕', icons: ['🐕', '🐶', '🦴', '🐾'] },
  cat: { label: 'Котка', emoji: '🐈', icons: ['🐈', '🐱', '🐟', '🐾'] },
  rabbit: { label: 'Заек', emoji: '🐇', icons: ['🐇', '🥕', '🌿', '🐾'] },
  other: { label: 'Друго', emoji: '🐾', icons: ['🐾', '❤️', '🌟', '✨'] }
};

const HEALTH_TYPES = {
  vaccine: { label: 'Ваксина', emoji: '💉', color: 'bg-blue-50 text-blue-600' },
  deworm: { label: 'Обезпаразитяване', emoji: '🐛', color: 'bg-green-50 text-green-600' },
  vet: { label: 'Ветеринар', emoji: '🏥', color: 'bg-purple-50 text-purple-600' },
  other: { label: 'Друго', emoji: '📋', color: 'bg-orange-50 text-orange-600' }
};

let state = {
  onboarded: false,
  pet: null,
  owners: [],
  walks: [],
  meals: [],
  snacks: [],
  health: [],
  currentOwner: 'Аз',
  selectedIcon: '🐕',
  currentFilter: 'all'
};

let modalType = null;

// ---------- Persistence ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch (e) {
    console.warn('Load failed', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Save failed', e);
  }
}

// ---------- Init ----------
function init() {
  loadState();
  document.getElementById('today-date').textContent = formatDate(new Date());

  if (state.onboarded && state.pet) {
    showMainApp();
  } else {
    document.getElementById('onboarding').classList.remove('hide');
    document.getElementById('main-app').classList.add('hide');
  }
}

// ---------- Onboarding ----------
function selectPetType(type) {
  state.tempType = type;
  document.getElementById('onboard-step-1').classList.add('hide');
  document.getElementById('onboard-step-2').classList.remove('hide');
  document.getElementById('pet-type-label').textContent = PET_TYPES[type].label.toLowerCase();
  
  // Pre-fill emoji related defaults if needed
  if (type === 'dog') {
    document.getElementById('pet-name').value = 'Макс';
    document.getElementById('pet-breed').value = 'Джак Ръсел териер';
    document.getElementById('pet-age').value = '8 месеца';
    document.getElementById('pet-weight').value = '7.2';
  }
}

function finishOnboarding() {
  const name = document.getElementById('pet-name').value.trim() || 'Макс';
  const breed = document.getElementById('pet-breed').value.trim() || '';
  const age = document.getElementById('pet-age').value.trim() || '';
  const weight = parseFloat(document.getElementById('pet-weight').value) || 0;
  const gender = document.getElementById('pet-gender').value;
  const type = state.tempType || 'dog';

  state.pet = {
    name,
    breed,
    age,
    weight,
    gender,
    type,
    emoji: PET_TYPES[type].emoji
  };
  state.owners = [{ id: '1', name: 'Аз', role: 'owner', color: '#FF8A65' }];
  state.currentOwner = 'Аз';
  state.selectedIcon = PET_TYPES[type].emoji;
  state.onboarded = true;

  // Seed some sample health for Max
  if (type === 'dog' && name === 'Макс') {
    state.health = [
      {
        id: uid(),
        type: 'vaccine',
        title: 'Комплексна ваксина (DHPPi)',
        date: '2025-11-15',
        nextDate: '2026-11-15',
        notes: 'Първа годишна ваксина. Без реакция.',
        vet: 'Д-р Иванова',
        by: 'Аз',
        createdAt: new Date().toISOString()
      },
      {
        id: uid(),
        type: 'deworm',
        title: 'Обезпаразитяване (таблетка)',
        date: '2026-03-01',
        nextDate: '2026-06-01',
        notes: 'Drontal. Прието добре.',
        by: 'Аз',
        createdAt: new Date().toISOString()
      },
      {
        id: uid(),
        type: 'vet',
        title: 'Рутинен преглед',
        date: '2026-02-20',
        notes: 'Всичко е наред. Препоръка за повече разходки.',
        vet: 'Д-р Петров',
        by: 'Аз',
        createdAt: new Date().toISOString()
      }
    ];
  }

  saveState();
  showMainApp();
}

// ---------- Navigation ----------
function showMainApp() {
  document.getElementById('onboarding').classList.add('hide');
  document.getElementById('main-app').classList.remove('hide');
  updateUI();
  showScreen('home');
}

function showScreen(name) {
  ['home', 'health', 'profile'].forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('hide', s !== name);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.screen === name;
    btn.classList.toggle('text-coral', isActive);
    btn.classList.toggle('text-warmgray/50', !isActive);
  });

  if (name === 'health') renderHealth();
  if (name === 'profile') renderProfile();
  if (name === 'home') renderHome();
}

// ---------- Render ----------
function updateUI() {
  if (!state.pet) return;
  const p = state.pet;
  document.getElementById('header-pet-name').textContent = p.name;
  document.getElementById('header-pet-info').textContent = `${p.breed || PET_TYPES[p.type]?.label || ''} · ${p.age}`;
  document.getElementById('pet-avatar').textContent = p.emoji || '🐾';
  
  document.getElementById('profile-name').textContent = p.name;
  document.getElementById('profile-breed').textContent = p.breed || '—';
  document.getElementById('profile-age').textContent = p.age || '—';
  document.getElementById('profile-weight').textContent = p.weight ? `${p.weight} кг` : '—';
  document.getElementById('profile-gender').textContent = p.gender === 'male' ? 'Мъжки' : 'Женски';
  document.getElementById('profile-type').textContent = PET_TYPES[p.type]?.label || 'Друго';
}

function renderHome() {
  const today = todayStr();
  
  // Walks
  const walksToday = state.walks.filter(w => w.date === today);
  document.getElementById('stat-walks').textContent = walksToday.length;
  const walksEl = document.getElementById('today-walks');
  if (walksToday.length === 0) {
    walksEl.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Няма записани разходки днес</p>`;
  } else {
    walksEl.innerHTML = walksToday.map(w => `
      <div class="flex items-center justify-between bg-cream rounded-xl px-3 py-2.5">
        <div>
          <div class="text-sm font-medium">${w.time} · ${w.duration || '?'} мин</div>
          <div class="text-xs text-warmgray/50">${w.location || 'Без локация'} · ${w.by}</div>
        </div>
        <button onclick="deleteItem('walks','${w.id}')" class="text-warmgray/30 text-lg">×</button>
      </div>
    `).join('');
  }

  // Meals
  const mealsToday = state.meals.filter(m => m.date === today);
  document.getElementById('stat-meals').textContent = `${mealsToday.length}/2`;
  const mealsEl = document.getElementById('today-meals');
  if (mealsToday.length === 0) {
    mealsEl.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Няма записани хранения днес</p>`;
  } else {
    mealsEl.innerHTML = mealsToday.map(m => `
      <div class="flex items-center justify-between bg-cream rounded-xl px-3 py-2.5">
        <div>
          <div class="text-sm font-medium">${m.time} · ${m.amount || ''} ${m.unit || 'г'}</div>
          <div class="text-xs text-warmgray/50">${m.food || 'Храна'} · ${m.by}</div>
        </div>
        <button onclick="deleteItem('meals','${m.id}')" class="text-warmgray/30 text-lg">×</button>
      </div>
    `).join('');
  }

  // Snacks
  const snacksToday = state.snacks.filter(s => s.date === today);
  const snacksEl = document.getElementById('today-snacks');
  if (snacksToday.length === 0) {
    snacksEl.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Няма снакове днес</p>`;
  } else {
    snacksEl.innerHTML = snacksToday.map(s => `
      <div class="flex items-center justify-between bg-cream rounded-xl px-3 py-2.5">
        <div>
          <div class="text-sm font-medium">${s.time} · ${s.what || 'Снак'}</div>
          <div class="text-xs text-warmgray/50">${s.by}</div>
        </div>
        <button onclick="deleteItem('snacks','${s.id}')" class="text-warmgray/30 text-lg">×</button>
      </div>
    `).join('');
  }

  // Upcoming health
  const upcoming = state.health
    .filter(h => h.nextDate && h.nextDate >= today)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 3);
  
  const upEl = document.getElementById('upcoming-health');
  if (upcoming.length === 0) {
    upEl.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Няма предстоящи записи</p>`;
  } else {
    upEl.innerHTML = upcoming.map(h => {
      const t = HEALTH_TYPES[h.type] || HEALTH_TYPES.other;
      return `
        <div class="flex items-center gap-3 bg-cream rounded-xl px-3 py-2.5">
          <span class="text-xl">${t.emoji}</span>
          <div class="flex-1">
            <div class="text-sm font-medium">${h.title}</div>
            <div class="text-xs text-warmgray/50">Следващо: ${formatDateStr(h.nextDate)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Recent activity
  const all = [
    ...state.walks.map(w => ({ ...w, kind: 'walk', label: `Разходка ${w.duration || '?'} мин` })),
    ...state.meals.map(m => ({ ...m, kind: 'meal', label: `Хранене ${m.amount || ''} ${m.unit || 'г'}` })),
    ...state.snacks.map(s => ({ ...s, kind: 'snack', label: `Снак: ${s.what || ''}` })),
    ...state.health.map(h => ({ ...h, kind: 'health', label: h.title, date: h.date }))
  ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);

  const actEl = document.getElementById('recent-activity');
  if (all.length === 0) {
    actEl.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Все още няма активност</p>`;
  } else {
    actEl.innerHTML = all.map(a => `
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-peach/60 flex items-center justify-center text-sm">${a.by?.[0] || '?'}</div>
        <div class="flex-1">
          <div class="text-sm">${a.label}</div>
          <div class="text-xs text-warmgray/50">${a.by} · ${formatRelative(a.createdAt || a.date)}</div>
        </div>
      </div>
    `).join('');
  }

  // Health status
  const overdue = state.health.filter(h => h.nextDate && h.nextDate < today);
  document.getElementById('stat-health').textContent = overdue.length > 0 ? `${overdue.length}!` : 'OK';
  document.getElementById('stat-health').className = overdue.length > 0 ? 'font-bold text-red-500' : 'font-bold text-softgreen';
}

function renderHealth() {
  const list = document.getElementById('health-list');
  let items = [...state.health].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  
  if (state.currentFilter !== 'all') {
    items = items.filter(h => h.type === state.currentFilter);
  }

  if (items.length === 0) {
    list.innerHTML = `<p class="text-center text-warmgray/50 py-8">Няма записи в тази категория</p>`;
    return;
  }

  list.innerHTML = items.map(h => {
    const t = HEALTH_TYPES[h.type] || HEALTH_TYPES.other;
    return `
      <div class="card p-4">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl ${t.color} flex items-center justify-center text-lg">${t.emoji}</div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">${h.title}</h3>
              <button onclick="deleteItem('health','${h.id}')" class="text-warmgray/30 text-lg">×</button>
            </div>
            <div class="text-xs text-warmgray/50 mt-0.5">${formatDateStr(h.date)} ${h.vet ? '· ' + h.vet : ''}</div>
            ${h.notes ? `<p class="text-sm mt-2 text-warmgray/80">${h.notes}</p>` : ''}
            ${h.nextDate ? `<div class="mt-2 text-xs font-medium text-coral">Следващо: ${formatDateStr(h.nextDate)}</div>` : ''}
            <div class="text-xs text-warmgray/40 mt-1">Добавено от ${h.by}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterHealth(filter) {
  state.currentFilter = filter;
  document.querySelectorAll('.health-filter').forEach(btn => {
    const active = btn.dataset.filter === filter;
    btn.classList.toggle('bg-coral', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('bg-white', !active);
    btn.classList.toggle('text-warmgray', !active);
  });
  renderHealth();
}

function renderProfile() {
  const list = document.getElementById('owners-list');
  list.innerHTML = state.owners.map(o => `
    <div class="flex items-center gap-3 bg-cream rounded-xl px-3 py-2.5">
      <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium" style="background:${o.color || '#FF8A65'}">${o.name[0]}</div>
      <div class="flex-1">
        <div class="text-sm font-medium">${o.name}</div>
        <div class="text-xs text-warmgray/50">${o.role === 'owner' ? 'Собственик' : 'Стопанин'}</div>
      </div>
    </div>
  `).join('');
}

// ---------- Modal ----------
function openAddModal(type) {
  modalType = type;
  const titleMap = {
    walk: 'Нова разходка',
    meal: 'Ново хранене',
    snack: 'Нов снак',
    health: 'Здравен запис',
    owner: 'Добави стопанин'
  };
  document.getElementById('modal-title').textContent = titleMap[type] || 'Добави';
  
  const body = document.getElementById('modal-body');
  const now = new Date();
  const timeVal = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  if (type === 'walk') {
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Час</label>
        <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Продължителност (мин)</label>
        <input id="m-duration" type="number" placeholder="30" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Локация / маршрут</label>
        <input id="m-location" type="text" placeholder="Парк, квартал..." class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Бележки</label>
        <input id="m-notes" type="text" placeholder="По избор" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
    `;
  } else if (type === 'meal') {
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Час</label>
        <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Количество</label>
        <div class="flex gap-2">
          <input id="m-amount" type="number" step="1" placeholder="150" class="flex-1 px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
          <select id="m-unit" class="w-24 px-3 py-3 rounded-2xl border border-peach/50 bg-white">
            <option value="г">г</option>
            <option value="мл">мл</option>
            <option value="чаши">чаши</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Какво яде</label>
        <input id="m-food" type="text" placeholder="Суха храна, консерва..." class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
    `;
  } else if (type === 'snack') {
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Час</label>
        <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Какво</label>
        <input id="m-what" type="text" placeholder="Лакомство, ябълка..." class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
    `;
  } else if (type === 'health') {
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Тип</label>
        <select id="m-type" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white">
          <option value="vaccine">Ваксина</option>
          <option value="deworm">Обезпаразитяване</option>
          <option value="vet">Ветеринарен преглед</option>
          <option value="other">Друго</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Заглавие</label>
        <input id="m-title" type="text" placeholder="напр. Комплексна ваксина" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Дата</label>
        <input id="m-date" type="date" value="${todayStr()}" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Следваща дата (по избор)</label>
        <input id="m-next" type="date" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Ветеринар / клиника</label>
        <input id="m-vet" type="text" placeholder="по избор" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Бележки / какво се случи</label>
        <textarea id="m-notes" rows="3" placeholder="Процедури, реакция, препоръки..." class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white resize-none"></textarea>
      </div>
    `;
  } else if (type === 'owner') {
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Име</label>
        <input id="m-name" type="text" placeholder="Име на стопанина" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <p class="text-xs text-warmgray/50">В тази бета версия стопаните са локални. По-късно ще добавим покани и синхронизация.</p>
    `;
  }

  document.getElementById('modal').classList.remove('hide');
}

function closeModal() {
  document.getElementById('modal').classList.add('hide');
  modalType = null;
}

function saveModal() {
  const by = state.currentOwner || 'Аз';
  const createdAt = new Date().toISOString();
  const date = todayStr();

  if (modalType === 'walk') {
    const time = document.getElementById('m-time').value;
    const duration = document.getElementById('m-duration').value;
    const location = document.getElementById('m-location').value;
    const notes = document.getElementById('m-notes').value;
    state.walks.push({ id: uid(), date, time, duration, location, notes, by, createdAt });
  } else if (modalType === 'meal') {
    const time = document.getElementById('m-time').value;
    const amount = document.getElementById('m-amount').value;
    const unit = document.getElementById('m-unit').value;
    const food = document.getElementById('m-food').value;
    state.meals.push({ id: uid(), date, time, amount, unit, food, by, createdAt });
  } else if (modalType === 'snack') {
    const time = document.getElementById('m-time').value;
    const what = document.getElementById('m-what').value;
    state.snacks.push({ id: uid(), date, time, what, by, createdAt });
  } else if (modalType === 'health') {
    const type = document.getElementById('m-type').value;
    const title = document.getElementById('m-title').value || HEALTH_TYPES[type].label;
    const hDate = document.getElementById('m-date').value;
    const nextDate = document.getElementById('m-next').value || null;
    const vet = document.getElementById('m-vet').value;
    const notes = document.getElementById('m-notes').value;
    state.health.push({ id: uid(), type, title, date: hDate, nextDate, vet, notes, by, createdAt });
  } else if (modalType === 'owner') {
    const name = document.getElementById('m-name').value.trim();
    if (name) {
      const colors = ['#FF8A65', '#4DB6AC', '#B39DDB', '#81C784', '#FFB74D'];
      state.owners.push({
        id: uid(),
        name,
        role: 'caregiver',
        color: colors[state.owners.length % colors.length]
      });
    }
  }

  saveState();
  closeModal();
  renderHome();
  if (modalType === 'health') renderHealth();
  if (modalType === 'owner') renderProfile();
}

// ---------- Helpers ----------
function deleteItem(collection, id) {
  if (!confirm('Изтриване?')) return;
  state[collection] = state[collection].filter(i => i.id !== id);
  saveState();
  renderHome();
  if (collection === 'health') renderHealth();
}

function editPet() {
  alert('Редактирането на профила ще бъде добавено в следващата версия. Засега можеш да изтриеш данните и да започнеш наново.');
}

function selectIcon(emoji) {
  state.selectedIcon = emoji;
  document.querySelectorAll('.icon-opt').forEach(btn => {
    btn.classList.remove('ring-2', 'ring-coral');
    btn.classList.add('bg-peach/50');
  });
  event.target.classList.add('ring-2', 'ring-coral');
  event.target.classList.remove('bg-peach/50');
  saveState();
}

function resetApp() {
  if (!confirm('Сигурен ли си? Всички данни ще бъдат изтрити.')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  return d.toLocaleDateString('bg-BG', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateStr(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'току-що';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return formatDateStr(iso.slice(0, 10));
}

// Start
init();
