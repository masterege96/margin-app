import { esc } from './format.js';
import { byId } from './ui.js';

const brand = `<div class="auth-brand"><div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div><div><div class="brand-name">jobmargin<span class="brand-dot">.</span></div><div class="brand-sub">AI UNIT ECONOMICS</div></div></div>`;

function shell(inner) {
  byId('root').innerHTML = `<div class="auth-page"><div class="auth-card">${brand}${inner}</div></div>`;
}

export function renderSignIn(mode = 'signin', message = '') {
  const signup = mode === 'signup';
  shell(`<h1 class="auth-title">${signup ? 'Create your account' : 'Sign in'}</h1>
  <p class="auth-sub">${signup ? 'Start a workspace for your agency.' : 'Track what every client job actually earns.'}</p>
  ${message ? `<div class="auth-message">${esc(message)}</div>` : ''}
  <form id="authForm" data-mode="${mode}" novalidate>
    <div class="form-field"><label for="a-email">Work email</label><input id="a-email" name="email" type="email" autocomplete="email" required></div>
    <div class="form-field"><label for="a-password">Password</label><input id="a-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required></div>
    <button class="button button-accent auth-submit" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
  </form>
  <p class="auth-switch">${signup ? 'Already have an account?' : 'New to JobMargin?'} <button type="button" class="text-action inline" data-auth-mode="${signup ? 'signin' : 'signup'}">${signup ? 'Sign in' : 'Create an account'}</button></p>`);
  byId('a-email').focus();
}

export function renderWorkspaceSetup(email) {
  shell(`<h1 class="auth-title">Name your workspace</h1>
  <p class="auth-sub">Usually your agency's name. You'll be its owner and can invite teammates later.</p>
  <form id="workspaceForm" novalidate>
    <div class="form-field"><label for="w-name">Workspace name</label><input id="w-name" name="name" maxlength="120" placeholder="e.g. Northwind AI Studio" required></div>
    <button class="button button-accent auth-submit" type="submit">Create workspace</button>
  </form>
  <p class="auth-switch">Signed in as ${esc(email)} · <button type="button" class="text-action inline" data-action="sign-out">Sign out</button></p>`);
  byId('w-name').focus();
}

export function renderLoading(text = 'Loading…') {
  byId('root').innerHTML = `<div class="auth-page"><div class="auth-loading">${esc(text)}</div></div>`;
}
