import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

type Status = 'loading' | 'ready' | 'update' | 'error' | 'unsupported';

async function hasCachedShell() {
  const base = new URL(import.meta.env.BASE_URL, location.origin);
  const required = ['index.html', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];
  const linked = document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
    'script[type=module][src], link[rel=stylesheet], link[rel=modulepreload]',
  );
  const urls = [...required.map(path => new URL(path, base).href),
    ...Array.from(linked, node => 'src' in node ? node.src : node.href)];
  const cacheNames = (await caches.keys()).filter(name => name.startsWith('workbox-precache-') && name.endsWith(base.href));
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const found = await Promise.all(urls.map(url => cache.match(url, { ignoreSearch: true })));
    if (found.every(Boolean)) return true;
  }
  return false;
}

export function useOffline() {
  const [status, setStatus] = useState<Status>('loading');
  const [applyUpdate, setApplyUpdate] = useState<() => Promise<void>>(() => async () => {});
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !('caches' in window)) {
      setStatus('unsupported');
      return;
    }
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const report = (next: Status) => { if (active) setStatus(next); };
    async function verify() {
      try {
        const next = await hasCachedShell() ? 'ready' : 'error';
        if (active) setStatus(current => current === 'update' ? current : next);
      } catch { report('error'); }
    }
    function onStateChange() {
      if (installing?.state === 'redundant') report('error');
    }
    function watchInstall() {
      installing?.removeEventListener('statechange', onStateChange);
      installing = registration?.installing ?? null;
      installing?.addEventListener('statechange', onStateChange);
    }
    const timeout = window.setTimeout(() => {
      if (active) setStatus(current => current === 'loading' ? 'error' : current);
    }, 30_000);
    const apply = registerSW({
      immediate: true,
      onOfflineReady: () => void verify(),
      onNeedRefresh: () => report('update'),
      onRegisterError: () => report('error'),
      onRegisteredSW: (_, registered) => {
        if (!active || !registered) return;
        registration = registered;
        registration.addEventListener('updatefound', watchInstall);
        watchInstall();
        if (registration.active?.state === 'activated') void verify();
        if (registration.waiting) report('update');
      },
    });
    setApplyUpdate(() => async () => {
      try { await apply(true); }
      catch { report('error'); }
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      registration?.removeEventListener('updatefound', watchInstall);
      installing?.removeEventListener('statechange', onStateChange);
    };
  }, []);
  return { status, applyUpdate };
}
