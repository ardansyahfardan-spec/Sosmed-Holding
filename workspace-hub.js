(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const client = () => window.__ghoustorySupabaseClient || null;
  let currentUser = null;
  let activeTab = 'ideas';
  let cachedIdeas = [];
  let cachedTasks = [];
  let cachedActivity = [];
  let cachedProfiles = [];
  let crewOptionsLoaded = false;
  let aiUsageSummary = null;
  let aiUsageLoaded = false;
  let isWorkspaceAdmin = false;
  let workspaceLoading = false;
  let lastWorkspaceLoadAt = 0;

  function status(message, error = false) {
    const el = $('workspace-status');
    if (!el) return;
    el.textContent = message;
    el.className = 'text-xs mt-3 ' + (error ? 'text-red-300' : 'text-emerald-300');
  }
  function dateLabel(value) {
    if (!value) return 'Tanpa tenggat';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Tanpa tenggat' : d.toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'});
  }
  function setTab(tab) {
    activeTab = tab;
    document.querySelectorAll('[data-workspace-tab]').forEach(el => {
      const on = el.dataset.workspaceTab === tab;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    });
    ['ideas','tasks','monitor'].forEach(key => {
      const panel = $('workspace-panel-' + key);
      if (panel) panel.classList.toggle('hidden', key !== tab);
    });
    if (tab === 'tasks') loadCrewOptions();
    if (tab === 'monitor') { renderMonitor(); loadAiUsage(); }
  }
  function renderIdeas() {
    const root = $('workspace-ideas-list');
    if (!root) return;
    if (!cachedIdeas.length) {
      root.innerHTML = '<p class="workspace-empty">Belum ada ide. Jadilah Crew pertama yang mengirimkan gagasan.</p>';
      return;
    }
    root.innerHTML = cachedIdeas.map(item => `
      <article class="workspace-item">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0"><h3>${esc(item.title)}</h3><p>${esc(item.description || 'Tanpa deskripsi')}</p></div>
          <span class="workspace-pill">${esc(({new:'Baru',reviewing:'Ditinjau',accepted:'Diterima',rejected:'Ditolak',implemented:'Direalisasikan'})[item.status] || item.status)}</span>
        </div>
        <div class="workspace-meta"><span>${esc(item.category)}</span><span>${dateLabel(item.created_at)}</span></div>
        ${isWorkspaceAdmin ? '<label class="workspace-admin-status">Status ide <select data-idea-status="' + esc(item.id) + '" class="workspace-input"><option value="new" ' + (item.status === 'new' ? 'selected' : '') + '>Baru</option><option value="reviewing" ' + (item.status === 'reviewing' ? 'selected' : '') + '>Ditinjau</option><option value="accepted" ' + (item.status === 'accepted' ? 'selected' : '') + '>Diterima</option><option value="rejected" ' + (item.status === 'rejected' ? 'selected' : '') + '>Ditolak</option><option value="implemented" ' + (item.status === 'implemented' ? 'selected' : '') + '>Direalisasikan</option></select></label>' : ''}
      </article>`).join('');
  }
  function renderTasks() {
    const root = $('workspace-tasks-list');
    if (!root) return;
    if (!cachedTasks.length) {
      root.innerHTML = '<p class="workspace-empty">Belum ada tugas. Tambahkan tugas pertama untuk Crew.</p>';
      return;
    }
    root.innerHTML = cachedTasks.map(item => `
      <article class="workspace-item">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0"><h3>${esc(item.title)}</h3><p>${esc(item.description || 'Tanpa deskripsi')}</p></div>
          <span class="workspace-pill">${esc(({todo:'Belum dikerjakan',in_progress:'Sedang dikerjakan',done:'Selesai',cancelled:'Dibatalkan'})[item.status] || item.status)}</span>
        </div>
        <div class="workspace-meta"><span>Proyek: ${esc(item.project_name || 'Umum')}</span><span>Prioritas: ${esc(item.priority)}</span><span>${dateLabel(item.due_at)}</span></div>
        <div class="workspace-meta"><span>Penanggung jawab: ${esc(cachedProfiles.find(profile => profile.user_id === item.assigned_to)?.nickname || (item.assigned_to ? 'Crew' : 'Belum ditugaskan'))}</span></div>
        ${item.status !== 'done' && item.status !== 'cancelled' && currentUser && (currentUser.id === item.created_by || currentUser.id === item.assigned_to || isWorkspaceAdmin) ? '<button class="workspace-action" data-complete-task="' + esc(item.id) + '">Tandai selesai</button>' : ''}
      </article>`).join('');
  }
  function renderMonitor() {
    const aiPending = aiUsageSummary === null;
    const aiRestricted = aiUsageSummary === 'Admin saja' || aiUsageSummary === 'Belum aktif' || aiUsageSummary === 'Gagal dimuat';
    const aiRequests = aiPending ? 'Buka tab untuk memuat' : aiRestricted ? aiUsageSummary : Number(aiUsageSummary.requests || 0);
    const aiTokens = aiPending ? 'Buka tab untuk memuat' : aiRestricted ? aiUsageSummary : (Number(aiUsageSummary.inputTokens || 0).toLocaleString('id-ID') + ' masuk / ' + Number(aiUsageSummary.outputTokens || 0).toLocaleString('id-ID') + ' keluar');
    const values = [
      ['Ide Crew', cachedIdeas.length],
      ['Tugas', cachedTasks.length],
      ['Aktivitas tercatat', cachedActivity.length],
      ['Permintaan AI · 30 hari', aiRequests],
      ['Token AI · 30 hari', aiTokens]
    ];
    const root = $('workspace-monitor-grid');
    if (root) root.innerHTML = values.map(([label,value]) => `<div class="workspace-stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
    const activity = $('workspace-activity-list');
    if (activity) activity.innerHTML = cachedActivity.length ? cachedActivity.map(a => `<div class="workspace-activity-row"><b>${esc(a.action)} · ${esc(a.entity_type)}</b><span>${dateLabel(a.created_at)}</span></div>`).join('') : '<p class="workspace-empty">Belum ada aktivitas.</p>';
    const note = $('workspace-monitor-note');
    if (note) note.textContent = 'Ringkasan Workspace bukan batas kuota Supabase. Ringkasan AI 30 hari diperiksa sekali saat Workspace dibuka untuk mengenali akses admin; hanya admin yang menerima angka token. Tidak ada polling otomatis.';
  }
  async function loadAiUsage() {
    if (aiUsageLoaded) return;
    aiUsageLoaded = true;
    const db = client();
    if (!db) return;
    try {
      const { data, error } = await db.rpc('ghoustory_workspace_ai_usage_count');
      isWorkspaceAdmin = !error && data !== null;
      if (error) aiUsageLoaded = false;
      aiUsageSummary = error
        ? (error.message.includes('Could not find the function') ? 'Belum aktif' : 'Gagal dimuat')
        : (data === null ? 'Admin saja' : {
            requests: Number(data.requests || 0),
            inputTokens: Number(data.inputTokens || 0),
            outputTokens: Number(data.outputTokens || 0)
          });
      renderIdeas();
      renderTasks();
    } catch {
      aiUsageSummary = 'Gagal dimuat';
      aiUsageLoaded = false;
    }
    renderMonitor();
  }
  async function loadCrewOptions() {
    if (crewOptionsLoaded) return;
    const db = client();
    const select = $('workspace-task-assignee');
    if (!db || !select) return;
    crewOptionsLoaded = true;
    try {
      const { data, error } = await db.from('ghoustory_profiles')
        .select('user_id,nickname,role')
        .order('nickname', {ascending:true})
        .limit(100);
      if (error) {
        crewOptionsLoaded = false;
        status('Daftar Crew belum dapat dimuat; tugas tetap bisa dibuat tanpa penanggung jawab.', true);
        return;
      }
      cachedProfiles = data || [];
      select.innerHTML = '<option value="">Belum ditugaskan</option>' + cachedProfiles.map(profile =>
        '<option value="' + esc(profile.user_id) + '">' + esc(profile.nickname || 'Crew') + (profile.role ? ' · ' + esc(profile.role) : '') + '</option>'
      ).join('');
      renderTasks();
    } catch {
      crewOptionsLoaded = false;
      status('Daftar Crew gagal dimuat. Tugas tetap bisa dibuat tanpa penanggung jawab.', true);
    }
  }
  async function loadWorkspace(force = false) {
    if (workspaceLoading) return;
    const now = Date.now();
    if (!force && now - lastWorkspaceLoadAt < 2000) return;
    workspaceLoading = true;
    lastWorkspaceLoadAt = now;
    try {
    const db = client();
    if (!db) { status('Koneksi database belum siap. Muat ulang setelah login.', true); return; }
    status('Memuat data Workspace…');
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth?.user) { status('Silakan login terlebih dahulu.', true); return; }
    currentUser = auth.user;
    const [ideas, tasks, activity] = await Promise.all([
      db.from('ghoustory_workspace_ideas').select('id,title,description,category,status,created_by,created_at').order('created_at',{ascending:false}).limit(40),
      db.from('ghoustory_workspace_tasks').select('id,title,description,status,priority,project_name,due_at,assigned_to,created_by,created_at').order('created_at',{ascending:false}).limit(40),
      db.from('ghoustory_workspace_activity').select('id,entity_type,action,created_at').order('created_at',{ascending:false}).limit(20)
    ]);
    if (ideas.error || tasks.error || activity.error) {
      const err = ideas.error || tasks.error || activity.error;
      status((err.message.includes('does not exist') || err.message.includes('Could not find the table')) ? 'Fitur belum aktif: migration Workspace belum diterapkan.' : 'Gagal memuat Workspace: ' + err.message, true);
      return;
    }
    cachedIdeas = ideas.data || [];
    cachedTasks = tasks.data || [];
    cachedActivity = activity.data || [];
    aiUsageSummary = null;
    aiUsageLoaded = false;
    isWorkspaceAdmin = false;
    renderIdeas(); renderTasks(); renderMonitor();
    loadAiUsage();
    status('Workspace tersinkron. Daftar dibatasi 40 item per kategori agar query tetap ringan.');
    } catch (error) {
      status('Workspace gagal dimuat. Periksa koneksi lalu coba lagi.', true);
    } finally {
      workspaceLoading = false;
    }
  }
  async function updateIdeaStatus(id, nextStatus) {
    if (!isWorkspaceAdmin) return status('Akses admin diperlukan untuk mengubah status ide.', true);
    const allowed = ['new','reviewing','accepted','rejected','implemented'];
    if (!allowed.includes(nextStatus)) return;
    const db = client();
    try {
      const { error } = await db.from('ghoustory_workspace_ideas').update({status:nextStatus}).eq('id',id).select('id').single();
      if (error) { renderIdeas(); return status('Status ide gagal diperbarui: ' + error.message, true); }
      cachedIdeas = cachedIdeas.map(item => item.id === id ? {...item,status:nextStatus} : item);
      cachedActivity = [{id:'local-' + Date.now(),entity_type:'idea',action:'updated',created_at:new Date().toISOString()}, ...cachedActivity].slice(0,20);
      renderIdeas(); renderMonitor();
      status('Status ide berhasil diperbarui.');
    } catch {
      renderIdeas();
      status('Status ide gagal diperbarui. Periksa koneksi lalu coba lagi.', true);
    }
  }
  async function submitIdea(event) {
    event.preventDefault();
    const db = client();
    if (!db || !currentUser) return status('Tunggu sampai data Crew selesai dimuat.', true);
    const title = $('workspace-idea-title')?.value.trim() || '';
    const description = $('workspace-idea-description')?.value.trim() || '';
    const category = $('workspace-idea-category')?.value || 'Umum';
    if (title.length < 3) return status('Judul ide minimal 3 karakter.', true);
    const button = $('workspace-idea-submit');
    if (button) button.disabled = true;
    try {
      const { data, error } = await db.from('ghoustory_workspace_ideas')
        .insert({title,description,category,created_by:currentUser.id})
        .select('id,title,description,category,status,created_by,created_at').single();
      if (error) return status('Ide gagal dikirim: ' + error.message, true);
      cachedIdeas = [data, ...cachedIdeas].slice(0, 40);
      cachedActivity = [{id:'local-' + Date.now(),entity_type:'idea',action:'created',created_at:new Date().toISOString()}, ...cachedActivity].slice(0,20);
      renderIdeas(); renderMonitor();
      $('workspace-idea-form')?.reset();
      status('Ide berhasil dikirim ke Crew.');
    } catch (error) {
      status('Ide gagal dikirim. Periksa koneksi lalu coba lagi.', true);
    } finally {
      if (button) button.disabled = false;
    }
  }
  async function submitTask(event) {
    event.preventDefault();
    const db = client();
    if (!db || !currentUser) return status('Tunggu sampai data Crew selesai dimuat.', true);
    const title = $('workspace-task-title')?.value.trim() || '';
    const description = $('workspace-task-description')?.value.trim() || '';
    const priority = $('workspace-task-priority')?.value || 'normal';
    const projectName = ($('workspace-task-project')?.value.trim() || 'Umum').slice(0,80);
    const assignedTo = $('workspace-task-assignee')?.value || null;
    const due = $('workspace-task-due')?.value || '';
    if (title.length < 3) return status('Judul tugas minimal 3 karakter.', true);
    const button = $('workspace-task-submit');
    if (button) button.disabled = true;
    try {
      const { data, error } = await db.from('ghoustory_workspace_tasks')
        .insert({title,description,priority,project_name:projectName,assigned_to:assignedTo,due_at:due ? new Date(due).toISOString() : null,created_by:currentUser.id})
        .select('id,title,description,status,priority,project_name,due_at,assigned_to,created_by,created_at').single();
      if (error) return status('Tugas gagal dibuat: ' + error.message, true);
      cachedTasks = [data, ...cachedTasks].slice(0, 40);
      cachedActivity = [{id:'local-' + Date.now(),entity_type:'task',action:'created',created_at:new Date().toISOString()}, ...cachedActivity].slice(0,20);
      renderTasks(); renderMonitor();
      $('workspace-task-form')?.reset();
      status('Tugas berhasil ditambahkan.');
    } catch (error) {
      status('Tugas gagal dibuat. Periksa koneksi lalu coba lagi.', true);
    } finally {
      if (button) button.disabled = false;
    }
  }
  async function completeTask(id) {
    const db = client();
    const task = cachedTasks.find(x => x.id === id);
    if (!task) return;
    try {
      const { data, error } = await db.rpc('ghoustory_workspace_complete_task', {p_task_id:id});
      if (error) return status('Status tugas tidak dapat diubah: ' + error.message, true);
      if (!data) return status('Hanya pembuat tugas, penanggung jawab, atau admin yang dapat menyelesaikan tugas ini.', true);
      cachedTasks = cachedTasks.map(item => item.id === id ? {...item,status:'done'} : item);
      cachedActivity = [{id:'local-' + Date.now(),entity_type:'task',action:'updated',created_at:new Date().toISOString()}, ...cachedActivity].slice(0,20);
      renderTasks(); renderMonitor();
      status('Tugas ditandai selesai.');
    } catch {
      status('Status tugas gagal diperbarui. Periksa koneksi lalu coba lagi.', true);
    }
  }
  function bind() {
    $('workspace-idea-form')?.addEventListener('submit', submitIdea);
    $('workspace-task-form')?.addEventListener('submit', submitTask);
    document.querySelectorAll('[data-workspace-tab]').forEach(el => el.addEventListener('click', () => setTab(el.dataset.workspaceTab)));
    $('workspace-refresh')?.addEventListener('click', () => loadWorkspace(true));
    $('workspace-ideas-list')?.addEventListener('click', event => {
      const button = event.target.closest('[data-complete-task]');
      if (button) completeTask(button.dataset.completeTask);
    });
    $('workspace-ideas-list')?.addEventListener('change', event => {
      const select = event.target.closest('[data-idea-status]');
      if (select) updateIdeaStatus(select.dataset.ideaStatus, select.value);
    });
    $('workspace-tasks-list')?.addEventListener('click', event => {
      const button = event.target.closest('[data-complete-task]');
      if (button) completeTask(button.dataset.completeTask);
    });
    document.querySelectorAll('[data-workspace-tab]').forEach(el => el.setAttribute('type','button'));
    const page = $('page-workspace');
    if (page) {
      const observer = new MutationObserver(() => {
        if (page.classList.contains('page-active')) loadWorkspace();
      });
      observer.observe(page,{attributes:true,attributeFilter:['class']});
    }
  }
  function addStyles() {
    if ($('workspace-hub-styles')) return;
    const style = document.createElement('style');
    style.id = 'workspace-hub-styles';
    style.textContent = `
      #page-workspace{max-width:920px;padding:8px 4px 30px}
      #page-workspace .workspace-panel{background:#15161b;border:1px solid rgba(233,223,207,.12);border-radius:16px;padding:14px;margin:12px 0}
      #page-workspace .workspace-panel h3{font-size:14px;font-weight:700;color:#eee8dd;margin-bottom:8px}
      #page-workspace .workspace-input{width:100%;background:#0c0d11;border:1px solid #34353d;border-radius:10px;padding:11px 12px;color:#eee8dd;font-size:14px;margin:5px 0}
      #page-workspace .workspace-button{background:#a94d58;color:#fff;border-radius:10px;padding:10px 14px;font-size:12px;font-weight:700}
      #page-workspace .workspace-button:disabled{opacity:.45}
      #page-workspace .workspace-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:14px 0}
      #page-workspace .workspace-tab{background:#17181e;border:1px solid #34353d;border-radius:10px;padding:10px 6px;color:#b9b9bd;font-size:12px}
      #page-workspace .workspace-tab.is-active{background:#30262a;border-color:#a94d58;color:#f2dfd5}
      #page-workspace .workspace-item{background:#101116;border:1px solid #292b33;border-radius:12px;padding:12px;margin:8px 0;min-width:0}
      #page-workspace .workspace-item h3{font-size:13px;font-weight:700;margin:0 0 5px;overflow-wrap:anywhere}
      #page-workspace .workspace-item p{font-size:12px;color:#b9bac2;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
      #page-workspace .workspace-meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;margin-top:9px;font-size:10px;color:#8f929d}
      #page-workspace .workspace-admin-status{display:block;margin-top:10px;font-size:10px;color:#b7a9a4}
      #page-workspace .workspace-admin-status .workspace-input{margin:5px 0 0;padding:8px}
      #page-workspace .workspace-pill{font-size:10px;color:#e6c7b8;background:#382b2d;border-radius:999px;padding:4px 7px;white-space:nowrap}
      #page-workspace .workspace-empty{font-size:12px;color:#858892;text-align:center;padding:18px 8px}
      #page-workspace .workspace-action{font-size:11px;color:#b9d8c0;margin-top:10px;padding:5px 0}
      #page-workspace .workspace-stat{background:#101116;border:1px solid #292b33;border-radius:12px;padding:12px;min-width:0}
      #page-workspace .workspace-stat span{display:block;font-size:10px;color:#999ca6}
      #page-workspace .workspace-stat b{display:block;font-size:20px;color:#eee8dd;margin-top:5px}
      #page-workspace .workspace-activity-row{display:flex;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid #292b33;font-size:11px}
      #page-workspace .workspace-activity-row span{color:#9295a0}
      @media(max-width:520px){#page-workspace .workspace-panel{padding:11px}#page-workspace .workspace-tabs{gap:4px}#page-workspace .workspace-tab{font-size:11px;padding:9px 3px}}
    `;
    document.head.appendChild(style);
  }
  function boot() {
    addStyles();
    bind();
    if (document.querySelector('#page-workspace.page-active')) loadWorkspace();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
  window.GhoustoryWorkspace = { refresh: loadWorkspace, setTab };
})();