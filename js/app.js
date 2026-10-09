(() => {
const C = window.STAYORA_CONFIG || {}, app = document.getElementById('app');
const sb = C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0}).format(n);
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const nights = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const today = () => { const d = new Date(); return iso(new Date(d.getTime() - d.getTimezoneOffset() * 6e4)); };
const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', {weekday:'short', day:'numeric', month:'short', year:'numeric'});
const qs = o => new URLSearchParams(o).toString();
const dq = () => ({in: addDays(today(), 14), out: addDays(today(), 17), g: 2, c: 0, r: 1, p: 0});
let offline = !sb;
const show = h => { app.innerHTML = h; };
const loading = () => show('<section class="wrap state" aria-busy="true"><div class="spin"></div><p>Loading…</p></section>');
const fail = e => show(`<section class="wrap state"><h1>We couldn't load this page</h1><p class="err" role="alert">${esc(e.message)}</p><a class="btn" href="#/">Back to home</a></section>`);
const rpc = async (fn, args) => {
  if (!sb) throw Object.assign(new Error('Supabase is not connected.'), {code:'NOCONFIG'});
  let r; try { r = await sb.rpc(fn, args); } catch (e) { throw Object.assign(new Error(e.message), {code:'NETWORK'}); }
  if (r.error) throw Object.assign(new Error(r.error.message), {code:r.error.code || 'UNKNOWN'});
  return r.data || [];
};
const isDown = e => e.code !== 'P0001'; /* P0001 = a real rule from our SQL (sold out, bad input); anything else means the database is unreachable */
const stars = n => `<span class="stars" role="img" aria-label="${n} star hotel">${'★'.repeat(n)}</span>`;
const from = h => Math.min(...h.rooms.map(r => r.price * (r.need || 1)));   /* cheapest cost per night for the whole group */
const checkDates = (a, b, g) => {
  if (!a || !b) return 'Choose check-in and check-out dates.';
  if (a < today()) return 'Check-in can’t be in the past.';
  if (b <= a) return 'Check-out must be after check-in.';
  if (nights(a, b) > 30) return 'Stays are limited to 30 nights.';
  if (!(g >= 1 && g <= 16)) return 'Choose between 1 and 16 guests.';
  return '';
};
const group = rows => {
  const m = new Map();
  rows.forEach(r => {
    if (!m.has(r.hotel_id)) m.set(r.hotel_id, {id:r.hotel_id, name:r.name, city:r.city, country:r.country, description:r.description, stars:r.stars, amenities:r.amenities || [], hue:r.hue, rooms:[]});
    m.get(r.hotel_id).rooms.push({id:r.room_id, name:r.room_name, price:+r.price, max:r.max_guests, left:r.available});
  });
  return [...m.values()];
};

/* ---------- data layer: Supabase first, local demo data if it is unreachable ---------- */
const demoHotel = (i, name, city, country, stars, hue, description, amenities, rooms) => ({id:`a0000000-0000-0000-0000-${String(i).padStart(12, '0')}`, name, city, country, stars, hue, description, amenities, rooms:rooms.map((r, k) => ({id:`demo-${i}-${k}`, name:r[0], price:r[1], max:r[2], total:r[3]}))});
const DEMO = [
  demoHotel(1, 'The Saffron Terrace', 'Lisbon', 'Portugal', 4, 28, 'Demo listing. A hillside hotel with a rooftop terrace and tiled courtyard.', ['Free Wi-Fi', 'Rooftop terrace', 'Breakfast', 'Air conditioning'], [['Classic Double', 118, 2, 6], ['Terrace Suite', 189, 4, 2]]),
  demoHotel(2, 'Marina Lumen Hotel', 'Dubai', 'United Arab Emirates', 5, 195, 'Demo listing. A waterfront tower with an infinity pool and skyline rooms.', ['Free Wi-Fi', 'Pool', 'Spa', 'Gym', 'Airport shuttle'], [['Skyline King', 265, 2, 8], ['Marina Family Suite', 410, 4, 3]]),
  demoHotel(3, 'Bosphorus Lantern House', 'Istanbul', 'Turkey', 4, 12, 'Demo listing. A small boutique stay with strait views and a garden breakfast room.', ['Free Wi-Fi', 'Breakfast', 'Garden', 'Air conditioning'], [['Garden Double', 104, 2, 5], ['Strait View Suite', 172, 3, 2]]),
  demoHotel(4, 'Kyoto Willow Inn', 'Kyoto', 'Japan', 3, 140, 'Demo listing. A quiet inn with tatami rooms and a small tea garden.', ['Free Wi-Fi', 'Tea garden', 'Breakfast'], [['Tatami Twin', 92, 2, 4], ['Family Tatami', 138, 4, 2]]),
  demoHotel(5, 'Alpine Ember Lodge', 'Interlaken', 'Switzerland', 4, 215, 'Demo listing. A timber lodge with mountain views and a fireside lounge.', ['Free Wi-Fi', 'Sauna', 'Fireplace', 'Parking'], [['Lodge Double', 150, 2, 6], ['Mountain Family Room', 238, 4, 3]]),
  demoHotel(6, 'Seaglass Villas', 'Ubud', 'Indonesia', 5, 95, 'Demo listing. Private villas set among rice terraces, each with a plunge pool.', ['Free Wi-Fi', 'Private pool', 'Breakfast', 'Yoga deck'], [['Terrace Villa', 220, 2, 4], ['Two-bed Pool Villa', 360, 4, 2]]),
  demoHotel(7, 'Clifton Sands Hotel', 'Karachi', 'Pakistan', 4, 205, 'Demo listing. A seafront hotel a short walk from the beach, with a pool and a rooftop restaurant.', ['Free Wi-Fi', 'Pool', 'Rooftop restaurant', 'Air conditioning'], [['Classic Double', 85, 2, 8], ['Sea View Suite', 140, 4, 3], ['Large Family Room', 165, 6, 2]]),
  demoHotel(8, 'Mughal Courtyard Hotel', 'Lahore', 'Pakistan', 4, 25, 'Demo listing. A restored courtyard hotel near the old city, with carved wooden balconies and a garden dining area.', ['Free Wi-Fi', 'Courtyard garden', 'Breakfast', 'Air conditioning'], [['Heritage Double', 78, 2, 6], ['Courtyard Suite', 130, 4, 3], ['Large Family Room', 150, 6, 2]]),
  demoHotel(9, 'Margalla View Suites', 'Islamabad', 'Pakistan', 5, 150, 'Demo listing. Modern suites with hill views, a spa and a business lounge in a quiet, leafy sector.', ['Free Wi-Fi', 'Spa', 'Gym', 'Airport shuttle', 'Business lounge'], [['Deluxe King', 120, 2, 8], ['Executive Family Suite', 210, 4, 3], ['Large Family Room', 280, 6, 2]]),
  demoHotel(10, 'Karimabad Orchard Lodge', 'Hunza', 'Pakistan', 4, 100, 'Demo listing. A stone-and-timber lodge among apricot orchards, with mountain views from every room.', ['Free Wi-Fi', 'Orchard garden', 'Breakfast', 'Mountain views'], [['Valley Double', 70, 2, 6], ['Family Cabin', 115, 4, 3], ['Large Family Room', 140, 6, 2]]),
  demoHotel(11, 'Indus Lakeside Retreat', 'Skardu', 'Pakistan', 4, 190, 'Demo listing. A lakeside retreat with a fireplace lounge and a guided-trek desk.', ['Free Wi-Fi', 'Fireplace', 'Breakfast', 'Tour desk'], [['Lake Double', 75, 2, 5], ['Lakeside Family Room', 125, 4, 2], ['Large Family Room', 145, 6, 2]]),
  demoHotel(12, 'Pine Ridge Cottage Hotel', 'Murree', 'Pakistan', 3, 130, 'Demo listing. A cosy hill hotel among pine trees, with a terrace and warm rooms.', ['Free Wi-Fi', 'Terrace', 'Breakfast', 'Heating'], [['Cosy Double', 55, 2, 6], ['Hill Family Room', 90, 4, 3], ['Large Family Room', 110, 6, 2]]),
  demoHotel(13, 'Swat River Inn', 'Swat', 'Pakistan', 3, 170, 'Demo listing. A riverside inn with a garden restaurant and simple, comfortable rooms.', ['Free Wi-Fi', 'Garden restaurant', 'Breakfast', 'Parking'], [['River Double', 50, 2, 6], ['Garden Family Room', 85, 4, 2], ['Large Family Room', 100, 6, 2]]),
  demoHotel(14, 'Khyber Courtyard Inn', 'Peshawar', 'Pakistan', 3, 15, 'Demo listing. A small inn in a traditional courtyard house, close to the old bazaars.', ['Free Wi-Fi', 'Courtyard', 'Breakfast', 'Air conditioning'], [['Standard Double', 48, 2, 5], ['Courtyard Suite', 82, 4, 2], ['Large Family Room', 95, 6, 2]]),
  demoHotel(15, 'Sufi Gate Hotel', 'Multan', 'Pakistan', 3, 45, 'Demo listing. A friendly city hotel decorated with blue tilework, with a rooftop terrace.', ['Free Wi-Fi', 'Rooftop terrace', 'Breakfast', 'Air conditioning'], [['Blue Tile Double', 52, 2, 6], ['Family Suite', 92, 4, 3], ['Large Family Room', 105, 6, 2]]),
  demoHotel(16, 'Gwadar Bay Resort', 'Gwadar', 'Pakistan', 4, 185, 'Demo listing. A beachfront resort on the bay, with a lagoon-style pool and a seafood restaurant.', ['Free Wi-Fi', 'Private beach', 'Pool', 'Seafood restaurant'], [['Bay View Double', 95, 2, 6], ['Beach Villa', 170, 4, 3], ['Large Family Room', 190, 6, 2]])
];
let CAT = null;
const goOffline = e => { if (e && console.warn) console.warn('Database unavailable, using built-in sample data:', e.message); offline = true; };
const demoBookings = () => { try { return JSON.parse(localStorage.getItem('stayora_demo_bookings')) || []; } catch (e) { return []; } };
const used = (roomId, a, b) => demoBookings().filter(x => x.room_id === roomId && x.status !== 'cancelled' && x.check_in < b && x.check_out > a).reduce((s, x) => s + (x.rooms || 1), 0);

async function loadCatalog() {
  if (CAT) return CAT;
  if (!offline) {
    try {
      const {data, error} = await sb.from('hotels').select('*, room_types(price_per_night)').order('stars', {ascending:false});
      if (error) throw error;
      CAT = data.map(h => ({...h, amenities:h.amenities || [], rooms:h.room_types.map(r => ({price:+r.price_per_night}))})).filter(h => h.rooms.length);
      return CAT;
    } catch (e) { goOffline(e); }
  }
  CAT = DEMO; return CAT;
}
const places = () => [...new Map((CAT || []).map(h => [h.city, h.country]))];
const destOptions = sel => {
  const by = new Map(); places().forEach(([c, k]) => { if (!by.has(k)) by.set(k, []); by.get(k).push(c); });
  const order = [...by.keys()].sort((a, b) => a === 'Pakistan' ? -1 : b === 'Pakistan' ? 1 : a.localeCompare(b));
  const opt = (v, l) => `<option value="${esc(v)}"${sel === v ? ' selected' : ''}>${esc(l)}</option>`;
  return order.map(k => { const cs = by.get(k).sort(); return `<optgroup label="${esc(k)}">${cs.length > 1 ? opt(k, 'All of ' + k) : ''}${cs.map(c => opt(c, c)).join('')}</optgroup>`; }).join('');
};

async function searchOnce(a) {
  if (!offline) {
    try { return group(await rpc('search_hotels', {p_dest:a.dest, p_in:a.in, p_out:a.out, p_guests:a.g, p_hotel:a.hotel || null, p_rooms:a.rooms || 1})); }
    catch (e) { if (!isDown(e)) throw e; goOffline(e); }
  }
  const d = (a.dest || '').toLowerCase();
  return DEMO.filter(h => (!a.hotel || h.id === a.hotel) && (!d || [h.city, h.country, h.name].some(s => s.toLowerCase().includes(d))))
    .map(h => ({...h, rooms:h.rooms.filter(r => r.max >= Math.ceil(a.g / (a.rooms || 1)) && r.total - used(r.id, a.in, a.out) >= (a.rooms || 1)).map(r => ({id:r.id, name:r.name, price:r.price, max:r.max, left:r.total - used(r.id, a.in, a.out)}))}))
    .filter(h => h.rooms.length).sort((x, y) => y.stars - x.stars);
}

/* Flexible dates: search every start date within +/- f days, keep each stay's best option (exact dates win if available) */
/* If the group does not fit in the rooms asked for, try 2, 3, ... rooms (every room needs an adult, 5 rooms at most)
   and give each room type the smallest number of rooms that works (r.need). */
async function searchStays(a) {
  const start = Math.max(a.rooms || 1, 1), cap = Math.max(start, Math.min(5, a.adults || 5)), ks = [];
  for (let k = start; k <= cap; k++) ks.push(k);
  const runs = await Promise.all(ks.map(k => searchOnce({...a, rooms:k}).then(hs => ({k, hs}))));
  const by = new Map();
  runs.forEach(({k, hs}) => hs.forEach(h => {
    let m = by.get(h.id); if (!m) { m = {...h, rooms:[]}; by.set(h.id, m); }
    h.rooms.forEach(r => { if (!m.rooms.some(x => x.id === r.id)) m.rooms.push({...r, need:k}); });
  }));
  return [...by.values()].map(h => ({...h, rooms:h.rooms.sort((x, y) => x.price * x.need - y.price * y.need)})).sort((x, y) => y.stars - x.stars);
}

async function searchFlex(a, f) {
  const t = today(), tasks = [], best = new Map();
  for (let s = -f; s <= f; s++) { const i = addDays(a.in, s), o = addDays(a.out, s); if (i >= t) tasks.push({i, o, s}); }
  const res = await Promise.all(tasks.map(k => searchStays({...a, in:k.i, out:k.o}).then(hs => ({k, hs}))));
  res.forEach(({k, hs}) => hs.forEach(h => {
    const score = (k.s === 0 ? -1e9 : from(h)) + Math.abs(k.s) / 1000, cur = best.get(h.id);
    if (!cur || score < cur.score) best.set(h.id, {score, h:{...h, dates:{in:k.i, out:k.o}}});
  }));
  return [...best.values()].map(x => x.h).sort((x, y) => y.stars - x.stars);
}

function createLocal(a) {
  const h = DEMO.find(x => x.rooms.some(r => r.id === a.p_room)), r = h && h.rooms.find(x => x.id === a.p_room);
  if (!r) throw new Error('That room could not be found.');
  const nr = Math.max(+a.p_rooms || 1, 1), ch = +a.p_children || 0;
  if (a.p_guests < 1 || ch >= a.p_guests || nr > a.p_guests - ch) throw new Error('Each room needs at least one adult.');
  if (Math.ceil(a.p_guests / nr) > r.max) throw new Error(`This room sleeps up to ${r.max} guests. Add rooms or choose a larger room.`);
  if (r.total - used(r.id, a.p_in, a.p_out) < nr) throw new Error('Not enough rooms left for those dates. Please pick other dates or another room.');
  const row = {reference:'STY-' + (Math.random().toString(16) + '00000000').slice(2, 10).toUpperCase(), status:'confirmed', hotel_name:h.name, city:h.city, room_name:r.name, check_in:a.p_in, check_out:a.p_out, guest_count:a.p_guests, rooms:nr, children:ch, pets:!!a.p_pets, total_price:r.price * nights(a.p_in, a.p_out) * nr, full_name:a.p_name.trim(), email:a.p_email.trim().toLowerCase(), offline:true};
  try { localStorage.setItem('stayora_demo_bookings', JSON.stringify([...demoBookings(), {...row, room_id:r.id}])); } catch (e) {}
  return row;
}
async function createBooking(a) {
  if (!offline) {
    try { const r = (await rpc('create_booking', a))[0]; if (r) return r; throw Object.assign(new Error('No booking returned.'), {code:'EMPTY'}); }
    catch (e) { if (!isDown(e)) throw e; goOffline(e); }
  }
  return createLocal(a);
}
async function findBooking(ref, email) {
  if (!offline) {
    try { return (await rpc('get_booking', {p_ref:ref, p_email:email}))[0]; }
    catch (e) { if (!isDown(e)) throw e; goOffline(e); }
  }
  return demoBookings().find(b => b.reference === ref.trim().toUpperCase() && b.email === email.trim().toLowerCase());
}

/* Original illustrated placeholder (no stock photos used) */
const art = h => {
  const win = [0,1,2].flatMap(r => [0,1,2,3].map(c => `<rect x="${140 + c * 36}" y="${134 + r * 26}" width="18" height="14" rx="2"/>`)).join('');
  return `<svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="240" fill="hsl(${h} 70% 82%)"/><rect y="196" width="400" height="44" fill="hsl(${h} 45% 52%)"/><circle cx="318" cy="56" r="26" fill="#fff" opacity=".65"/><path d="M0 196 L90 132 L160 178 L250 108 L400 188 V240 H0Z" fill="hsl(${h} 40% 28%)" opacity=".35"/><rect x="118" y="112" width="168" height="108" rx="6" fill="#fff" opacity=".94"/><g fill="hsl(${h} 50% 42%)">${win}</g><rect x="190" y="190" width="24" height="30" fill="hsl(${h} 45% 30%)"/></svg>`;
};



/* ---------- photos (Unsplash License). SVG art is only the fallback if a photo cannot load ---------- */
const PH = {
  facade: ['1725419755093-1257a0289395', 'Hotel exterior'],
  tower:  ['1735978995178-26f4ab4ea685', 'Hotel exterior'],
  pool:   ['1706561611610-2ebe309993f2', 'Pool and beach'],
  lobby:  ['1759038086403-c607d67bb245', 'Lobby'],
  lobby2: ['1604247258458-0dab9a82ba91', 'Lounge'],
  room:   ['1702255489644-392758161f1f', 'Guest room'],
  room2:  ['1631049421450-348ccd7f8949', 'Bedroom'],
  room3:  ['1509647924673-bbb53e22eeb8', 'Bedroom'],
  bath:   ['1646974400439-8472d58bb19e', 'Bathroom'],
  /* Pakistan places: freely licensed photos from Wikimedia Commons (credited in the page footer) */
  lahore: ['wm:Badshahi_Mosque_Lhr.jpg', 'Badshahi Mosque, Lahore', true],
  isb:    ['wm:Courtyard_in_the_morning.jpg', 'Faisal Mosque, Islamabad', true],
  hunza:  ['wm:Hunza_Valley,_view_from_Eagle%27s_Nest.jpg', 'Hunza Valley', true],
  /* Pakistan photos supplied by the site owner (images/ folder), one per place */
  myKarachi:   ['file:images/karachi.jpg', 'Hotel exterior', true],
  myLahore:    ['file:images/lahore.jpg', 'Hotel courtyard', true],
  myIslamabad: ['file:images/islamabad.jpg', 'Hills and valley view', true],
  myHunza:     ['file:images/hunza.jpg', 'Lodge among the trees', true],
  mySkardu:    ['file:images/skardu.jpg', 'Garden and mountain view', true],
  myMurree:    ['file:images/murree.jpg', 'Pine forest lodge', true],
  mySwat:      ['file:images/swat.jpg', 'River valley', true],
  myPeshawar:  ['file:images/peshawar.jpg', 'Carved wooden verandah', true],
  myMultan:    ['file:images/multan.jpg', 'Decorative gateway', true],
  myGwadar:    ['file:images/gwadar.jpg', 'Bay and beach', true],
  myPakistan:  ['file:images/pakistan.jpg', 'Mountains and valley', true]
};
const wmw = w => w <= 500 ? 500 : w <= 960 ? 960 : 1280;
const photoUrl = (id, w) => id.startsWith('file:') ? id.slice(5) : id.startsWith('wm:') ? `https://commons.wikimedia.org/wiki/Special:FilePath/${id.slice(3)}?width=${wmw(w)}` : `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=70&w=${w}`;
const HID = i => `a0000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
/* Per hotel: [cover, 2 exterior/lobby shots, 3 interior shots]. The first entry is the cover used on cards. */
const PHOTOS = {
  [HID(1)]: ['facade', 'lobby', 'pool', 'room2', 'bath', 'room3'],
  [HID(2)]: ['tower', 'pool', 'lobby2', 'room', 'bath', 'room2'],
  [HID(3)]: ['lobby2', 'facade', 'tower', 'room3', 'room', 'bath'],
  [HID(4)]: ['room2', 'lobby', 'pool', 'room', 'room3', 'bath'],
  [HID(5)]: ['lobby', 'tower', 'facade', 'bath', 'room', 'room2'],
  [HID(6)]: ['pool', 'lobby2', 'tower', 'room3', 'bath', 'room2'],
  [HID(7)]: ['myKarachi', 'tower', 'lobby', 'room', 'bath', 'room2'],
  [HID(8)]: ['myLahore', 'lahore', 'lobby', 'room3', 'room', 'bath'],
  [HID(9)]: ['myIslamabad', 'isb', 'lobby', 'room2', 'bath', 'room3'],
  [HID(10)]: ['myHunza', 'hunza', 'pool', 'room', 'room3', 'bath'],
  [HID(11)]: ['mySkardu', 'lobby', 'lobby2', 'bath', 'room', 'room2'],
  [HID(12)]: ['myMurree', 'facade', 'tower', 'room2', 'room3', 'bath'],
  [HID(13)]: ['mySwat', 'pool', 'lobby2', 'room', 'room2', 'bath'],
  [HID(14)]: ['myPeshawar', 'tower', 'facade', 'room3', 'bath', 'room'],
  [HID(15)]: ['myMultan', 'lobby', 'pool', 'room2', 'room', 'room3'],
  [HID(16)]: ['myGwadar', 'lobby2', 'tower', 'room3', 'bath', 'room']
};
const shot = (k, w, h) => { const [id, label, place] = PH[k]; return `<img src="${photoUrl(id, w)}" alt="${esc(label)}${place ? '' : ' at ' + esc(h.name)}" loading="lazy" decoding="async" data-hue="${+h.hue || 200}">`; };
const hero = h => PHOTOS[h.id] ? shot(PHOTOS[h.id][0], 800, h) : art(h.hue);
const gallery = h => `<div class="gv" id="gv" role="group" aria-label="Photos of ${esc(h.name)}"></div>`;
function bindGallery(h) {
  const box = document.getElementById('gv'), keys = PHOTOS[h.id]; if (!box) return;
  if (!keys) { box.innerHTML = `<div class="gmain"><div class="gstage">${art(h.hue)}</div></div>`; return; }
  let order = keys.map((_, i) => i);
  const draw = (focusSlot) => {
    const m = keys[order[0]];
    box.innerHTML = `<div class="gmain"><div class="gstage">${shot(m, 1400, h)}</div><span class="gcap">${esc(PH[m][1])}</span></div>
      <div class="gthumbs">${order.slice(1).map((o, i) => `<button type="button" class="gt" data-i="${i + 1}" aria-label="Show ${esc(PH[keys[o]][1])} as the main photo">${shot(keys[o], 420, h)}<span>${esc(PH[keys[o]][1])}</span></button>`).join('')}</div>`;
    box.querySelectorAll('.gt').forEach(b => { b.onclick = () => { const i = +b.dataset.i; [order[0], order[i]] = [order[i], order[0]]; draw(i); }; });
    if (focusSlot) { const f = box.querySelector(`.gt[data-i="${focusSlot}"]`); if (f) f.focus(); }
  };
  draw();
}
document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.dataset.hue) t.outerHTML = art(+t.dataset.hue); }, true);

/* ---------- shared components ---------- */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'], WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const fmtS = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
const fmtL = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
const monthOf = s => ({y:+s.slice(0, 4), m:+s.slice(5, 7) - 1});
const monthGrid = (y, m) => {
  const cells = Array(new Date(Date.UTC(y, m, 1)).getUTCDay()).fill(null), n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  for (let d = 1; d <= n; d++) cells.push(iso(new Date(Date.UTC(y, m, d))));
  return cells;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const guestLine = (a, c) => plural(a, 'adult', 'adults') + (c ? ', ' + plural(c, 'child', 'children') : '');
const partyText = P => `${guestLine(P.a, 0)}, ${plural(P.c, 'child', 'children')}, ${plural(P.r, 'room', 'rooms')}`;
/* party = adults, children, rooms, pets. g (total guests) is what the database receives */
const party = q => {
  const g = Math.min(Math.max(+q.g || 2, 1), 16), c = Math.min(Math.max(+q.c || 0, 0), g - 1), r = Math.min(Math.max(+q.r || 1, 1), 5, g - c);
  return {a:g - c, c, r, p:+q.p === 1 ? 1 : 0, g};
};
const trip = q => { const d = dq(), P = party(q); return {in:q.in || d.in, out:q.out || d.out, g:P.g, c:P.c, r:P.r, p:P.p}; };
const tq = v => ({in:v.in, out:v.out, g:v.g, c:v.c, r:v.r, p:v.p});
const LIM = P => ({a:[P.r, 10], c:[0, 6], r:[1, Math.min(5, P.a)]});
const stepParty = (P, k, s) => { const [lo, hi] = LIM(P)[k], Q = {...P, [k]:Math.min(Math.max(P[k] + s, lo), hi)}; Q.g = Q.a + Q.c; return Q; };
const partyClick = (t, get, set) => {
  if (t.dataset.k) set(stepParty(get(), t.dataset.k, +t.dataset.s));
  else if (t.dataset.pets) set({...get(), p:get().p ? 0 : 1});
  else return false;
  return true;
};
const refocus = (root, sel) => { const el = sel && root.querySelector(sel); if (el && !el.disabled) el.focus(); else { const alt = root.querySelector('button:not(:disabled)'); if (alt) alt.focus(); } };
const stepRow = (label, k, val, lo, hi) => `<div class="srow"><span id="gl-${k}">${label}</span><div class="step" role="group" aria-labelledby="gl-${k}"><button type="button" data-k="${k}" data-s="-1" aria-label="Fewer ${label.toLowerCase()}"${val <= lo ? ' disabled' : ''}>−</button><output aria-live="polite">${val}</output><button type="button" data-k="${k}" data-s="1" aria-label="More ${label.toLowerCase()}"${val >= hi ? ' disabled' : ''}>+</button></div></div>`;
const guestPanel = (P, done = true) => { const L = LIM(P); return `<div class="gp">${stepRow('Adults', 'a', P.a, ...L.a)}${stepRow('Children', 'c', P.c, ...L.c)}${stepRow('Rooms', 'r', P.r, ...L.r)}
  <div class="srow pets"><span id="gl-p">Traveling with pets?</span><button type="button" class="switch" role="switch" aria-checked="${P.p ? 'true' : 'false'}" aria-labelledby="gl-p" data-pets="1"><i></i></button></div>
  <p class="muted small">Assistance animals aren’t considered pets.</p>${done ? '<button type="button" class="btn ghost full" data-done="1">Done</button>' : ''}</div>`; };

const searchBar = (v = {}) => {
  const d = dq(), P = party(v), fl = [1, 2, 3, 7].includes(+v.f) ? +v.f : 0, i = v.in || d.in, o = v.out || d.out;
  return `<form class="search" id="sf" novalidate aria-label="Search stays">
  <label class="fld">Where to<select name="dest" required><option value="">Select destination</option>${destOptions(v.dest)}</select></label>
  <div class="fld"><span>Check-in</span><button type="button" class="pick" id="pin" aria-haspopup="dialog" aria-expanded="false">${fmtS(i)}</button></div>
  <div class="fld"><span>Check-out</span><button type="button" class="pick" id="pout" aria-haspopup="dialog" aria-expanded="false">${fmtS(o)}</button></div>
  <div class="fld"><span>Guests and rooms</span><button type="button" class="pick" id="pgst" aria-haspopup="dialog" aria-expanded="false">${esc(partyText(P))}</button></div>
  <input type="hidden" name="in" value="${esc(i)}"><input type="hidden" name="out" value="${esc(o)}"><input type="hidden" name="flex" value="${fl}">
  <input type="hidden" name="a" value="${P.a}"><input type="hidden" name="c" value="${P.c}"><input type="hidden" name="r" value="${P.r}"><input type="hidden" name="p" value="${P.p}">
  <button class="btn">Search stays</button><p class="err" id="se" role="alert"></p><div class="pop" id="pop" hidden></div></form>`;
};

function bindSearch() {
  const f = document.getElementById('sf'); if (!f) return;
  const pop = f.querySelector('#pop'), E = n => f.elements[n], B = {in:f.querySelector('#pin'), out:f.querySelector('#pout'), g:f.querySelector('#pgst')};
  let mode = '', which = 'in', tab = 'cal', view = null, anchor = null;
  const P = () => party({g:+E('a').value + +E('c').value, c:E('c').value, r:E('r').value, p:E('p').value});
  const setP = Q => { E('a').value = Q.a; E('c').value = Q.c; E('r').value = Q.r; E('p').value = Q.p; B.g.textContent = partyText(Q); };
  const sync = () => { B.in.textContent = E('in').value ? fmtS(E('in').value) : 'Select date'; B.out.textContent = E('out').value ? fmtS(E('out').value) : 'Select date'; };
  /* the picker works on ONE date at a time: check-in or check-out. Check-out can only be 1 to 30 nights after check-in. */
  const lo = () => which === 'out' && E('in').value ? addDays(E('in').value, 1) : today();
  const hi = () => which === 'out' && E('in').value ? addDays(E('in').value, 30) : '';
  const off = d => d < lo() || (!!hi() && d > hi());
  const curIdx = () => { const c = monthOf(lo()); return c.y * 12 + c.m; };
  const setView = n => { n = Math.max(n, curIdx()); view = {y:Math.floor(n / 12), m:n % 12}; };
  const close = back => {
    if (!mode) return; const m = mode; mode = ''; pop.hidden = true; pop.innerHTML = '';
    Object.values(B).forEach(b => b.setAttribute('aria-expanded', 'false'));
    if (back) (m === 'g' ? B.g : which === 'in' ? B.in : B.out).focus();
  };
  const calHtml = () => {
    const sel = E(which).value, fl = +E('flex').value, n0 = view.y * 12 + view.m;
    const month = ({y, m}) => `<div class="cal-month"><h3>${MONTHS[m]} ${y}</h3><div class="cal-grid">${WD.map(w => `<span class="wd">${w}</span>`).join('')}${monthGrid(y, m).map(d => !d ? '<span></span>' : `<button type="button" class="day${d === sel ? ' s' : ''}" data-d="${d}" aria-label="${fmtL(d)}"${off(d) ? ' disabled' : ''}${d === sel ? ' aria-pressed="true"' : ''}><span>${+d.slice(8)}</span></button>`).join('')}</div></div>`;
    const chips = [[0, 'Exact dates'], [1, '± 1 day'], [2, '± 2 days'], [3, '± 3 days'], [7, '± 7 days']].map(([n, l]) => `<button type="button" class="chip" data-f="${n}" aria-pressed="${fl === n}">${l}</button>`).join('');
    return `<div class="cal-tabs" role="tablist"><button type="button" role="tab" data-tab="cal" aria-selected="${tab === 'cal'}">Calendar</button><button type="button" role="tab" data-tab="flex" aria-selected="${tab === 'flex'}">Flexible dates</button></div>
    ${tab === 'cal' ? `<div class="cal-body"><button type="button" class="cal-nav prev" data-nav="-1" aria-label="Previous month"${n0 <= curIdx() ? ' disabled' : ''}>‹</button><button type="button" class="cal-nav next" data-nav="1" aria-label="Next month">›</button><div class="cal-months">${month(view)}</div></div>` : '<p class="flexp">Not sure of your exact dates? Choose how many days either side to check. We search every start date in that range and show the best price for each stay.</p>'}
    <div class="cal-chips" role="group" aria-label="Date flexibility">${chips}</div>`;
  };
  const drawCal = sel => { pop.className = 'pop c'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', which === 'in' ? 'Choose check-in date' : 'Choose check-out date'); pop.innerHTML = calHtml(); refocus(pop, sel || (pop.querySelector('.day.s') ? '.day.s' : '.day:not(:disabled)')); };
  const drawG = sel => { pop.className = 'pop g'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Guests and rooms'); pop.innerHTML = guestPanel(P()); refocus(pop, sel || '[data-k]:not(:disabled)'); };
  const place = btn => {
    if (window.matchMedia && window.matchMedia('(max-width: 860px)').matches) { pop.style.left = ''; return; }
    const fld = btn.closest('.fld'), w = Math.min(400, f.clientWidth);
    pop.style.left = Math.max(0, Math.min(fld.offsetLeft, f.clientWidth - w)) + 'px';
  };
  const open = (m, btn) => {
    mode = m; pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    if (m === 'c') { which = btn === B.in ? 'in' : 'out'; anchor = btn; tab = 'cal'; place(btn); const s = monthOf(E(which).value || lo()); setView(s.y * 12 + s.m); drawCal(); }
    else { pop.style.left = ''; drawG(); }
  };
  const toggleCal = btn => () => { const was = mode === 'c' && anchor === btn; close(false); if (!was) open('c', btn); };
  B.in.onclick = toggleCal(B.in); B.out.onclick = toggleCal(B.out);
  B.g.onclick = () => { const was = mode === 'g'; close(false); if (!was) open('g', B.g); };
  pop.onclick = e => {
    const t = e.target.closest('button'); if (!t || t.disabled) return;
    if (mode === 'g') {
      if (t.dataset.done) return close(true);
      if (partyClick(t, P, setP)) drawG(t.dataset.k ? `[data-k="${t.dataset.k}"][data-s="${t.dataset.s}"]` : '[data-pets]');
      return;
    }
    if (t.dataset.d) {
      const d = t.dataset.d;
      if (which === 'in') {
        E('in').value = d; if (E('out').value && (E('out').value <= d || E('out').value > addDays(d, 30))) E('out').value = '';
        sync();
        if (!E('out').value) {   /* move straight on to choosing check-out */
          close(false); open('c', B.out); const s = monthOf(addDays(d, 1)); setView(s.y * 12 + s.m); drawCal();
        } else { close(false); B.in.focus(); }
      } else { E('out').value = d; sync(); close(false); B.out.focus(); }
    } else if (t.dataset.f !== undefined) { E('flex').value = t.dataset.f; drawCal(`[data-f="${t.dataset.f}"]`); }
    else if (t.dataset.tab) { tab = t.dataset.tab; drawCal(`[data-tab="${tab}"]`); }
    else if (t.dataset.nav) { setView(view.y * 12 + view.m + +t.dataset.nav); drawCal(`[data-nav="${t.dataset.nav}"]`); }
  };
  pop.onkeydown = e => {
    const t = e.target, k = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7}[e.key];
    if (mode !== 'c' || !k || !t.dataset || !t.dataset.d) return;
    e.preventDefault();
    const d = addDays(t.dataset.d, k); if (off(d)) return;
    const mo = monthOf(d), idx = mo.y * 12 + mo.m, v0 = view.y * 12 + view.m;
    if (idx !== v0) setView(idx);
    drawCal(`[data-d="${d}"]`);
  };
  f.onkeydown = e => { if (e.key === 'Escape' && mode) { e.preventDefault(); close(true); } };
  if (bindSearch.off) bindSearch.off();
  const away = e => { if (mode && !f.contains(e.target)) close(false); };
  document.addEventListener('mousedown', away);
  bindSearch.off = () => document.removeEventListener('mousedown', away);
  f.onsubmit = e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f)), g = (+v.a || 1) + (+v.c || 0);
    const m = !v.dest ? 'Select a destination.' : checkDates(v.in, v.out, g);
    document.getElementById('se').textContent = m;
    if (!m) location.hash = '#/results?' + qs({dest:v.dest, in:v.in, out:v.out, g, c:v.c, r:v.r, p:v.p, ...(+v.flex ? {f:v.flex} : {})});
  };
}

const card = (h, q, shifted) => {
  const n = nights(q.in, q.out), R0 = +q.r || 1, best = h.rooms.reduce((m, r) => { const k = r.need || R0; return !m || r.price * k < m.price * m.k ? {price:r.price, k} : m; }, null), p = best.price, R = best.k;
  return `<a class="card" href="#/hotel/${h.id}?${qs(tq(q))}"><div class="img">${hero(h)}</div><div class="cb">
  <div class="row">${stars(h.stars)}<span class="muted">${esc(h.city)}, ${esc(h.country)}</span></div>
  <h3>${esc(h.name)}</h3><p class="muted">${esc(h.amenities.slice(0, 3).join(', '))}</p>
  ${shifted ? `<p class="shifted">Best price: ${fmtS(q.in)} to ${fmtS(q.out)}</p>` : ''}
  <p class="price"><span class="muted">From</span> <strong>${money(p)}</strong> <span class="muted">per night</span><br><span class="muted">${money(p * n * R)} for ${plural(n, 'night', 'nights')}${R > 1 ? ', ' + plural(R, 'room', 'rooms') : ''}</span></p></div></a>`;
};

/* ---------- views ---------- */
async function home() {
  if (!CAT) loading();
  const cat = await loadCatalog();
  const d = dq();
  const types = [
    ['Hotels', '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4"/>'],
    ['Apartments', '<rect x="3" y="9" width="8" height="12"/><rect x="13" y="3" width="8" height="18"/>'],
    ['Resorts', '<circle cx="12" cy="8" r="4"/><path d="M2 17q5-4 10 0t10 0M2 21q5-4 10 0t10 0"/>'],
    ['Villas', '<path d="M3 11l9-7 9 7v9H3z"/><path d="M10 20v-6h4v6"/>']
  ];
  const skel = '<div class="wrap"><div class="grid">' + '<div class="skel"></div>'.repeat(3) + '</div></div>';
  show(`<section class="hero"><div class="wrap"><h1>Find a stay that feels like yours</h1><p>Compare hotels, see the full price up front, and book in a minute.</p>${searchBar()}</div></section>
  <section class="block"><div class="wrap"><h2>Offers</h2><p>Demo offers: the discount is shown for design purposes and is not applied at checkout.</p><div class="offers">
    <a class="offer o1" href="#/results?${qs({dest:'', ...d})}"><h3>Late Escape Deals</h3><strong>15% off</strong><span>Plan a last-minute getaway and see what is open.</span><em class="cta">Explore stays</em></a>
    <a class="offer o2" href="#/lookup"><h3>Stayora Rewards Promo</h3><strong>Perks on every stay</strong><span>Rewards are coming soon. Already booked? Look up your reservation.</span><em class="cta">Find my booking</em></a></div></div></section>
  <section class="block"><div class="wrap"><h2>Browse by property type</h2><p>Property types are shown for layout only. Each opens all available stays.</p><div class="types">${types.map(t => `<a class="type" href="#/results?${qs({dest:'', ...d})}"><svg viewBox="0 0 24 24" aria-hidden="true">${t[1]}</svg>${esc(t[0])}</a>`).join('')}</div></div></section>
  <section class="block" id="tr">${skel}</section>
  <section class="block"><div class="wrap"><h2>Smart Travel, Bigger Savings</h2>
    <div class="rewards"><div class="rw-main" id="rwmain"></div>
      <svg class="rw-art" data-speed="-0.07" viewBox="0 0 120 120" aria-hidden="true"><rect x="24" y="54" width="72" height="54" rx="5" fill="#d4af37"/><rect x="18" y="40" width="84" height="18" rx="5" fill="#b8921f"/><rect x="54" y="40" width="12" height="68" fill="#f6efd7"/><path d="M60 40C44 12 20 22 34 40Z" fill="#14262e"/><path d="M60 40C76 12 100 22 86 40Z" fill="#14262e"/><text x="60" y="90" text-anchor="middle" font-size="12" font-weight="700" fill="#14262e" font-family="Figtree,sans-serif">Rewards</text><circle cx="14" cy="22" r="4" fill="#14262e"/><circle cx="106" cy="30" r="3.5" fill="#d4af37"/><rect x="100" y="64" width="7" height="7" rx="1.5" fill="#14262e"/><circle cx="12" cy="76" r="3" fill="#14262e"/><rect x="104" y="96" width="6" height="6" rx="1.5" fill="#14262e"/></svg></div></div></section>
  <section class="block" id="pg">${skel}</section>`);
  bindSearch();
  bindRewards();
  const tr = document.getElementById('tr'), pg = document.getElementById('pg');
  try {
    const hs = cat;
    if (!hs.length) { tr.innerHTML = '<div class="wrap state"><p>No hotels have been added yet.</p></div>'; pg.innerHTML = ''; return; }
    const cities = [...new Map(hs.map(h => [h.city, h])).values()];
    const pk = hs.filter(h => h.country === 'Pakistan').sort((x, y) => y.stars - x.stars), items = [];
    if (pk.length) items.push({dest:'Pakistan', label:'Pakistan', sub:plural(new Set(pk.map(h => h.city)).size, 'city', 'cities'), h:pk[0], photo:'myPakistan'});
    ['Lisbon', 'Dubai', 'Istanbul'].forEach(c => { const h = cities.find(x => x.city === c); if (h) items.push({dest:c, label:c, sub:h.country, h}); });
    if (!items.length) cities.slice(0, 3).forEach(h => items.push({dest:h.city, label:h.city, sub:h.country, h}));
    tr.innerHTML = `<div class="wrap"><h2>Trending destinations</h2><p>Pick a place to see what is available.</p><div class="grid">${items.map(x => `<a class="dest" href="#/results?${qs({dest:x.dest, ...d})}"><div class="img">${x.photo ? shot(x.photo, 800, x.h) : hero(x.h)}</div><span>${esc(x.label)}<small>${esc(x.sub)}</small></span></a>`).join('')}</div></div>`;
    pg.innerHTML = `<div class="wrap"><h2>Stays guests will love</h2><p>Star ratings, with prices for sample dates two weeks from now.</p><div class="grid">${hs.slice(0, 6).map(h => card(h, d)).join('')}</div></div>`;
  } catch (e) {
    tr.innerHTML = `<div class="wrap state"><p class="err" role="alert">${esc(e.message)}</p></div>`; pg.innerHTML = '';
  }
}

async function results(q) {
  if (!CAT) loading();
  await loadCatalog();
  const v = {dest:q.dest || '', ...trip(q), in:q.in, out:q.out, f:[1, 2, 3, 7].includes(+q.f) ? +q.f : 0}, m = checkDates(v.in, v.out, v.g);
  show(`<section class="strip"><div class="wrap">${searchBar(v)}</div></section><section class="wrap"><div id="rl"></div></section>`);
  bindSearch();
  const L = document.getElementById('rl');
  if (m) { document.getElementById('se').textContent = m; L.innerHTML = '<div class="state"><p>Fix the dates above to see available stays.</p></div>'; return; }
  L.innerHTML = '<div class="state"><div class="spin"></div><p>Finding stays…</p></div>';
  try {
    const a = {dest:v.dest, in:v.in, out:v.out, g:v.g, rooms:v.r, adults:v.g - v.c};
    const hs = v.f ? await searchFlex(a, v.f) : await searchStays(a);
    if (!hs.length) { L.innerHTML = '<div class="state"><h2>No stays available</h2><p>Try different dates, fewer guests or rooms, or another destination.</p><a class="btn" href="#/">Start a new search</a></div>'; return; }
    const q2 = tq(v), more = hs.some(h => h.rooms.some(r => (r.need || v.r) > v.r));
    L.innerHTML = `<div class="bar"><h2>${hs.length} stay${hs.length > 1 ? 's' : ''} available${v.dest ? ' for “' + esc(v.dest) + '”' : ''}</h2>
      <label>Sort by<select id="so"><option value="p">Lowest price</option><option value="s">Highest stars</option></select></label>
      <label>Stars<select id="ms"><option value="0">Any</option><option value="4">4 and up</option><option value="5">5 only</option></select></label>
      ${more ? `<p class="muted flexnote">Your group of ${v.g} doesn’t fit in ${plural(v.r, 'room', 'rooms')} at every stay, so some prices include extra rooms.</p>` : ''}
      ${v.f ? `<p class="muted flexnote">Flexible dates: showing the best price within ${plural(v.f, 'day', 'days')} either side of your dates.</p>` : ''}</div><div class="grid" id="gr"></div>`;
    const draw = () => {
      const s = document.getElementById('so').value, ms = +document.getElementById('ms').value;
      const l = hs.filter(h => h.stars >= ms).sort((x, y) => s === 'p' ? from(x) - from(y) : y.stars - x.stars);
      document.getElementById('gr').innerHTML = l.length ? l.map(h => card(h, h.dates ? {...q2, ...h.dates} : q2, !!h.dates && h.dates.in !== v.in)).join('') : '<p class="muted">No stays match this star filter.</p>';
    };
    L.onchange = draw; draw();
  } catch (e) { L.innerHTML = `<div class="state"><p class="err" role="alert">${esc(e.message)}</p></div>`; }
}

async function hotel(q, id) {
  const v = trip(q); loading();
  try {
    const h = (await loadCatalog()).find(x => x.id === id);
    if (!h) throw new Error('We couldn’t find that hotel.');
    const bad = checkDates(v.in, v.out, v.g), n = bad ? 0 : nights(v.in, v.out), P = party(v), R = v.r;
    const rooms = bad ? [] : ((await searchStays({dest:'', in:v.in, out:v.out, g:v.g, rooms:R, adults:v.g - v.c, hotel:id}))[0]?.rooms || []);
    show(`<div class="wrap det"><a class="back" href="#/results?${qs({dest:h.city, ...tq(v)})}">← Back to results</a>${gallery(h)}
    <div class="row">${stars(h.stars)}<span class="muted">${esc(h.city)}, ${esc(h.country)}</span></div><h1>${esc(h.name)}</h1><p>${esc(h.description)}</p>
    <ul class="chips" aria-label="Amenities">${(h.amenities || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    <div class="trip"><span><strong>${bad ? '' : fmt(v.in) + ' to ' + fmt(v.out)}</strong></span><span>${bad ? esc(bad) : plural(n, 'night', 'nights') + ', ' + esc(partyText(P)) + (P.p ? ', with pets' : '')}</span><button type="button" class="linkbtn" id="chg">Change dates or guests</button></div>
    <h2>Choose your room</h2>
    ${rooms.length ? rooms.map(r => { const K = r.need || R; return `<div class="room"><div><h3>${esc(r.name)}</h3><span class="muted">Sleeps up to ${r.max}${K > 1 ? ' per room' : ''}</span>${K > R ? `<br><span class="muted">Your group of ${v.g} needs ${K} of these rooms</span>` : ''}${r.left <= 2 ? `<br><span class="low">Only ${r.left} left for your dates</span>` : ''}</div>
      <div class="rp"><strong>${money(r.price * n * K)}</strong><br><span class="muted">${money(r.price)} per night${K > 1 ? ', ' + plural(K, 'room', 'rooms') : ''}, ${plural(n, 'night', 'nights')}</span></div>
      <a class="btn" href="#/book?${qs({room:r.id, hotel:id, ...tq(v), r:K})}">Reserve</a></div>`; }).join('') : '<div class="state"><p>No rooms are available for these dates and guests. Try different dates.</p></div>'}</div>`);
    bindGallery(h);
    document.getElementById('chg').onclick = () => openTrip(bad ? dq() : v, id);
  } catch (e) { fail(e); }
}

async function book(q) {
  const v = {...trip(q), in:q.in, out:q.out}; loading();
  try {
    const m = checkDates(v.in, v.out, v.g); if (m) throw new Error(m);
    const h = (await searchStays({dest:'', in:v.in, out:v.out, g:v.g, rooms:v.r, adults:v.g - v.c, hotel:q.hotel}))[0];
    const r = h && h.rooms.find(x => x.id === q.room);
    if (!r) throw new Error('That room is no longer available for these dates.');
    const n = nights(v.in, v.out), total = r.price * n * v.r;
    show(`<div class="wrap"><a class="back" href="#/hotel/${h.id}?${qs(tq(v))}">← Back to hotel</a><h1>Complete your booking</h1><div class="two">
    <form class="f" id="bf" novalidate><h2>Guest details</h2>
      <label>Full name<input name="name" autocomplete="name" value="${user ? esc(user.name) : ''}" required></label>
      <label>Email address<input name="email" type="email" autocomplete="email" value="${user ? esc(user.email) : ''}" required></label>
      <label>Phone number<input name="phone" type="tel" autocomplete="tel" required></label>
      <p class="muted">No payment now. You pay at the property.</p>
      <p class="err" id="be" role="alert"></p><button class="btn" style="width:100%">Confirm booking</button></form>
    <aside class="sum" aria-label="Booking summary"><div class="img">${hero(h)}</div><div class="in"><h3>${esc(h.name)}</h3><p class="muted">${esc(h.city)}, ${esc(h.country)}</p><dl>
      <div><dt>Room</dt><dd>${esc(r.name)}</dd></div><div><dt>Check-in</dt><dd>${fmt(v.in)}</dd></div><div><dt>Check-out</dt><dd>${fmt(v.out)}</dd></div>
      <div><dt>Guests</dt><dd>${esc(guestLine(v.g - v.c, v.c))}</dd></div><div><dt>Rooms</dt><dd>${v.r}</dd></div>${v.p ? '<div><dt>Pets</dt><dd>Traveling with pets</dd></div>' : ''}<div><dt>Nights</dt><dd>${n}</dd></div><div class="total"><dt>Total</dt><dd>${money(total)}</dd></div></dl></div></aside></div></div>`);
    const f = document.getElementById('bf'), be = document.getElementById('be');
    f.onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const bad = !d.name.trim() ? ['name', 'Enter your full name.'] : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()) ? ['email', 'Enter a valid email address, like name@example.com.'] : !/^\+?[\d\s()-]{7,}$/.test(d.phone.trim()) ? ['phone', 'Enter a valid phone number, at least 7 digits.'] : null;
      if (bad) { be.textContent = bad[1]; f.elements[bad[0]].focus(); return; }
      const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Confirming…'; be.textContent = '';
      try {
        const res = await createBooking({p_room:r.id, p_in:v.in, p_out:v.out, p_guests:v.g, p_name:d.name, p_email:d.email, p_phone:d.phone, p_rooms:v.r, p_children:v.c, p_pets:!!v.p});
        sessionStorage.setItem('stayora_last', JSON.stringify(res));
        b.textContent = 'Booked';
        if (history.replaceState) history.replaceState(null, '', '#/confirmation/' + res.reference);
        openModal(res, {home:true});
      } catch (x) { be.textContent = x.message; b.disabled = false; b.textContent = 'Confirm booking'; }
    };
  } catch (e) { fail(e); }
}

/* ---------- confirmation popup (modal overlay) ---------- */
let modalEl = null, modalPrev = null, modalHome = false, modalKey = null;
function closeModal(go) {
  if (!modalEl) return;
  modalEl.remove(); modalEl = null;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', modalKey);
  if (modalPrev && modalPrev.focus) modalPrev.focus();
  if (go && modalHome) location.hash = '#/';
}
/* ---------- download confirmation as a PDF (built in the browser, no library) ---------- */
function bookingPdf(b) {
  const pdfText = s => String(s ?? '').replace(/[^\x20-\xff]/g, '?').replace(/[\\()]/g, '\\$&').replace(/[\x80-\xff]/g, c => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0'));
  const rows = [['Reference', b.reference], ['Status', String(b.status).charAt(0).toUpperCase() + String(b.status).slice(1)], ['Hotel', `${b.hotel_name}, ${b.city}`], ['Room', b.room_name],
    ['Check-in', fmt(b.check_in)], ['Check-out', fmt(b.check_out)], ['Nights', String(nights(b.check_in, b.check_out))], ['Guests', guestLine(b.guest_count - (b.children || 0), b.children || 0)], ['Rooms', String(b.rooms || 1)], ...(b.pets ? [['Pets', 'Traveling with pets']] : []),
    ['Booked by', `${b.full_name} (${b.email})`], ['Total', money(b.total_price)]];
  let c = '0.078 0.149 0.18 rg 0 750 595 92 re f\nBT /F2 26 Tf 1 1 1 rg 50 790 Td (Stayora) Tj ET\nBT /F1 12 Tf 0.85 0.9 0.92 rg 50 768 Td (Booking confirmation) Tj ET\n';
  rows.forEach((r, i) => { const y = 700 - i * 34; c += `0.89 0.86 0.84 RG 50 ${y - 10} m 545 ${y - 10} l S\nBT /F1 11 Tf 0.37 0.45 0.48 rg 50 ${y} Td (${pdfText(r[0])}) Tj ET\nBT /F2 12 Tf 0.102 0.102 0.102 rg 190 ${y} Td (${pdfText(r[1])}) Tj ET\n`; });
  c += `BT /F1 11 Tf 0.37 0.45 0.48 rg 50 ${700 - rows.length * 34 - 10} Td (Payment is made at the property. Keep this reference to find your booking.) Tj ET\n`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${c.length} >>\nstream\n${c}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return out;
}
function downloadBooking(b) {
  const url = URL.createObjectURL(new Blob([bookingPdf(b)], {type:'application/pdf'}));
  const a = document.createElement('a');
  a.href = url; a.download = `Stayora-${b.reference}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function mountModal(html, opts = {}) {
  closeModal(false);
  modalHome = !!opts.home; modalPrev = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay' + (opts.cls ? ' ' + opts.cls : ''); wrap.innerHTML = html;
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(true); });
  document.body.appendChild(wrap); modalEl = wrap; document.body.style.overflow = 'hidden';
  modalKey = e => {
    if (e.key === 'Escape') return closeModal(true);
    if (e.key !== 'Tab') return;
    const f = [...wrap.querySelectorAll('button,input,select')], first = f[0], last = f[f.length - 1];
    if (!first) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', modalKey);
  return wrap;
}

function openModal(b, opts = {}) {
  const n = nights(b.check_in, b.check_out);
  const wrap = mountModal(`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mt">
    <button type="button" class="modal-close" aria-label="Close confirmation">×</button>
    <div class="tick" aria-hidden="true">✓</div>
    <h1 id="mt">You’re booked, ${esc(b.full_name.split(' ')[0])}</h1>
    <p>Reference <span class="ref">${esc(b.reference)}</span> <span class="badge">${esc(b.status)}</span></p>
    <dl><div><dt>Hotel</dt><dd>${esc(b.hotel_name)}, ${esc(b.city)}</dd></div><div><dt>Room</dt><dd>${esc(b.room_name)}</dd></div>
    <div><dt>Check-in</dt><dd>${fmt(b.check_in)}</dd></div><div><dt>Check-out</dt><dd>${fmt(b.check_out)}</dd></div>
    <div><dt>Nights</dt><dd>${n}</dd></div><div><dt>Guests</dt><dd>${esc(guestLine(b.guest_count - (b.children || 0), b.children || 0))}</dd></div><div><dt>Rooms</dt><dd>${b.rooms || 1}</dd></div>${b.pets ? '<div><dt>Pets</dt><dd>Traveling with pets</dd></div>' : ''}<div><dt>Booked by</dt><dd>${esc(b.email)}</dd></div>
    <div class="total"><dt>Total, pay at property</dt><dd>${money(b.total_price)}</dd></div></dl>
    <div class="actions"><button type="button" class="btn" id="mpr">Download</button><button type="button" class="btn ghost" id="mgo">Find another stay</button></div></div>`, {home:opts.home});
  const x = wrap.querySelector('.modal-close');
  x.onclick = () => closeModal(true);
  wrap.querySelector('#mpr').onclick = () => downloadBooking(b);
  wrap.querySelector('#mgo').onclick = () => { closeModal(false); location.hash = '#/'; };
  x.focus();
}

/* Change dates or guests: edit in a popup, Save re-opens this hotel page with the new values */
function openTrip(v, id) {
  let P = party(v);
  const wrap = mountModal(`<div class="modal-card trip-card" role="dialog" aria-modal="true" aria-labelledby="mt">
    <button type="button" class="modal-close" aria-label="Close without saving">×</button>
    <h2 id="mt">Change dates or guests</h2>
    <form class="f" id="tf" novalidate>
      <label>Check-in<input type="date" name="in" min="${today()}" value="${esc(v.in)}" required></label>
      <label>Check-out<input type="date" name="out" min="${addDays(v.in, 1)}" value="${esc(v.out)}" required></label>
      <div id="gpb" class="tp"></div>
      <p class="err" id="te" role="alert"></p>
      <div class="actions"><button type="button" class="btn ghost" id="tc">Cancel</button><button class="btn">Save changes</button></div>
    </form></div>`);
  const x = wrap.querySelector('.modal-close'), f = wrap.querySelector('#tf'), te = wrap.querySelector('#te'), box = wrap.querySelector('#gpb');
  const i = f.elements.in, o = f.elements.out;
  const drawP = sel => { box.innerHTML = guestPanel(P, false); if (sel) refocus(box, sel); };
  drawP();
  box.onclick = e => { const t = e.target.closest('button'); if (t && partyClick(t, () => P, Q => { P = Q; })) drawP(t.dataset.k ? `[data-k="${t.dataset.k}"][data-s="${t.dataset.s}"]` : '[data-pets]'); };
  x.onclick = () => closeModal(false);
  wrap.querySelector('#tc').onclick = () => closeModal(false);
  i.onchange = () => { if (!i.value) return; o.min = addDays(i.value, 1); if (!o.value || o.value <= i.value) o.value = addDays(i.value, 3); };
  f.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)), m = checkDates(d.in, d.out, P.g);
    if (m) { te.textContent = m; return; }
    closeModal(false);
    const next = `#/hotel/${id}?${qs({in:d.in, out:d.out, g:P.g, c:P.c, r:P.r, p:P.p})}`;
    if (location.hash !== next) location.hash = next;
  };
  i.focus();
}

/* #/confirmation/:ref still works for refreshes and shared links: the popup opens over the lookup page */
function confirmation(q, ref) {
  let b = null; try { b = JSON.parse(sessionStorage.getItem('stayora_last')); } catch (e) {}
  lookup({ref});
  if (b && b.reference === ref) openModal(b, {home:true});
}

function lookup(q) {
  show(`<section class="lk"><h1>Find my booking</h1><form class="f" id="lf" novalidate>
  <label>Booking reference<input name="ref" value="${esc(q.ref || '')}" placeholder="STY-XXXXXXXX" required></label>
  <label>Email used to book<input name="email" type="email" autocomplete="email" value="${esc(q.email || '')}" required></label>
  <p class="err" id="le" role="alert"></p><button class="btn" style="width:100%">Find booking</button></form></section>`);
  const f = document.getElementById('lf'), le = document.getElementById('le');
  f.onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(f));
    if (!d.ref.trim() || !d.email.trim()) { le.textContent = 'Enter both your reference and your email.'; return; }
    le.textContent = '';
    try {
      const b = await findBooking(d.ref, d.email);
      if (!b) { le.textContent = 'No booking matches that reference and email. Check both and try again.'; return; }
      sessionStorage.setItem('stayora_last', JSON.stringify(b)); openModal(b, {home:false});
    } catch (x) { le.textContent = x.message; }
  };
}

/* ---------- motion: scroll reveal + parallax (skipped when the visitor prefers reduced motion) ---------- */
(function motion() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.remove('pend'); io.unobserve(e.target); } }), {rootMargin:'0px 0px -8% 0px'}) : null;
  const mark = () => {
    if (!io) return;
    app.querySelectorAll('.block h2, .block .wrap > p, .grid > *, .types > *, .offers > *, .rewards').forEach(el => {
      if (el.dataset.rv) return; el.dataset.rv = '1';
      if (el.getBoundingClientRect().top > innerHeight * 0.92) { el.classList.add('pend'); io.observe(el); }
    });
  };
  if (typeof MutationObserver !== 'undefined') new MutationObserver(mark).observe(app, {childList:true, subtree:true});
  let queued = false;
  const parallax = () => {
    queued = false;
    const hero = app.querySelector('.hero'), s = Math.min(scrollY, 900);
    if (hero) { hero.style.setProperty('--pbg', (s * 0.4).toFixed(1) + 'px'); hero.style.setProperty('--ptx', (s * 0.14).toFixed(1) + 'px'); }
    app.querySelectorAll('[data-speed]').forEach(el => {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) return;
      el.style.translate = `0 ${((r.top + r.height / 2 - innerHeight / 2) * parseFloat(el.dataset.speed)).toFixed(1)}px`;
    });
  };
  if (window.addEventListener) window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(parallax); } }, {passive:true});
  mark();
})();

/* ---------- accounts: sign in / register in a right-side drawer ---------- */
/* With a database connection this uses Supabase Auth. Without one (a usability test, or the database being unreachable)
   it falls back to test accounts that live in this browser only. */
let user = null;
const LS = {
  get:(k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } },
  set:(k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const isLocal = u => !!u && String(u.id).startsWith('local-');
const isNet = x => !!x && (x.name === 'AuthRetryableFetchError' || x.name === 'TypeError' || /fetch|network|offline/i.test(String(x.message || '')));
const toUser = s => s && s.user ? {id:s.user.id, email:s.user.email, name:(s.user.user_metadata && s.user.user_metadata.full_name) || String(s.user.email).split('@')[0]} : null;
const localSession = (email, u) => ({user:{id:'local-' + email, email, user_metadata:{full_name:u.name}}});
const hashPw = async (pw, salt) => {
  const text = salt + ':' + pw;
  if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const ch of text) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return 'x' + (h >>> 0).toString(16);
};
const localSignUp = async v => {
  const email = String(v.email).trim().toLowerCase(), users = LS.get('stayora_users', {});
  if (users[email]) throw Object.assign(new Error('An account with this email already exists. Please sign in.'), {code:'EXISTS'});
  const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
  users[email] = {name:String(v.name).trim(), phone:String(v.phone || '').trim(), salt, pw:await hashPw(v.password, salt), created:new Date().toISOString()};
  LS.set('stayora_users', users); LS.set('stayora_session', email);
  return localSession(email, users[email]);
};
const localSignIn = async (emailRaw, pw) => {
  const email = String(emailRaw).trim().toLowerCase(), u = LS.get('stayora_users', {})[email];
  if (!u) throw Object.assign(new Error('No account found for this email yet. Create one below.'), {code:'NOUSER'});
  if (await hashPw(pw, u.salt) !== u.pw) throw new Error('Incorrect password. Please try again.');
  LS.set('stayora_session', email); return localSession(email, u);
};
const myBookings = () => isLocal(user) ? Promise.resolve(demoBookings().filter(b => String(b.email).toLowerCase() === user.email).reverse()) : rpc('my_bookings', {});
function renderAuth() {
  const el = document.getElementById('auth'); if (!el) return;
  el.innerHTML = user
    ? `<button type="button" class="btn sm gold" id="acct" aria-haspopup="dialog">Hi, ${esc(user.name.split(' ')[0])}</button>`
    : '<button type="button" class="btn sm lite" id="asi" aria-haspopup="dialog">Sign in</button><button type="button" class="btn sm gold" id="areg" aria-haspopup="dialog">Register</button>';
  const on = (id, v) => { const b = document.getElementById(id); if (b) b.onclick = () => openAuth(v); };
  on('acct', 'acct'); on('asi', 'in'); on('areg', 'reg');
}
const REWARD = {name:'Member Deal', value:'10% off selected stays', perk:'Secret member-only deals are unlocked'};
const rewardsHtml = () => user
  ? `<h3>Your reward</h3><p class="rw-type"><span class="rbadge">${esc(REWARD.name)}</span><strong>${esc(REWARD.value)}</strong></p><p>${esc(REWARD.perk)} for your account, ${esc(user.name.split(' ')[0])}.</p>`
  : `<h3>Sign in, save money</h3><p>Unlock secret member-only deals and save 10% or more on your next booking.</p>
      <div class="rw-actions"><button type="button" class="btn gold" id="rsign">Sign in</button><button type="button" class="linkbtn" id="rreg">Register</button></div>`;
function bindRewards() {
  const m = document.getElementById('rwmain'); if (!m) return;
  m.innerHTML = rewardsHtml();
  const on = (id, v) => { const b = document.getElementById(id); if (b) b.onclick = () => openAuth(v); };
  on('rsign', 'in'); on('rreg', 'reg');
}
const setUser = s => { user = toUser(s); renderAuth(); bindRewards(); };

function openAuth(view) {
  const wrap = mountModal(`<div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="mt"><button type="button" class="modal-close" aria-label="Close">×</button><div id="dbody"></div></div>`, {cls:'drawer'});
  const body = wrap.querySelector('#dbody'); let list = [];
  const toHome = () => { closeModal(false); if (location.hash !== '#/') location.hash = '#/'; };
  const field = (label, name, type, extra) => `<label>${label}<input name="${name}" type="${type}" ${extra || ''}></label>`;
  const draw = (v, msg, prefill) => {
    if (v === 'acct' && !user) v = 'in';
    if (v !== 'acct' && v !== 'newpw' && user) v = 'acct';
    if (v === 'forgot' || v === 'sent' || v === 'newpw') {
      body.innerHTML = v === 'forgot'
        ? `<h2 id="mt">Reset your password</h2><p class="muted">Enter the email you signed up with and we’ll send you a link to reset your password.</p>
           <form class="f" id="af" novalidate data-v="forgot" style="margin-top:20px">${field('Email address', 'email', 'email', 'autocomplete="email" required')}<p class="err" id="ae" role="alert"></p><button class="btn full">Send reset link</button></form>
           <div class="dfoot"><button type="button" class="linkbtn" data-v="in">Back to sign in</button></div>`
        : v === 'sent'
        ? `<h2 id="mt">Check your email</h2><p>If an account exists for <strong>${esc(prefill)}</strong>, we’ve sent a link to reset your password. It can take a minute to arrive.</p>
           <div class="dfoot"><button type="button" class="btn full" data-v="in">Back to sign in</button></div>`
        : `<h2 id="mt">Set a new password</h2><p class="muted">Choose a new password for your account.</p>
           <form class="f" id="af" novalidate data-v="newpw" style="margin-top:20px">${field('New password', 'password', 'password', 'autocomplete="new-password" required minlength="6"')}${field('Confirm new password', 'confirm', 'password', 'autocomplete="new-password" required')}<p class="err" id="ae" role="alert"></p><button class="btn full">Update password</button></form>`;
      if (v === 'forgot' && prefill) body.querySelector('[name=email]').value = prefill;
      const first = body.querySelector('input') || body.querySelector('button.btn'); if (first) first.focus();
      return;
    }
    if (v === 'acct') {
      body.innerHTML = `<h2 id="mt">Hi, ${esc(user.name)}</h2><p class="muted">${esc(user.email)}</p>
        <div class="reward-chip"><span class="rbadge">${esc(REWARD.name)}</span><strong>${esc(REWARD.value)}</strong><span class="muted">${esc(REWARD.perk)}</span></div><h3 class="dh">Your bookings</h3><div id="bks"><p class="muted">Loading…</p></div>
        <div class="dfoot"><button type="button" class="btn ghost" id="so2">Sign out</button></div>`;
      body.querySelector('#so2').onclick = async () => {
        if (isLocal(user) || !sb) LS.set('stayora_session', null); else { try { await sb.auth.signOut(); } catch (e) {} }
        setUser(null); closeModal(false);
      };
      const box = body.querySelector('#bks');
      myBookings().then(rows => {
        list = rows;
        box.innerHTML = rows.length ? `<ul class="bk-list">${rows.map((b, i) => `<li><button type="button" class="bk" data-i="${i}"><strong>${esc(b.hotel_name)}</strong><span>${fmtS(b.check_in)} to ${fmtS(b.check_out)}, ${esc(plural(b.rooms || 1, 'room', 'rooms'))}</span><span class="muted">${esc(b.reference)}, ${money(b.total_price)}</span><span class="badge">${esc(b.status)}</span></button></li>`).join('')}</ul>` : '<p class="muted">No bookings yet. Your next booking will show up here.</p>';
      }).catch(() => { box.innerHTML = '<p class="muted">Your bookings can’t be loaded right now.</p>'; });
      return;
    }
    const reg = v === 'reg';
    body.innerHTML = `<h2 id="mt">${reg ? 'Create your account' : 'Welcome back'}</h2>
      <p class="muted">${reg ? 'Save your details and see all your bookings in one place.' : 'Sign in to see your bookings.'}</p>
      <div class="dtabs" role="tablist"><button type="button" role="tab" data-v="in" aria-selected="${!reg}">Sign in</button><button type="button" role="tab" data-v="reg" aria-selected="${reg}">Register</button></div>
      ${msg ? `<p class="dmsg" role="status">${esc(msg)}</p>` : ''}
      <form class="f" id="af" novalidate data-v="${v}">
        ${reg ? field('Full name', 'name', 'text', 'autocomplete="name" required') : ''}
        ${field('Email address', 'email', 'email', 'autocomplete="email" required')}
        ${reg ? field('Phone number (optional)', 'phone', 'tel', 'autocomplete="tel"') : ''}
        ${field('Password', 'password', 'password', `autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6"`)}
        <p class="err" id="ae" role="alert"></p><button class="btn full">${reg ? 'Create account' : 'Sign in'}</button>
        ${reg ? '' : '<button type="button" class="linkbtn forgot" data-v="forgot">Forgot password?</button>'}
      </form>`;
    if (prefill) body.querySelector('[name=email]').value = prefill;
    const first = [...body.querySelectorAll('#af input')].find(i => !i.value) || body.querySelector('input'); if (first) first.focus();
  };
  body.onclick = e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.v) { const em = body.querySelector('[name=email]'); draw(t.dataset.v, undefined, t.dataset.v === 'forgot' && em ? em.value : undefined); }
    else if (t.dataset.i !== undefined) { const b = list[+t.dataset.i]; closeModal(false); location.hash = '#/lookup?' + qs({ref:b.reference, email:b.email || user.email}); }
  };
  body.onsubmit = async e => {
    e.preventDefault();
    const f = e.target, v = Object.fromEntries(new FormData(f)), reg = f.dataset.v === 'reg', err = body.querySelector('#ae'), btn = f.querySelector('.btn'), email = String(v.email || '').trim();
    const bad = (m, n) => { err.textContent = m; f.elements[n].focus(); };
    if (f.dataset.v === 'forgot') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('Enter a valid email address, like name@example.com.', 'email');
      btn.disabled = true; btn.textContent = 'Sending…'; err.textContent = '';
      try {
        if (sb) { const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo:location.href.split('#')[0]}); if (error) throw error; }
        return draw('sent', '', email);
      } catch (x) { err.textContent = (x && x.message) || 'We couldn’t send the email. Please try again.'; btn.disabled = false; btn.textContent = 'Send reset link'; return; }
    }
    if (f.dataset.v === 'newpw') {
      if (String(v.password || '').length < 6) return bad('Use a password with at least 6 characters.', 'password');
      if (v.password !== v.confirm) return bad('The two passwords don’t match.', 'confirm');
      btn.disabled = true; btn.textContent = 'Updating…'; err.textContent = '';
      try { const {error} = await sb.auth.updateUser({password:v.password}); if (error) throw error; toHome(); }
      catch (x) { err.textContent = (x && x.message) || 'We couldn’t update your password. Please try again.'; btn.disabled = false; btn.textContent = 'Update password'; }
      return;
    }
    if (reg && !String(v.name || '').trim()) return bad('Enter your full name.', 'name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('Enter a valid email address, like name@example.com.', 'email');
    if (String(v.password || '').length < 6) return bad('Use a password with at least 6 characters.', 'password');
    btn.disabled = true; btn.textContent = reg ? 'Creating account…' : 'Signing in…'; err.textContent = '';
    const local = async () => { setUser(reg ? await localSignUp(v) : await localSignIn(email, v.password)); toHome(); };
    try {
      if (!sb) return await local();
      if (reg) {
        const {data, error} = await sb.auth.signUp({email, password:v.password, options:{data:{full_name:String(v.name).trim(), phone:String(v.phone || '').trim()}}});
        if (error) throw error;
        if (data.session) { setUser(data.session); toHome(); } else draw('in', 'Account created. Check your email to confirm it, then sign in.');
      } else {
        const {data, error} = await sb.auth.signInWithPassword({email, password:v.password});
        if (error) throw error;
        setUser(data.session); toHome();
      }
    } catch (x) {
      let m = x;
      if (sb && isNet(x)) { try { return await local(); } catch (y) { m = y; } }
      if (m && m.code === 'NOUSER') return draw('reg', m.message, email);
      if (m && m.code === 'EXISTS') return draw('in', m.message, email);
      err.textContent = (m && m.message) || 'Something went wrong. Please try again.'; btn.disabled = false; btn.textContent = reg ? 'Create account' : 'Sign in';
    }
  };
  wrap.querySelector('.modal-close').onclick = () => closeModal(false);
  draw(view);
}
renderAuth();
if (!sb) { const em = LS.get('stayora_session', null), u = em && LS.get('stayora_users', {})[em]; if (u) setUser(localSession(em, u)); }
if (sb && sb.auth) {
  sb.auth.getSession().then(({data}) => setUser(data.session)).catch(() => {});
  sb.auth.onAuthStateChange((event, s) => { setUser(s); if (event === 'PASSWORD_RECOVERY') setTimeout(() => openAuth('newpw'), 400); });
}

/* ---------- router ---------- */
function route() {
  closeModal(false);
  const [p, s] = location.hash.slice(1).split('?'), parts = (p || '/').split('/').filter(Boolean), q = Object.fromEntries(new URLSearchParams(s || ''));
  const views = {results, hotel, book, confirmation, lookup};
  (views[parts[0]] || home)(q, parts[1]);
  window.scrollTo(0, 0); app.focus({preventScroll:true});
}
addEventListener('hashchange', route); route();
})();
