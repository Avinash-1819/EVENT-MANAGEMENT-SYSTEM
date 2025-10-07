// ems-final.js
// Run: npm i express cors multer && node ems-final.js

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { randomUUID } = require('crypto');

/* ----------------------------- Persistence ------------------------------ */
const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

function ensureDataDir() {
	if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
	if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
	for (const file of ['facilities.json', 'media.json', 'events.json']) {
		const p = path.join(DATA_DIR, file);
		if (!fs.existsSync(p)) fs.writeFileSync(p, '[]', 'utf-8');
	}
}

function getPath(name) { return path.join(DATA_DIR, `${name}.json`); }

function readArray(name) {
	const p = getPath(name);
	if (!fs.existsSync(p)) return [];
	const text = fs.readFileSync(p, 'utf-8') || '[]';
	try {
		const data = JSON.parse(text);
		return Array.isArray(data) ? data : [];
	} catch { return []; }
}

function writeArray(name, valueArray) {
	const p = getPath(name);
	fs.writeFileSync(p, JSON.stringify(valueArray, null, 2), 'utf-8');
}

function upsert(name, item, idField = 'id') {
	const items = readArray(name);
	const idx = items.findIndex((x) => x[idField] === item[idField]);
	if (idx >= 0) items[idx] = item; else items.push(item);
	writeArray(name, items);
	return item;
}

function removeById(name, id, idField = 'id') {
	const items = readArray(name);
	const next = items.filter((x) => x[idField] !== id);
	writeArray(name, next);
	return items.length !== next.length;
}

/* --------------------------------- Seed --------------------------------- */
function seedIfEmpty() {
	const facilities = readArray('facilities');
	if (facilities.length === 0) {
		const seed = [
			{ id: randomUUID(), name: 'Main Auditorium', capacity: 600, location: 'Block A', resources: [] },
			{ id: randomUUID(), name: 'Seminar Hall 1', capacity: 120, location: 'Block B', resources: [] },
			{ id: randomUUID(), name: 'Open Air Theater', capacity: 800, location: 'Central Lawn', resources: [] },
			{ id: randomUUID(), name: 'Conference Room', capacity: 40, location: 'Admin Tower', resources: [] },
		];
		writeArray('facilities', seed);
	}
	const media = readArray('media');
	if (media.length === 0) {
		const seed = [
			{ id: randomUUID(), name: 'Projector Kit', type: 'projector' },
			{ id: randomUUID(), name: 'PA System Large', type: 'audio' },
			{ id: randomUUID(), name: 'Wireless Mic Set', type: 'audio' },
			{ id: randomUUID(), name: 'LED Wall 12ft', type: 'display' },
		];
		writeArray('media', seed);
	}
}

/* --------------------------- Availability logic -------------------------- */
function timesOverlap(aStartIso, aEndIso, bStartIso, bEndIso) {
	const aStart = new Date(aStartIso).getTime();
	const aEnd = new Date(aEndIso).getTime();
	const bStart = new Date(bStartIso).getTime();
	const bEnd = new Date(bEndIso).getTime();
	if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
	return !(aEnd <= bStart || aStart >= bEnd);
}

function isEventActiveForConflict(e) {
	return e.status !== 'cancelled' && e.status !== 'rejected';
}

function getUnavailableSets(startIso, endIso, excludeEventId = null) {
	const events = readArray('events').filter((e) => e.id !== excludeEventId && isEventActiveForConflict(e) && timesOverlap(e.start, e.end, startIso, endIso));
	const takenFacilityIds = new Set(events.filter(e => e.allocations?.facilityId).map(e => e.allocations.facilityId));
	const takenMediaIds = new Set(events.flatMap(e => e.allocations?.mediaIds || []));
	return { takenFacilityIds, takenMediaIds };
}

function computeAvailability(startIso, endIso, excludeEventId = null) {
	const facilities = readArray('facilities');
	const media = readArray('media');
	const { takenFacilityIds, takenMediaIds } = getUnavailableSets(startIso, endIso, excludeEventId);
	return {
		availableFacilities: facilities.filter(f => !takenFacilityIds.has(f.id)),
		availableMedia: media.filter(m => !takenMediaIds.has(m.id)),
		takenFacilityIds: Array.from(takenFacilityIds),
		takenMediaIds: Array.from(takenMediaIds),
	};
}

/* ------------------------------ Web server ------------------------------ */
ensureDataDir();
seedIfEmpty();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));

const upload = multer({ storage: multer.diskStorage({
	destination: (req, file, cb) => {
		const { id } = req.params;
		const dir = path.join(UPLOADS_DIR, id);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		cb(null, dir);
	},
	filename: (_req, file, cb) => {
		const ts = Date.now();
		const safe = file.originalname.replace(/[^\w.-]/g, '_');
		cb(null, `${ts}-${safe}`);
	}
})});

/* ------------------------------- HTML/CSS ------------------------------- */
const BASE_CSS = `
:root {
	--bg: #0b1220; --panel:#0f172a; --card:#111827; --text:#e5e7eb; --muted:#9ca3af;
	--primary:#3b82f6; --primary-600:#2563eb; --success:#10b981; --warn:#f59e0b; --danger:#ef4444; --ring:rgba(59,130,246,.35);
}
*{box-sizing:border-box} body{margin:0;background:radial-gradient(1200px 600px at 80% -20%, rgba(59,130,246,.15), transparent 40%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
a{text-decoration:none;color:var(--text)} .container{max-width:1200px;margin:0 auto;padding:24px}
.navbar{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;position:sticky;top:0;z-index:20;background:linear-gradient(180deg, rgba(11,18,32,.95), rgba(11,18,32,.7));backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,.06)}
.brand{display:flex;gap:10px;align-items:center;font-weight:800}.brand img{width:28px;height:28px;border-radius:6px}
.btn{border:1px solid rgba(255,255,255,.06);background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));padding:10px 14px;border-radius:10px;color:var(--text)}
.btn-primary{border:none;background:linear-gradient(180deg,var(--primary),var(--primary-600));box-shadow:0 10px 30px rgba(37,99,235,.35)}
.btn-success{border:none;background:linear-gradient(180deg,var(--success),#0a8c68)}
.btn-danger{border:none;background:linear-gradient(180deg,var(--danger),#b91c1c)}
.section{padding:18px 24px 30px}.grid{display:grid;gap:14px}.g-3{grid-template-columns:repeat(3,1fr)}.g-2{grid-template-columns:repeat(2,1fr)}
.card{border:1px solid rgba(255,255,255,.06);background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));border-radius:14px;overflow:hidden}
.card .body{padding:12px}.card img{width:100%;height:160px;object-fit:cover;display:block}
.badge{font-size:12px;padding:3px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);color:var(--muted)}
.badge.success{background:rgba(16,185,129,.12);color:#a7f3d0;border-color:rgba(16,185,129,.35)}
.badge.warn{background:rgba(245,158,11,.12);color:#fde68a;border-color:rgba(245,158,11,.35)}
.badge.danger{background:rgba(239,68,68,.12);color:#fecaca;border-color:rgba(239,68,68,.35)}
.input,select,textarea{width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#0d1425;color:var(--text);outline:none}
.input:focus,select:focus,textarea:focus{border-color:var(--ring);box-shadow:0 0 0 4px var(--ring)}
.table{width:100%;border-collapse:collapse}.table th,.table td{border-bottom:1px solid rgba(255,255,255,.06);padding:10px 8px;text-align:left}
.row{display:grid;gap:10px}.two{grid-template-columns:1fr 1fr}.three{grid-template-columns:1fr 1fr 1fr}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 14px}
.toast{position:fixed;right:16px;top:76px;z-index:50;display:none;background:#0f172a;border:1px solid rgba(255,255,255,.08);color:var(--text);padding:12px 14px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
.toast.show{display:block;animation:fadein .2s ease}@keyframes fadein{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}
}
.footer{padding:36px 24px;color:var(--muted);text-align:center}
@media (max-width:1000px){.g-3{grid-template-columns:1fr}.g-2{grid-template-columns:1fr}.two,.three{grid-template-columns:1fr}}
`;

/* Student Portal (request → availability → submit) */
const STUDENT_HTML = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>EMS – Student</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>${BASE_CSS}</style>
<script>
const fmt = (iso) => new Date(iso).toLocaleString();
async function api(url, opts){const r = await fetch(url, opts);let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.error||'Request failed');return d}
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.className='toast show';setTimeout(()=>t.className='toast',2200)}
async function loadBase(){
	const [fac, media] = await Promise.all([api('/api/facilities'), api('/api/media')]);
	window._fac=fac; window._media=media; renderCards(); fillSelects(fac, media);
}
function renderCards(){
	const fac = window._fac||[]; const grid=document.getElementById('facGrid');
	const imgs=['https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?q=80&w=1600&auto=format&fit=crop','https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=1600&auto=format&fit=crop','https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop','https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?q=80&w=1600&auto=format&fit=crop'];
	grid.innerHTML=fac.map((f,i)=>'<div class="card"><img src="'+imgs[i%4]+'"/><div class="body"><div style="display:flex;justify-content:space-between;align-items:center"><strong>'+f.name+'</strong><span class="badge">'+(f.capacity||0)+' seats</span></div><div class="badge">'+(f.location||'')+'</div><div class="toolbar"><button class="btn" onclick="selectFacility(\\''+f.id+'\\')">Use this venue</button></div></div></div>').join('');
}
function fillSelects(fac, media){
	document.getElementById('facility').innerHTML = fac.map(f=>'<option value="'+f.id+'">'+f.name+'</option>').join('');
	document.getElementById('media').innerHTML = media.map(m=>'<option value="'+m.id+'">'+m.name+' ('+m.type+')</option>').join('');
}
function selectFacility(id){document.getElementById('facility').value=id;document.getElementById('title').focus();toast('Venue selected')}
async function findAvailability(e){
	e?.preventDefault();
	const start=document.getElementById('start').value, end=document.getElementById('end').value;
	if(!start||!end){toast('Pick start/end');return}
	const data=await api('/api/availability?start='+new Date(start).toISOString()+'&end='+new Date(end).toISOString());
	// Only show available
	fillSelects(data.availableFacilities, data.availableMedia);
	const msg='Available: '+data.availableFacilities.length+' venues, '+data.availableMedia.length+' media';
	document.getElementById('avail').innerHTML='<span class="badge success">'+msg+'</span>';
}
async function submitEvent(e){
	e.preventDefault();
	const body={
		title: title.value.trim(),
		description: description.value.trim(),
		facultyInCharge: facultyInCharge.value.trim(),
		club: club.value.trim(),
		organizer: organizer.value.trim(),
		start: start.value, end: end.value,
		allocations:{
			facilityId: facility.value,
			mediaIds: Array.from(media.selectedOptions).map(o=>o.value)
		},
		requirements:{
			catering:{ snacks: snacks.checked, lunch: lunch.checked, headcount: Number(headcount.value)||0 },
			stay:{ needed: stayNeeded.checked, rooms: Number(rooms.value)||0, nights: Number(nights.value)||0 },
			transport:{ needed: transportNeeded.checked, pickupLocation: pickupLocation.value.trim(), pickupTime: pickupTime.value }
		}
	};
	try{
		const res=await api('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
		toast('Request submitted'); document.getElementById('eventForm').reset(); document.getElementById('avail').innerHTML='';
		loadMyEvents();
	}catch(err){toast(err.message)}
}
async function loadMyEvents(){
	let events=await api('/api/events'); // demo: show all
	const tbody=document.getElementById('myBody');
	tbody.innerHTML=events.slice().reverse().map(e=>{
		const cls=e.status==='approved'?'success':(e.status==='pending'?'warn':(e.status==='cancelled'||e.status==='rejected'?'danger':''));
		return '<tr><td>'+e.title+'<div class="badge">'+(e.club||'-')+' • '+(e.facultyInCharge||'-')+'</div></td><td><span class="badge '+cls+'">'+e.status+'</span></td><td>'+fmt(e.start)+' → '+fmt(e.end)+'</td><td>'+(e.allocations?.facilityName||'')+'</td></tr>';
	}).join('');
}
window.addEventListener('DOMContentLoaded',()=>{loadBase();loadMyEvents()});
</script>
</head><body>
<div class="navbar"><div class="brand"><img src="https://images.unsplash.com/photo-1515165562835-c3b8c8f1a3fa?q=80&w=200&auto=format&fit=crop"/><span>Campus EMS</span></div><div class="toolbar"><a class="btn" href="/dashboard.html">Dashboard</a><a class="btn" href="/admin.html">Admin</a></div></div>
<div class="container">
	<div class="section">
		<h2>Browse Venues</h2>
		<div id="facGrid" class="grid g-3"></div>
	</div>
	<div class="section">
		<h2>Request Event</h2>
		<form id="eventForm" onsubmit="submitEvent(event)">
			<div class="row three">
				<div><label>Title</label><input id="title" class="input" required placeholder="e.g., Tech Symposium"/></div>
				<div><label>Organizer</label><input id="organizer" class="input" required placeholder="Your name or club rep"/></div>
				<div><label>Faculty in Charge</label><input id="facultyInCharge" class="input" required placeholder="Faculty name"/></div>
			</div>
			<div class="row two">
				<div><label>Club (if any)</label><input id="club" class="input" placeholder="e.g., CSI, Rotaract"/></div>
				<div><label>Description</label><input id="description" class="input" placeholder="Event details"/></div>
			</div>
			<div class="row three">
				<div><label>Start</label><input id="start" type="datetime-local" class="input" required/></div>
				<div><label>End</label><input id="end" type="datetime-local" class="input" required/></div>
				<div style="display:flex;align-items:end"><button class="btn" onclick="findAvailability(event)">Find availability</button></div>
			</div>
			<div class="toolbar" id="avail"></div>
			<div class="row two">
				<div><label>Venue</label><select id="facility" class="input" required></select></div>
				<div><label>Media Requirements</label><select id="media" class="input" multiple size="4"></select></div>
			</div>
			<div class="card"><div class="body">
				<h3>Catering</h3>
				<div class="row three">
					<div><label><input type="checkbox" id="snacks"/> Snacks</label></div>
					<div><label><input type="checkbox" id="lunch"/> Lunch</label></div>
					<div><label>Headcount</label><input id="headcount" type="number" class="input" placeholder="Guests + members"/></div>
				</div>
			</div></div>
			<div class="card"><div class="body">
				<h3>Stay</h3>
				<div class="row three">
					<div><label><input type="checkbox" id="stayNeeded"/> Stay needed</label></div>
					<div><label>Rooms</label><input id="rooms" type="number" class="input"/></div>
					<div><label>Nights</label><input id="nights" type="number" class="input"/></div>
				</div>
			</div></div>
			<div class="card"><div class="body">
				<h3>Transport</h3>
				<div class="row three">
					<div><label><input type="checkbox" id="transportNeeded"/> Transport needed</label></div>
					<div><label>Pickup Location</label><input id="pickupLocation" class="input"/></div>
					<div><label>Pickup Time</label><input id="pickupTime" type="datetime-local" class="input"/></div>
				</div>
			</div></div>
			<div class="toolbar"><button type="submit" class="btn btn-success">Submit Request</button><a class="btn" href="/dashboard.html">View Dashboard</a></div>
		</form>
	</div>
	<div class="section">
		<h2>My Recent Requests</h2>
		<table class="table"><thead><tr><th>Title • Club • Faculty</th><th>Status</th><th>When</th><th>Venue</th></tr></thead><tbody id="myBody"></tbody></table>
	</div>
</div>
<div id="toast" class="toast">Saved</div>
<div class="footer">© <span id="year"></span> Campus EMS</div>
<script>document.getElementById('year').textContent=new Date().getFullYear()</script>
</body></html>`;

/* Admin Portal (approvals, completion, proof uploads) */
const ADMIN_HTML = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>EMS – Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>${BASE_CSS}</style>
<script>
const fmt = (iso)=>new Date(iso).toLocaleString();
async function api(u,o){const r=await fetch(u,o);let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.error||'Request failed');return d}
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.className='toast show';setTimeout(()=>t.className='toast',2200)}
async function refresh(){
	const [events, facilities] = await Promise.all([api('/api/events'), api('/api/facilities')]);
	const facById = Object.fromEntries(facilities.map(f=>[f.id,f]));
	const q = (document.getElementById('q')?.value||'').toLowerCase?.()||'';
	const status = document.getElementById('status')?.value||'';
	const filt = events.filter(e => (!status || e.status===status) && (!q || e.title.toLowerCase().includes(q) || (e.club||'').toLowerCase().includes(q)));
	const tbody=document.getElementById('tbody');
	tbody.innerHTML=filt.slice().reverse().map(e=>{
		const badge=e.status==='approved'?'success':(e.status==='pending'?'warn':(e.status==='rejected'||e.status==='cancelled'?'danger':'' ));
		const venue = facById[e.allocations?.facilityId]?.name || '';
		return '<tr>'
			+'<td>'+e.title+'<div class="badge">'+(e.club||'-')+' • '+(e.facultyInCharge||'-')+'</div></td>'
			+'<td><span class="badge '+badge+'">'+e.status+'</span></td>'
			+'<td>'+fmt(e.start)+' → '+fmt(e.end)+'</td>'
			+'<td>'+venue+'</td>'
			+'<td style="display:flex;gap:6px;flex-wrap:wrap">'
			+'<button class="btn" onclick="setStatus(\\''+e.id+'\\',\\'approved\\')">Approve</button>'
			+'<button class="btn" onclick="setStatus(\\''+e.id+'\\',\\'rejected\\')">Reject</button>'
			+'<button class="btn" onclick="setStatus(\\''+e.id+'\\',\\'cancelled\\')">Cancel</button>'
			+'<button class="btn" onclick="setStatus(\\''+e.id+'\\',\\'completed\\')">Mark Completed</button>'
			+'<button class="btn" onclick="openProof(\\''+e.id+'\\')">Proofs</button>'
			+'</td></tr>';
	}).join('');
	// Facilities list quick edit
	const facList=document.getElementById('facList');
	if (facList) facList.innerHTML=facilities.map(f=>'<div class="card"><div class="body"><strong>'+f.name+'</strong><div class="badge">'+(f.location||'')+'</div><div class="toolbar"><button class="btn" onclick="renameFacility(\\''+f.id+'\\',\\''+encodeURIComponent(f.name)+'\\')">Rename</button><button class="btn btn-danger" onclick="deleteFacility(\\''+f.id+'\\')">Delete</button></div></div></div>').join('');
}
async function setStatus(id,status){await api('/api/events/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});toast('Updated');refresh()}
async function addFacility(e){e.preventDefault();await api('/api/facilities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:facilityName.value,capacity:Number(facilityCap.value)||0,location:facilityLoc.value})});e.target.reset();toast('Facility added');refresh()}
async function deleteFacility(id){if(!confirm('Delete facility?'))return;const r=await fetch('/api/facilities/'+id,{method:'DELETE'});if(r.ok){toast('Deleted');refresh()}else toast('Failed')}
function renameFacility(id,name){const n=prompt('New name',decodeURIComponent(name));if(!n)return;api('/api/facilities/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n})}).then(()=>{toast('Renamed');refresh()})}
async function openProof(id){
	document.getElementById('proofEventId').value=id;
	const d=await api('/api/events/'+id);
	const list=document.getElementById('proofList');
	list.innerHTML=(d.proofs||[]).map(p=>'<li><a href="'+p.url+'" target="_blank">'+p.name+'</a></li>').join('')||'<li class="badge">No proofs yet</li>';
	document.getElementById('proofs').style.display='block';
}
function closeProof(){document.getElementById('proofs').style.display='none'}
async function uploadProof(e){
	e.preventDefault();
	const id=document.getElementById('proofEventId').value;
	const form=new FormData(document.getElementById('proofForm'));
	const r=await fetch('/api/events/'+id+'/proofs',{method:'POST',body:form});
	if(r.ok){toast('Uploaded');openProof(id)} else {toast('Upload failed')}
}
window.addEventListener('DOMContentLoaded',refresh);
</script>
</head><body>
<div class="navbar"><div class="brand"><img src="https://images.unsplash.com/photo-1515165562835-c3b8c8f1a3fa?q=80&w=200&auto=format&fit=crop"/><span>Campus EMS – Admin</span></div><div class="toolbar"><a class="btn" href="/">Student</a><a class="btn" href="/dashboard.html">Dashboard</a></div></div>
<div class="container">
	<div class="section">
		<h2>Facilities</h2>
		<form class="row three" onsubmit="addFacility(event)">
			<input id="facilityName" class="input" placeholder="Name" required/>
			<input id="facilityCap" class="input" type="number" placeholder="Capacity"/>
			<input id="facilityLoc" class="input" placeholder="Location"/>
			<button class="btn btn-success" type="submit">Add</button>
		</form>
		<div id="facList" class="grid g-3"></div>
	</div>
	<div class="section">
		<h2>Event Requests</h2>
		<div class="toolbar">
			<select id="status" class="input" onchange="refresh()"><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></select>
			<input id="q" class="input" placeholder="Search by title or club" oninput="refresh()"/>
		</div>
		<table class="table"><thead><tr><th>Title • Club • Faculty</th><th>Status</th><th>When</th><th>Venue</th><th>Actions</th></tr></thead><tbody id="tbody"></tbody></table>
	</div>
</div>
<div class="footer">© <span id="year"></span> Campus EMS – Admin</div>
<div id="toast" class="toast">Saved</div>
<script>document.getElementById('year').textContent=new Date().getFullYear()</script>

<!-- Proofs modal -->
<div id="proofs" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(2px);padding:40px;z-index:60">
	<div class="card" style="max-width:700px;margin:0 auto">
		<div class="body">
			<div style="display:flex;justify-content:space-between;align-items:center"><h3>Event Proofs</h3><button class="btn btn-danger" onclick="closeProof()">Close</button></div>
			<ul id="proofList"></ul>
			<form id="proofForm" onsubmit="uploadProof(event)" enctype="multipart/form-data">
				<input type="hidden" id="proofEventId" name="eventId"/>
				<input type="file" name="files" multiple class="input" accept="image/*,video/*,application/pdf"/>
				<div class="toolbar"><button class="btn btn-primary" type="submit">Upload</button></div>
			</form>
			<div class="badge">Only allowed after event is marked Completed.</div>
		</div>
	</div>
</div>
</body></html>`;

/* Dashboard (DB-like overview; other events same date; allocation flags) */
const DASHBOARD_HTML = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>EMS – Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>${BASE_CSS}</style>
<script>
const fmt=(iso)=>new Date(iso).toLocaleString();
function sameDate(a,b){const da=new Date(a), db=new Date(b);return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate()}
async function api(u,o){const r=await fetch(u,o);let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.error||'Request failed');return d}
async function refresh(){
	const [events, facilities, media] = await Promise.all([api('/api/events'), api('/api/facilities'), api('/api/media')]);
	const facById = Object.fromEntries(facilities.map(f=>[f.id,f]));
	const mediaById = Object.fromEntries(media.map(m=>[m.id,m]));
	const q=(document.getElementById('q')?.value||'').toLowerCase?.()||''; const status=document.getElementById('status')?.value||'';
	const filt = events.filter(e => (!status || e.status===status) && (!q || e.title.toLowerCase().includes(q) || (e.club||'').toLowerCase().includes(q) || (e.facultyInCharge||'').toLowerCase().includes(q)));
	const rows = filt.slice().reverse().map(e=>{
		const sameDayOthers = events.filter(o => o.id!==e.id && sameDate(o.start,e.start)).map(o=>o.title);
		const venue = facById[e.allocations?.facilityId]?.name || '';
		const mediaNames = (e.allocations?.mediaIds||[]).map(id=>mediaById[id]?.name||id).join(', ') || '-';
		const availability = e.status==='cancelled' || e.status==='rejected' ? 'N/A' : 'Allocated';
		return '<tr>'
		  +'<td>'+fmt(e.start)+'</td>'
		  +'<td>'+venue+'</td>'
		  +'<td>'+mediaNames+'</td>'
		  +'<td>'+(e.facultyInCharge||'-')+'</td>'
		  +'<td>'+(e.club||'-')+'</td>'
		  +'<td>'+availability+'</td>'
		  +'<td>'+(sameDayOthers.join('; ')||'-')+'</td>'
		  +'</tr>';
	}).join('');
	document.getElementById('tbody').innerHTML=rows;
}
window.addEventListener('DOMContentLoaded',refresh);
</script>
</head><body>
<div class="navbar"><div class="brand"><img src="https://images.unsplash.com/photo-1515165562835-c3b8c8f1a3fa?q=80&w=200&auto=format&fit=crop"/><span>Campus EMS – Dashboard</span></div><div class="toolbar"><a class="btn" href="/">Student</a><a class="btn" href="/admin.html">Admin</a></div></div>
<div class="container">
	<div class="section">
		<h2>Database Dashboard</h2>
		<div class="toolbar">
			<select id="status" class="input" onchange="refresh()"><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></select>
			<input id="q" class="input" placeholder="Search by title/club/faculty" oninput="refresh()"/>
		</div>
		<div class="card"><div class="body" style="overflow:auto">
			<table class="table">
				<thead>
					<tr>
						<th>Event Date/Time</th>
						<th>Venue</th>
						<th>Media</th>
						<th>Faculty Handling</th>
						<th>Club</th>
						<th>Alloc Status</th>
						<th>Other Events Same Date</th>
					</tr>
				</thead>
				<tbody id="tbody"></tbody>
			</table>
		</div></div>
		<div class="badge">Note: Venue and media allocation shown reflect real-time conflict checks.</div>
	</div>
</div>
<div class="footer">© <span id="year"></span> Campus EMS – Dashboard</div>
<script>document.getElementById('year').textContent=new Date().getFullYear()</script>
</body></html>`;

/* --------------------------------- Routes -------------------------------- */
// Pages
app.get('/', (_req, res) => res.type('html').send(STUDENT_HTML));
app.get('/admin.html', (_req, res) => res.type('html').send(ADMIN_HTML));
app.get('/dashboard.html', (_req, res) => res.type('html').send(DASHBOARD_HTML));

// Basic health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Facilities CRUD + availability per facility
app.get('/api/facilities', (_req, res) => res.json(readArray('facilities')));
app.post('/api/facilities', (req, res) => {
	const { name, capacity = 0, location = '', resources = [] } = req.body || {};
	if (!name) return res.status(400).json({ error: 'name is required' });
	const facility = { id: randomUUID(), name, capacity, location, resources };
	upsert('facilities', facility);
	res.status(201).json(facility);
});
app.put('/api/facilities/:id', (req, res) => {
	const { id } = req.params;
	const items = readArray('facilities');
	const x = items.find(f => f.id === id);
	if (!x) return res.status(404).json({ error: 'facility not found' });
	const updated = { ...x, ...req.body, id };
	upsert('facilities', updated);
	res.json(updated);
});
app.delete('/api/facilities/:id', (req, res) => {
	const { id } = req.params;
	const ok = removeById('facilities', id);
	if (!ok) return res.status(404).json({ error: 'facility not found' });
	res.status(204).send();
});
app.get('/api/facilities/:id/availability', (req, res) => {
	const { id } = req.params; const { start, end } = req.query;
	if (!start || !end) return res.status(400).json({ error: 'start and end required' });
	const { takenFacilityIds } = getUnavailableSets(start, end);
	res.json({ available: !takenFacilityIds.has(id) });
});

// Media list (resources that can be booked)
app.get('/api/media', (_req, res) => res.json(readArray('media')));

// Global availability
app.get('/api/availability', (req, res) => {
	const { start, end, exclude } = req.query;
	if (!start || !end) return res.status(400).json({ error: 'start and end required' });
	const data = computeAvailability(start, end, exclude || null);
	res.json(data);
});

// Events
function hasConflictForAllocations(candidate, allEvents) {
	const overlapping = allEvents.filter(e => e.id !== candidate.id && isEventActiveForConflict(e) && timesOverlap(e.start, e.end, candidate.start, candidate.end));
	if (candidate.allocations?.facilityId && overlapping.some(e => e.allocations?.facilityId === candidate.allocations.facilityId)) return true;
	const reqMedia = new Set(candidate.allocations?.mediaIds || []);
	if (reqMedia.size > 0) {
		for (const e of overlapping) {
			const em = new Set(e.allocations?.mediaIds || []);
			for (const id of reqMedia) if (em.has(id)) return true;
		}
	}
	return false;
}

app.get('/api/events', (req, res) => {
	const { status } = req.query;
	let events = readArray('events');
	if (status) events = events.filter(e => e.status === status);
	res.json(events);
});

app.get('/api/events/:id', (req, res) => {
	const { id } = req.params;
	const e = readArray('events').find(x => x.id === id);
	if (!e) return res.status(404).json({ error: 'not found' });
	res.json(e);
});

app.post('/api/events', (req, res) => {
	const body = req.body || {};
	const required = ['title','organizer','facultyInCharge','start','end','allocations'];
	for (const k of required) if (!body[k]) return res.status(400).json({ error: `${k} is required` });
	const startMs = new Date(body.start).getTime(); const endMs = new Date(body.end).getTime();
	if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) return res.status(400).json({ error: 'invalid time range' });

	const fac = readArray('facilities').find(f => f.id === (body.allocations?.facilityId || ''));
	const event = {
		id: randomUUID(),
		title: body.title,
		description: body.description || '',
		organizer: body.organizer,
		facultyInCharge: body.facultyInCharge,
		club: body.club || '',
		start: body.start, end: body.end,
		allocations: {
			facilityId: body.allocations?.facilityId || null,
			facilityName: fac?.name || '',
			mediaIds: Array.isArray(body.allocations?.mediaIds) ? body.allocations.mediaIds : []
		},
		requirements: body.requirements || {},
		status: 'pending',
		createdAt: new Date().toISOString(),
		proofs: []
	};

	const events = readArray('events');
	if (hasConflictForAllocations(event, events)) return res.status(409).json({ error: 'conflict with existing booking' });

	upsert('events', event);
	res.status(201).json(event);
});

app.put('/api/events/:id', (req, res) => {
	const { id } = req.params;
	const events = readArray('events');
	const existing = events.find(e => e.id === id);
	if (!existing) return res.status(404).json({ error: 'event not found' });

	const next = { ...existing, ...req.body, id };
	const changedTime = !!(req.body.start || req.body.end);
	const changedAlloc = !!(req.body.allocations);
	if (changedTime || changedAlloc) {
		if (!next.start || !next.end) return res.status(400).json({ error: 'start/end required' });
		if (hasConflictForAllocations(next, events)) return res.status(409).json({ error: 'conflict with existing booking' });
	}
	upsert('events', next);
	res.json(next);
});

// Proof uploads (only when completed)
app.post('/api/events/:id/proofs', upload.array('files', 10), (req, res) => {
	const { id } = req.params;
	const events = readArray('events');
	const e = events.find(x => x.id === id);
	if (!e) return res.status(404).json({ error: 'event not found' });
	if (e.status !== 'completed') return res.status(400).json({ error: 'proofs allowed only after completion' });
	const files = (req.files || []).map(f => ({ name: f.originalname, url: `/uploads/${id}/${path.basename(f.path)}` }));
	e.proofs = [...(e.proofs || []), ...files];
	upsert('events', e);
	res.json({ uploaded: files.length, files });
});

/* --------------------------------- Start -------------------------------- */
app.listen(PORT, () => {
	console.log(`EMS server running on http://localhost:${PORT}`);
});

