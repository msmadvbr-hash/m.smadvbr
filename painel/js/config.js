/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG + HELPERS GLOBAIS — M&SM Advocacia
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const SUPABASE_URL  = 'https://vabvayctriflbanhcfuy.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhYnZheWN0cmlmbGJhbmhjZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjQzODcsImV4cCI6MjA5NTMwMDM4N30.l7j77sVAP2ejulSrT-dgoKOTORyC67LG0fy0IumstM0';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ── DATAS ──────────────────────────────────────────────────────────────── */
function diffDias(dateStr) {
  if (!dateStr) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prazo = new Date(dateStr + 'T00:00:00');
  return Math.ceil((prazo - hoje) / 86400000);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

function fmtBRL(v) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

function setDate() {
  const now = new Date();
  const el = document.getElementById('topbar-date');
  if (el) el.textContent =
    now.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
}

/* ── BADGES / SEMÁFORO ─────────────────────────────────────────────────── */
function semaforo(dias) {
  if (dias === null) return { badge: 'cinza', label: '⚫ —' };
  if (dias < 0)  return { badge: 'vermelho', label: '🔴 VENCIDO' };
  if (dias <= 3) return { badge: 'laranja',  label: '🟠 URGENTE' };
  if (dias <= 7) return { badge: 'amarelo',  label: '🟡 ATENÇÃO' };
  return { badge: 'verde', label: '🟢 OK' };
}

function badgeHtml(dias) {
  const s = semaforo(dias);
  return `<span class="badge badge-${s.badge}">${s.label}</span>`;
}

function statusBadge(s) {
  if (!s) return '<span class="badge badge-cinza">—</span>';
  const low = s.toLowerCase();
  let cls = 'cinza';
  if (low.includes('vencido') || low.includes('urgente') || low.includes('atrasado') || low.includes('indeferido') || low.includes('improcedente')) cls = 'vermelho';
  else if (low.includes('atenção') || low.includes('pendente') || low.includes('exigência')) cls = 'amarelo';
  else if (low.includes('🟢') || low.includes('pago') || low.includes('deferido') || low.includes('êxito') || low.includes('procedente') || low.includes('concluído') || low.includes('implantado')) cls = 'verde';
  else if (low.includes('andamento') || low.includes('aguardando') || low.includes('análise')) cls = 'azul';
  return `<span class="badge badge-${cls}">${s}</span>`;
}

/* ── ESCAPE/HTML ──────────────────────────────────────────────────────── */
function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── TOAST ────────────────────────────────────────────────────────────── */
function toast(msg, err = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.borderLeftColor = err ? '#c0392b' : 'var(--caramelo)';
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3500);
}

/* ── FILTRO DE TABELA ─────────────────────────────────────────────────── */
function filterTable(tbodyId, query) {
  const tbody = document.getElementById(tbodyId);
  const rows = tbody.querySelectorAll('tr[data-search]');
  const q = query.toLowerCase();
  rows.forEach(r => {
    r.style.display = r.dataset.search.toLowerCase().includes(q) ? '' : 'none';
  });
}

/* ── HELPERS DE FORM ──────────────────────────────────────────────────── */
function v(id)  { const el = document.getElementById(id); return el ? (el.value.trim() || null) : null; }
function vd(id) { const el = document.getElementById(id); return (el && el.value) ? el.value : null; }
function vn(id) { const el = document.getElementById(id); return (el && el.value !== '') ? parseFloat(el.value) : null; }
function vi(id) { const el = document.getElementById(id); return (el && el.value !== '') ? parseInt(el.value, 10) : null; }
function set(id, val) { const el = document.getElementById(id); if (el) el.value = val ?? ''; }

/* ── EXPORTAÇÃO ──────────────────────────────────────────────────────── */
window.APP = {
  sb, diffDias, fmtDate, fmtBRL, setDate,
  semaforo, badgeHtml, statusBadge,
  escHtml, toast, filterTable,
  v, vd, vn, vi, set,
};

})();
