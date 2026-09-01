/* Mundo Kids — PWA público
 * Mantém somente conteúdo público em cache.
 * ADM, autenticação e APIs Supabase nunca são armazenados.
 */
'use strict';

const VERSION='mundo-kids-pwa-v1.0.0';
const STATIC_CACHE=VERSION+'-static';
const PAGE_CACHE=VERSION+'-pages';
const OFFLINE='./offline.html';

const SHELL=[
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './assets/img/mascot-robot.svg',
  './assets/img/hero-tech.webp',
  './assets/img/banner-novidades.webp',
  './assets/img/banner-stem.webp'
];

const sensitive=url =>
  /\/(?:admin|admin-login)\.html(?:$|[?#])/i.test(url.pathname) ||
  url.hostname.endsWith('.supabase.co');

const cacheable=response => {
  if(!response || !response.ok || response.type==='opaque') return false;
  const cc=(response.headers.get('cache-control')||'').toLowerCase();
  return !cc.includes('no-store') && !cc.includes('private');
};

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(STATIC_CACHE);
    for(const url of SHELL){
      try{
        const response=await fetch(new Request(url,{cache:'reload',credentials:'same-origin'}));
        if(cacheable(response)) await cache.put(url,response.clone());
      }catch{}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    if(self.registration.navigationPreload){
      try{await self.registration.navigationPreload.enable()}catch{}
    }
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('mundo-kids-pwa-')&&!k.startsWith(VERSION)).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;

  const url=new URL(request.url);
  if(url.origin!==self.location.origin || sensitive(url)) return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const cached=await caches.match(request,{ignoreSearch:true});
      const refresh=(async()=>{
        try{
          const preload=await event.preloadResponse;
          const fresh=preload||await fetch(new Request(request,{cache:'no-cache'}));
          if(cacheable(fresh)){
            const cache=await caches.open(PAGE_CACHE);
            await cache.put(request,fresh.clone());
          }
          return fresh;
        }catch{return null}
      })();
      event.waitUntil(refresh.then(()=>undefined));
      if(cached) return cached;
      return (await refresh)||(await caches.match(OFFLINE));
    })());
    return;
  }

  if(!['style','script','image','font','manifest'].includes(request.destination)) return;

  event.respondWith((async()=>{
    const cached=await caches.match(request,{ignoreSearch:true});
    const refresh=fetch(request).then(async response=>{
      if(cacheable(response)){
        const cache=await caches.open(STATIC_CACHE);
        await cache.put(request,response.clone());
      }
      return response;
    }).catch(()=>null);
    return cached||(await refresh)||Response.error();
  })());
});
