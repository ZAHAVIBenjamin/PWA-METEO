// importScripts("https://cdn.jsdelivr.net/npm/idb@7/build/umd.js");

const STATIC_CACHE_NAME = "appshell-v4";
const DYNAMIC_CACHE_NAME = "dynamic-v4";
const ASSETS_TO_CACHE = [
  "/", // La racine (très important !)
  "/index.html", // Le fichier HTML
  "/css/style.css", // Le style
  "/js/app.js", // Le script principal
  "/image/pngimg512x512.png",
  "https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap",
  "/offline.html",
];

self.addEventListener("install", (event) => {
  console.log("[SW] Installation et mise en cache de l'App Shell");
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Mise en cache des fichiers...");
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((error) => {
        console.error("[SW] Echec du pre-caching :", error);
      }),
    // ATTENTION : Pour ce TP, nous ne mettons PAS de self.skipWaiting() ici !
    // Nous voulons observer le comportement d'attente ("waiting") par défaut du navigateur.
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. ISOLER L'API : Si la requête va vers Open-Meteo, on ne fait rien de spécial
  if (url.hostname === "api.open-meteo.com") {
    event.respondWith(
      fetch(event.request), // On laisse passer la requête normalement
    );
    return;
  }
  // B. Images : Stale-While-Revalidate — détaillé à l'étape 1 bis
  else if (event.request.destination === "image") {
    // Stale-while-revalidate : réponse cache tout de suite, mise à jour en arrière-plan
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchAndCache = fetch(event.request, { mode: "no-cors" }).then(
          (networkResponse) => {
            const copy = networkResponse.clone();
            return caches
              .open(DYNAMIC_CACHE_NAME)
              .then((cache) => cache.put(event.request, copy))
              .then(() => networkResponse);
          },
        );
        if (cachedResponse) {
          console.log("[SW] Image SWR — cache (stale), revalidate en fond");
          return cachedResponse;
        }
        return fetchAndCache.catch(() => {
          console.log("[SW] Image — pas de cache, réseau indisponible");
          // (Optionnel) retourner une image placeholder
        });
      }),
    );
  }
  // C. Stratégie CACHE FIRST (App Shell & Assets) - Code du TP3 + fallback
  else {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        // Si pas dans le cache, on tente le réseau
        return fetch(event.request).catch((error) => {
          // Si le réseau échoue (Offline)
          // On vérifie si la requête demandait une page HTML
          if (event.request.mode === "navigate") {
            return caches.match("/offline.html");
          }
          // (Optionnel) Ici on pourrait retourner une image placeholder par défaut
          // si c'était une image qui échouait.
        });
      }),
    );
  }
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activation et nettoyage...");
  const cacheWhitelist = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME];
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              console.log("[SW] Suppression du vieux cache :", cacheName);
              return caches.delete(cacheName);
            }
          }),
        );
      })
      // Prise de contrôle après nettoyage (évite une race condition avec d’anciennes réponses)
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-contact") {
    console.log("[SW] Événement de synchronisation en arrière-plan reçu !");
    event.waitUntil(sendPendingMessages());
  }
});
async function sendPendingMessages() {
  // 1. Ouvrir IndexedDB depuis le Service Worker
  const db = await idb.openDB("pwa-news-db", 1);
  // 2. Récupérer le brouillon en attente
  const draft = await db.get("drafts", "pending-sync");
  if (!draft) return; // Rien à envoyer
  try {
    // 3. Simuler l'envoi au serveur (remplacer par un vrai fetch en prod)
    console.log("Envoi au serveur du message :", draft);
    // await fetch('/api/contact', { method: 'POST', body: draft });
    // 4. Si l'envoi réussit, on supprime l'entrée locale pour ne pas la renvoyer en boucle
    await db.delete("drafts", "pending-sync");
    // 5. Notification de succès pour informer l'utilisateur
    return self.registration.showNotification("Message envoyé", {
      body: "Le réseau est de retour, votre message a bien été expédié !",
      icon: "/image/pngimg1920x1080.png",
    });
  } catch (error) {
    console.error("Échec de l'envoi :", error);
    // Important : Relancer l'erreur indique au navigateur que la synchro a échoué
    // Il réessaiera automatiquement plus tard !
    throw error;
  }
}
