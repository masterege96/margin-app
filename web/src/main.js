import './styles.css';
import { attachListeners, startApp, stopApp } from './app.js';
import { renderLoading } from './auth.js';
import { state } from './state.js';
import { supabase } from './supabase.js';

attachListeners();
renderLoading();

const {
  data: { session },
} = await supabase.auth.getSession();
if (session) await startApp(session.user);
else stopApp();

supabase.auth.onAuthStateChange((event, next) => {
  // Defer: Supabase advises against awaiting other calls inside this callback.
  setTimeout(() => {
    if (event === 'SIGNED_OUT') stopApp();
    else if (event === 'SIGNED_IN' && next && next.user.id !== state.user?.id) startApp(next.user);
  }, 0);
});
