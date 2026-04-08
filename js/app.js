let deferredPrompt;
const installBtn = document.getElementById("install-btn");

// 1. Fonction pour vérifier si l'app est DÉJÀ installée
function isAppInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

// 2. Au chargement, si c'est déjà installé, on s'assure que le bouton est caché
if (isAppInstalled()) {
  installBtn.classList.add("hidden");
}

// 3. On n'écoute l'événement que si l'app n'est pas installée
window.addEventListener("beforeinstallprompt", (e) => {
  if (isAppInstalled()) return; // Sécurité supplémentaire

  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove("hidden");
  console.log(`[PWA] Bouton d'installation prêt.`);
});

// 4. Gestion du clic sur le bouton
installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`[PWA] Choix utilisateur : ${outcome}`);

  if (outcome === "accepted") {
    installBtn.classList.add("hidden");
  }
  deferredPrompt = null;
});

// 5. Cacher le bouton immédiatement si l'utilisateur installe l'app
window.addEventListener("appinstalled", () => {
  console.log(`[PWA] Installation réussie !`);
  installBtn.classList.add("hidden");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Cas 1 : une nouvelle version vient d'être détectée pendant cette session
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          // Installé mais pas encore actif → état « waiting »
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            showUpdateNotification(newWorker);
          }
        });
      });
      // Cas 1 bis : vous avez rafraîchi sans cliquer sur « Mettre à jour ».
      // updatefound ne repasse pas : le SW en attente est dans
      reg.waiting;
      if (reg.waiting) {
        showUpdateNotification(reg.waiting);
      }
    });
    // Après skipWaiting, le contrôleur change — une seule inscription ici (pas dans updatefound)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  });
}

function showUpdateNotification(worker) {
  const notif = document.getElementById("update-notification");
  const btn = document.getElementById("reload-btn");

  // On ajoute la classe "show" pour déclencher l'animation CSS
  notif.classList.add("show");

  // { once: true } assure que l'événement n'est déclenché qu'une seule fois
  btn.addEventListener(
    "click",
    () => {
      // 1. Envoyer l'ordre au Service Worker de s'activer
      worker.postMessage({ action: "skipWaiting" });

      // 2. Cacher la notification en retirant la classe
      notif.classList.remove("show");
    },
    { once: true },
  );
}

const contentDiv = document.getElementById("content");

async function pageAccueil() {
  const villes = [
    { lieu: "Lille", latitude: 50.6292, longitude: 3.0573 },
    { lieu: "Paris", latitude: 48.8566, longitude: 2.3522 },
    { lieu: "Marseille", latitude: 43.2965, longitude: 5.3698 },
    { lieu: "Lyon", latitude: 45.764, longitude: 4.8357 },
    { lieu: "Ajaccio", latitude: 41.9272, longitude: 8.7386 },
    { lieu: "Bordeaux", latitude: 44.8378, longitude: -0.5792 },
  ];

  contentDiv.innerHTML = "<p>loading...</p>";

  try {
    // 1. On prépare un tableau de requêtes pour chaque ville
    const requetes = villes.map(async (ville) => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${ville.latitude}&longitude=${ville.longitude}&current_weather=true`;
      const response = await fetch(url);

      if (!response.ok) throw new Error(`Erreur réseau pour ${ville.lieu}`);

      const data = await response.json();

      // On retourne le nom de la ville ET ses données météo
      return {
        nom: ville.lieu,
        meteoActuelle: data.current_weather,
      };
    });

    // 2. On attend que toutes les requêtes soient terminées
    const resultats = await Promise.all(requetes);

    // 3. On génère le HTML dynamiquement pour chaque résultat
    const html = resultats
      .map(
        (resultat) => `
        <div class="card">
          <h3>Météo actuelle : ${resultat.nom}</h3>
          <p>Température : ${resultat.meteoActuelle.temperature} °C</p>
          <p>Vitesse du vent : ${resultat.meteoActuelle.windspeed} km/h</p>
        </div>
    `,
      )
      .join(""); // .join('') permet d'assembler tout le tableau en une seule chaîne de texte HTML

    // 4. On injecte tout le HTML d'un coup dans la div
    contentDiv.innerHTML = html;
  } catch (e) {
    console.error(e);
    contentDiv.innerHTML =
      "<p>Impossible de charger la météo pour les villes.</p>";
  }
}
// Une nouvelle vue statique
function pageAdmin() {
  contentDiv.innerHTML = `
    <h2>ADMINISTRATION</h2>
    <div>
      <p>forcer le rouge</p>
      <p>acces config</p>
      <p>diagnostique</p>
    </div>
  `;
}

const routes = {
  "/": pageAccueil,
  "/ADMINISTRATION": pageAdmin,
};

function navigate(path) {
  // 1. Change l'URL dans la barre d'adresse sans recharger
  window.history.pushState({}, "", path);

  // 2. Appelle la fonction correspondante
  routes[path]();
}

// On rend les fonctions accessibles au HTML
window.navigate = navigate;
window.pageAccueil = pageAccueil;
window.pageAdmin = pageAdmin;

// On lance la page d'accueil au chargement initial
document.addEventListener("DOMContentLoaded", () => {
  pageAccueil();
});
