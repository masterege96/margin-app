import seed from '../../data/demo_seed.json';
import { createApi } from './api.js';
import { renderLoading, renderSignIn, renderWorkspaceSetup } from './auth.js';
import { downloadBackup, downloadCsv } from './exports.js';
import { esc } from './format.js';
import { hydrateIcons } from './icons.js';
import { isReconciled } from './margins.js';
import {
  openCostForm,
  openEditCost,
  openJobDetails,
  openJobForm,
  readCostForm,
  readEditCostForm,
  readJobForm,
  updateCostFormFields,
  updateRetryOptions,
} from './modals.js';
import { costsPage } from './pages/costs.js';
import { jobsPage } from './pages/jobs.js';
import { overviewPage } from './pages/overview.js';
import { settingsPage } from './pages/settings.js';
import { hasSample, state } from './state.js';
import { supabase } from './supabase.js';
import { InputError, byId, closeModal, toast } from './ui.js';

const api = createApi(supabase);
const WS_KEY = 'jobmargin.workspace';
const TITLES = { overview: 'Overview', jobs: 'Jobs', costs: 'Cost ledger', settings: 'Workspace & data' };
const PAGES = { overview: overviewPage, jobs: jobsPage, costs: costsPage, settings: settingsPage };
const PILOT_TARGET = 20;

// ---- Shell ------------------------------------------------------------------

function renderShell() {
  byId('root').innerHTML = `<div class="app-shell">
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="brand"><div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div><div><div class="brand-name">jobmargin<span class="brand-dot">.</span></div><div class="brand-sub">AI UNIT ECONOMICS</div></div></div>
      <div class="workspace-box"><div class="workspace-avatar">${esc((state.workspace.name || 'J').charAt(0).toUpperCase())}</div><div class="workspace-description"><b>${esc(state.workspace.name)}</b><small>${esc(state.user.email)}</small></div></div>
      <div class="nav-caption">WORKSPACE</div>
      <nav class="side-nav">
        <button type="button" data-nav="overview" class="nav-item"><span class="nav-icon" data-i="layout-dashboard"></span> Overview</button>
        <button type="button" data-nav="jobs" class="nav-item"><span class="nav-icon" data-i="layers"></span> Jobs <span class="nav-count" id="navJobCount">0</span></button>
        <button type="button" data-nav="costs" class="nav-item"><span class="nav-icon" data-i="receipt"></span> Cost ledger</button>
      </nav>
      <div class="nav-caption secondary-caption">MANAGE</div>
      <nav class="side-nav"><button type="button" data-nav="settings" class="nav-item"><span class="nav-icon" data-i="settings"></span> Workspace & data</button></nav>
      <div class="side-bottom">
        <div class="pilot-card"><div class="pilot-heading"><span class="small-spark">✦</span> PILOT READINESS</div><div class="pilot-figure"><b id="pilotCount">0</b><span>/ ${PILOT_TARGET} reconciled jobs</span></div><div class="pilot-progress"><div id="pilotBar"></div></div><p>Completed real jobs with no open estimates.</p></div>
        <div class="side-footer"><span class="connection-dot"></span><span>Supabase · EU</span><button type="button" class="signout" data-action="sign-out" title="Sign out"><span data-i="log-out"></span></button></div>
      </div>
    </aside>
    <div class="main-col">
      <header class="topbar">
        <div class="topbar-left"><button type="button" class="mobile-menu icon-button" data-action="toggle-menu" aria-label="Open navigation"><span data-i="menu"></span></button><span class="crumb-root">Workspace</span><span class="crumb-sep">/</span><span id="crumbHere">Overview</span></div>
        <div class="topbar-right"><span class="sample-label" id="dataBadge"></span><button class="button button-ghost compact" type="button" data-action="export-jobs"><span data-i="download"></span><span class="hide-mobile">Export CSV</span></button><button class="button button-dark compact" type="button" data-action="new-job"><span data-i="plus"></span> New job</button></div>
      </header>
      <main id="page" class="page-content" aria-live="polite"></main>
    </div>
  </div>`;
  hydrateIcons(byId('root'));
}

export function render() {
  if (!byId('page')) return;
  byId('crumbHere').textContent = TITLES[state.route];
  byId('page').innerHTML = PAGES[state.route]();
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.route));
  byId('navJobCount').textContent = state.jobs.length;
  const reconciled = state.jobs.filter((j) => isReconciled(j, state.costs)).length;
  byId('pilotCount').textContent = Math.min(PILOT_TARGET, reconciled);
  byId('pilotBar').style.width = `${Math.min(100, (100 * reconciled) / PILOT_TARGET)}%`;
  const badge = byId('dataBadge');
  badge.textContent = hasSample() ? 'INCLUDES SAMPLE DATA' : 'LIVE WORKSPACE';
  badge.classList.toggle('actual', !hasSample());
  hydrateIcons(byId('page'));
}

async function refresh() {
  Object.assign(state, await api.loadState(state.workspace.id));
  render();
}

// ---- Session and workspace --------------------------------------------------

export async function startApp(user) {
  state.user = user;
  renderLoading('Opening your workspace…');
  try {
    state.workspaces = await api.listWorkspaces();
  } catch (e) {
    renderSignIn('signin', e.message);
    return;
  }
  if (!state.workspaces.length) {
    renderWorkspaceSetup(user.email);
    return;
  }
  let saved = null;
  try {
    saved = localStorage.getItem(WS_KEY);
  } catch {
    /* storage unavailable: use the first workspace */
  }
  state.workspace = state.workspaces.find((w) => w.id === saved) || state.workspaces[0];
  try {
    localStorage.setItem(WS_KEY, state.workspace.id);
  } catch {
    /* ignore */
  }
  renderShell();
  await refresh();
}

export function stopApp(message = '') {
  Object.assign(state, { user: null, workspaces: [], workspace: null, clients: [], jobs: [], costs: [], route: 'overview' });
  closeModal();
  renderSignIn('signin', message);
}

// ---- Actions ----------------------------------------------------------------

async function handleAction(el) {
  const { action, id } = el.dataset;
  switch (action) {
    case 'toggle-menu':
      byId('sidebar').classList.toggle('open');
      break;
    case 'new-job':
      openJobForm();
      break;
    case 'edit-job':
      openJobForm(id);
      break;
    case 'view-job':
      openJobDetails(id);
      break;
    case 'new-cost':
      openCostForm(id || null);
      break;
    case 'edit-cost':
      openEditCost(id);
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'delete-cost':
      if (!confirm('Delete this cost entry? This changes the reported margin.')) return;
      await api.deleteCost(id);
      closeModal();
      await refresh();
      toast('Cost removed.');
      break;
    case 'delete-job':
      if (!confirm('Delete this job and ALL its cost entries? This cannot be undone.')) return;
      await api.deleteJob(id);
      closeModal();
      await refresh();
      toast('Job removed.');
      break;
    case 'export-jobs':
      downloadCsv('jobs');
      toast('Jobs CSV downloaded.');
      break;
    case 'export-costs':
      downloadCsv('costs');
      toast('Costs CSV downloaded.');
      break;
    case 'export-json':
      downloadBackup();
      toast('JSON backup downloaded.');
      break;
    case 'load-sample': {
      const n = await api.loadSample(state.workspace.id, seed);
      await refresh();
      toast(`${n} sample jobs loaded.`);
      break;
    }
    case 'clear-sample': {
      if (!confirm('Remove all sample jobs and their costs? Your own records stay.')) return;
      const n = await api.clearSample(state.workspace.id);
      await refresh();
      toast(`${n} sample jobs removed.`);
      break;
    }
    case 'sign-out':
      await supabase.auth.signOut();
      break;
  }
}

async function handleSubmit(form) {
  switch (form.id) {
    case 'authForm': {
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      if (!email || password.length < 8) throw new InputError('Enter your email and a password of at least 8 characters.');
      if (form.dataset.mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) renderSignIn('signin', `Check ${email} for a confirmation link, then sign in.`);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      break; // onAuthStateChange opens the app
    }
    case 'workspaceForm': {
      const name = String(new FormData(form).get('name') || '').trim();
      if (!name) throw new InputError('Workspace name is required.');
      const ws = await api.createWorkspace(name);
      try {
        localStorage.setItem(WS_KEY, ws.id);
      } catch {
        /* ignore */
      }
      await startApp(state.user);
      break;
    }
    case 'jobForm': {
      const input = readJobForm(form);
      const editId = form.dataset.editId;
      if (editId) await api.updateJob(state.workspace.id, editId, input);
      else await api.createJob(state.workspace.id, input);
      closeModal();
      await refresh();
      toast(editId ? 'Job updated.' : 'Job created. Add its direct costs next.');
      break;
    }
    case 'costForm':
      await api.createCost(state.workspace.id, readCostForm(form));
      closeModal();
      await refresh();
      toast('Direct cost recorded.');
      break;
    case 'editCostForm':
      await api.updateCost(form.dataset.id, readEditCostForm(form));
      closeModal();
      await refresh();
      toast('Cost saved and totals recalculated.');
      break;
  }
}

async function guarded(fn) {
  if (state.busy) return;
  state.busy = true;
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof InputError)) console.error(e);
    toast(e.message || 'Something went wrong.', true);
  } finally {
    state.busy = false;
  }
}

export function attachListeners() {
  document.addEventListener('click', (ev) => {
    if (ev.target.id === 'modalOverlay') return closeModal();
    const mode = ev.target.closest('[data-auth-mode]');
    if (mode) return renderSignIn(mode.dataset.authMode);
    const nav = ev.target.closest('[data-nav]');
    if (nav) {
      state.route = nav.dataset.nav;
      byId('sidebar')?.classList.remove('open');
      render();
      window.scrollTo({ top: 0 });
      return;
    }
    const el = ev.target.closest('[data-action]');
    if (el) guarded(() => handleAction(el));
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.id === 'periodFilter') (state.period = el.value), render();
    else if (el.id === 'jobStatusFilter') (state.jobFilter = el.value), render();
    else if (el.id === 'jobsSort') (state.sortJobs = el.value), render();
    else if (el.id === 'costTypeFilter') (state.costFilter = el.value), render();
    else if (el.id === 'f-kind' || el.id === 'retryToggle') updateCostFormFields();
    else if (el.id === 'f-job') updateRetryOptions();
    else if (el.id === 'jobDetailStatus') {
      guarded(async () => {
        await api.updateJob(state.workspace.id, el.dataset.id, { status: el.value });
        closeModal();
        await refresh();
        toast('Job status changed.');
      });
    }
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.id !== 'searchInput') return;
    const cursor = ev.target.selectionStart;
    state.searchTerm = ev.target.value;
    render();
    const el = byId('searchInput');
    el?.focus();
    el?.setSelectionRange(cursor, cursor);
  });

  document.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const submit = form.querySelector('[type=submit]');
    if (submit) submit.disabled = true;
    guarded(() => handleSubmit(form)).finally(() => {
      if (submit?.isConnected) submit.disabled = false;
    });
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && byId('modalRoot').innerHTML) closeModal();
  });
}
