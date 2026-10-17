'use strict';

var CACHE_NAME = 'jec-admin-pwa-v1';
var APP_URL = new URL('index.html', self.registration.scope);
var STATIC_FILE = /\.(?:css|js|svg|png|ico|webmanifest)$/i;

function cacheResponse(request, response, label){
  return caches.open(CACHE_NAME).then(function(cache){
    return cache.put(request, response.clone()).then(function(){ return response; });
  }).catch(function(error){
    console.warn('[PWA admin] Gagal menyimpan ' + label + ':', error);
    return response;
  });
}

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){ return cache.add(APP_URL); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(key){
        return key.indexOf('jec-admin-pwa-') === 0 && key !== CACHE_NAME;
      }).map(function(key){ return caches.delete(key); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function(response){
        if (response.ok && response.type === 'basic') {
          return cacheResponse(request, response, 'halaman');
        }
        return response;
      }).catch(function(){
        return caches.open(CACHE_NAME).then(function(cache){
          return cache.match(request).then(function(cached){
            return cached || cache.match(APP_URL) || Response.error();
          });
        });
      })
    );
    return;
  }

  if (url.pathname.indexOf(new URL(self.registration.scope).pathname) !== 0 ||
      !STATIC_FILE.test(url.pathname)) return;

  event.respondWith(
    fetch(request).then(function(response){
      if (response.ok && response.type === 'basic') {
        return cacheResponse(request, response, 'aset');
      }
      return response;
    }).catch(function(){
      return caches.open(CACHE_NAME).then(function(cache){
        return cache.match(request).then(function(cached){ return cached || Response.error(); });
      });
    })
  );
});
