// ======================================================
// MOVIEZONE — app.js (adaptado al template "Cypher")
// ======================================================

import { initWakeupNotice } from './js/ui/wakeup.js';
import { getCatalog, searchCatalog } from './js/data/catalogo.js';

const LIMIT = 24;
const PLACEHOLDER = "https://via.placeholder.com/300x450/0a0611/ffffff?text=Sin+portada";

// ---------- Elementos ----------
const homeView = document.getElementById("home-view");
const gridView = document.getElementById("grid-view");
const detailsPanel = document.getElementById("details-panel");
const detailsEmpty = document.getElementById("details-empty");
const detailsContent = document.getElementById("details-content");

const searchInput = document.getElementById("search-input");
const searchForm = document.getElementById("search-form");
const statusBadge = document.getElementById("status-badge");

const resultsGrid = document.getElementById("results-grid");
const resultsTitle = document.getElementById("results-title");
const resultsCount = document.getElementById("results-count");
const resultsLoading = document.getElementById("results-loading");
const resultsEmpty = document.getElementById("results-empty");
const scrollSentinel = document.getElementById("scroll-sentinel");

const heroTitle = document.getElementById("hero-title");
const heroType = document.getElementById("hero-type");
const heroRating = document.getElementById("hero-rating");
const heroYear = document.getElementById("hero-year");
const heroSynopsis = document.getElementById("hero-synopsis");
const heroDots = document.getElementById("hero-dots");
const heroPlayBtn = document.getElementById("hero-play-btn");
const heroInfoBtn = document.getElementById("hero-info-btn");

// ---------- Estado ----------
let seleccionActual = null;
let vistaActual = "home"; // home | grid
let gridModo = "categoria"; // categoria | search | favoritos
let gridSeccion = "movie";
let gridTermino = "";
let gridPage = 1;
let gridCargando = false;
let gridSinMasResultados = false;
let heroItems = [];
let heroIndex = 0;
let heroTimer = null;

// ======================================================
// FAVORITOS (localStorage)
// ======================================================
function obtenerFavoritos() {
    try { return JSON.parse(localStorage.getItem("moviezone_favoritos") || "[]"); }
    catch { return []; }
}
function guardarFavoritos(lista) {
    localStorage.setItem("moviezone_favoritos", JSON.stringify(lista));
}
function esFavorito(link) {
    return obtenerFavoritos().some(f => f.link === link);
}
function toggleFavoritoItem(item) {
    let favoritos = obtenerFavoritos();
    const existe = favoritos.findIndex(f => f.link === item.link);
    if (existe >= 0) {
        favoritos.splice(existe, 1);
    } else {
        favoritos.unshift(item);
    }
    guardarFavoritos(favoritos);
    return existe < 0; // true si quedó agregado
}

// ======================================================
// UTILIDADES
// ======================================================
function escapeHtml(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function tipoLabel(tipo) {
    if (tipo === "Serie") return "Serie";
    if (tipo === "Anime") return "Anime";
    return "Película";
}

function esEmbedInvalido(url) {
    if (!url) return true;
    const u = String(url).toLowerCase();
    return (
        u.includes("lamovie.org/embed") ||
        u.includes("lamovie") ||
        u.includes("sblanh.com/") ||
        u.includes("sblanh") ||
        u.includes("4shared") ||
        u.includes("4shared.com/") ||
        u.includes("play.php")
    );
}

function itemTieneVideo(item) {
    const embedsValidos = Array.isArray(item.embeds)
        ? item.embeds.filter(e => e && e.url && !esEmbedInvalido(e.url))
        : [];
    return (
        (item.reproductor && !esEmbedInvalido(item.reproductor)) ||
        embedsValidos.length > 0 ||
        (Array.isArray(item.episodios) && item.episodios.some(e =>
            (e.video && !esEmbedInvalido(e.video)) ||
            (Array.isArray(e.embeds) && e.embeds.some(em => em && em.url && !esEmbedInvalido(em.url)))
        ))
    );
}

// Mapa de dominios conocidos -> nombre bonito
const SERVIDORES_CONOCIDOS = {
    "goodstream.one": "GoodstreamOne", "goodstream.uno": "GoodstreamOne",
    "vimeos.net": "MovieZone",
    "voe.sx": "Voe",
    "doodstream.com": "Doodstream", "dood.to": "Doodstream", "dood.wf": "Doodstream", "dood.la": "Doodstream",
    "streamtape.com": "Streamtape",
    "streamwish.com": "StreamWish",
    "filemoon.sx": "Filemoon", "filemoon.to": "Filemoon",
    "mixdrop.co": "Mixdrop", "mixdrop.to": "Mixdrop",
    "vidhide.com": "VidHide",
    "vidguard.to": "VidGuard",
    "uqload.com": "Uqload",
    "streamsb.com": "StreamSB",
    "fembed.com": "Fembed",
    "upstream.to": "Upstream",
    "vidmoly.me": "Vidmoly", "vidmoly.to": "Vidmoly",
    "mp4upload.com": "Mp4Upload",
    "mega.nz": "Mega",
    "drive.google.com": "Google Drive",
    "mediafire.com": "Mediafire",
    "pixeldrain.com": "Pixeldrain",
    "1fichier.com": "1Fichier"
};

function detectarServidor(url, serverOriginal) {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
    catch { return serverOriginal || "Servidor"; }

    for (const dominio in SERVIDORES_CONOCIDOS) {
        if (host === dominio || host.endsWith("." + dominio)) return SERVIDORES_CONOCIDOS[dominio];
    }
    const generico = ["online", "server", "servidor", ""].includes((serverOriginal || "").toLowerCase().trim());
    if (serverOriginal && !generico) return serverOriginal;

    const base = host.split(".")[0];
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Servidor";
}

// ======================================================
// NAVEGACIÓN DE VISTAS
// ======================================================
function mostrarHome() {
    vistaActual = "home";
    homeView.classList.remove("hidden");
    gridView.classList.add("hidden");
    document.querySelectorAll(".filter-tab, .filter-chip").forEach(el => el.classList.remove("active"));
    document.getElementById("nav-item-home").classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function mostrarGrid({ modo, seccion = "movie", termino = "" }) {
    vistaActual = "grid";
    gridModo = modo;
    gridSeccion = seccion;
    gridTermino = termino;
    gridPage = 1;
    gridSinMasResultados = false;

    homeView.classList.add("hidden");
    gridView.classList.remove("hidden");

    document.querySelectorAll(".filter-tab").forEach(el => el.classList.remove("active"));
    document.getElementById("nav-item-home").classList.remove("active");
    document.getElementById("nav-item-favoritos")?.classList.toggle("active", modo === "favoritos");

    document.querySelectorAll(".filter-chip").forEach(chip => {
        chip.classList.toggle("active", chip.dataset.type === seccion || (chip.dataset.type === "all" && modo !== "categoria"));
    });

    if (modo === "search") {
        resultsTitle.textContent = `Resultados para "${termino}"`;
        document.getElementById("filter-toolbar").classList.add("hidden");
    } else if (modo === "favoritos") {
        resultsTitle.innerHTML = `<ion-icon name="heart" style="vertical-align:-3px;"></ion-icon> Mis Favoritos`;
        document.getElementById("filter-toolbar").classList.add("hidden");
    } else {
        resultsTitle.textContent = seccion === "movie" ? "Películas" : seccion === "series" ? "Series" : "Anime";
        document.getElementById("filter-toolbar").classList.remove("hidden");
        const navMap = { movie: "nav-item-movies", series: "nav-item-series", anime: "nav-item-anime" };
        document.getElementById(navMap[seccion])?.classList.add("active");
    }

    resultsGrid.innerHTML = "";
    resultsEmpty.classList.add("hidden");
    scrollSentinel.classList.add("hidden");
    cargarPaginaGrid();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ======================================================
// CARGA DE DATOS (conectado a tu server.js real)
// ======================================================
async function fetchSeccion(seccion, page, limit = LIMIT, options = {}) {
    return getCatalog(seccion, page, limit);
}

async function fetchBusqueda(termino) {
    return searchCatalog(termino);
}

async function cargarPaginaGrid() {
    if (gridCargando || gridSinMasResultados) return;
    gridCargando = true;

    const primerLote = gridPage === 1;
    if (primerLote) {
        resultsLoading.classList.remove("hidden");
        resultsEmpty.classList.add("hidden");
    } else {
        scrollSentinel.classList.remove("hidden");
    }

    try {
        let lista = [];

        if (gridModo === "favoritos") {
            lista = obtenerFavoritos();
            gridSinMasResultados = true;
        } else if (gridModo === "search") {
            lista = gridPage === 1 ? await fetchBusqueda(gridTermino) : [];
            gridSinMasResultados = true; // búsqueda no pagina
        } else {
            lista = await fetchSeccion(gridSeccion, gridPage, LIMIT);
            if (lista.length < LIMIT) gridSinMasResultados = true;
        }

        renderGridItems(lista, primerLote);
        resultsCount.textContent = `${resultsGrid.children.length} items`;

        if (primerLote && resultsGrid.children.length === 0) {
            resultsEmpty.classList.remove("hidden");
        }

        gridPage++;
    } catch (err) {
        console.error(err);
        if (primerLote) {
            resultsEmpty.classList.remove("hidden");
            resultsEmpty.querySelector("p").textContent = "No se pudo cargar la sección.";
        }
    } finally {
        resultsLoading.classList.add("hidden");
        scrollSentinel.classList.add("hidden");
        gridCargando = false;
    }
}

// ---------- Infinite scroll ----------
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && vistaActual === "grid" && !gridSinMasResultados) {
            cargarPaginaGrid();
        }
    });
}, { rootMargin: "300px" });
observer.observe(scrollSentinel);

// ======================================================
// RENDER: TARJETAS (media-card)
// ======================================================
function crearMediaCard(item) {
    const card = document.createElement("div");
    card.className = "media-card";

    const portada = item.portada || PLACEHOLDER;
    const nombre = item.nombre || "Sin título";
    const tipo = tipoLabel(item.tipo);
    // Siempre mostrar calificación (0 si no tiene)
    const rating = item.calificacion ? Number(item.calificacion).toFixed(1) : "0";
    const tieneVideo = itemTieneVideo(item);

    card.innerHTML = `
        <div class="poster-wrapper">
            <img class="poster-img" src="${escapeHtml(portada)}" alt="${escapeHtml(nombre)}" loading="lazy">
            <div class="poster-overlay"><ion-icon name="play-circle" class="overlay-icon"></ion-icon></div>
            <div class="rating-badge"><ion-icon name="star"></ion-icon> ${escapeHtml(rating)}</div>
            <span class="type-badge">${escapeHtml(tipo)}</span>
            <span class="availability-badge ${tieneVideo ? "available" : "unavailable"}">
                <span class="dot"></span> Disponible
            </span>
        </div>
        <div class="media-info">
            <h3>${escapeHtml(nombre)}</h3>
            <p>${item.episodios && item.episodios.length ? `${item.episodios.length} episodios` : (item.year || tipo)}</p>
        </div>
    `;

    card.querySelector("img").addEventListener("error", (e) => { e.target.src = PLACEHOLDER; });
    card.addEventListener("click", () => abrirDetalle(item));
    return card;
}

function renderGridItems(lista, limpiar) {
    if (limpiar) resultsGrid.innerHTML = "";
    lista.forEach(item => resultsGrid.appendChild(crearMediaCard(item)));
}

function renderCarousel(contenedorId, lista) {
    const el = document.getElementById(contenedorId);
    el.innerHTML = "";
    if (!lista.length) {
        el.innerHTML = `<p style="color:var(--text-muted);">No hay contenido disponible por ahora.</p>`;
        return;
    }
    lista.forEach(item => {
        const card = crearMediaCard(item);
        card.classList.add("carousel-card");
        el.appendChild(card);
    });
}

// ======================================================
// HERO BANNER
// ======================================================
function pintarHero(item) {
    if (!item) return;
    heroType.textContent = tipoLabel(item.tipo).toUpperCase() + (item.tipo !== "Serie" && item.tipo !== "Anime" ? " RECOMENDADA" : "");
    heroTitle.textContent = item.nombre || "Sin título";
    heroRating.textContent = item.calificacion ? Number(item.calificacion).toFixed(1) : "0";
    heroYear.textContent = item.year || "-";
    heroSynopsis.textContent = item.descripcion || "";
    if (item.backdrop || item.portada) {
        document.getElementById("hero-banner").style.backgroundImage = `url('${item.backdrop || item.portada}')`;
    }
}

function iniciarHero(lista) {
    heroItems = lista.filter(i => i.portada || i.backdrop).slice(0, 6);
    if (!heroItems.length) return;

    heroDots.innerHTML = heroItems.map((_, i) =>
        `<div class="hero-dot${i === 0 ? " active" : ""}" data-i="${i}"></div>`
    ).join("");

    heroDots.querySelectorAll(".hero-dot").forEach(dot => {
        dot.addEventListener("click", () => {
            heroIndex = parseInt(dot.dataset.i);
            pintarHero(heroItems[heroIndex]);
            heroDots.querySelectorAll(".hero-dot").forEach(d => d.classList.remove("active"));
            dot.classList.add("active");
            reiniciarHeroTimer();
        });
    });

    heroIndex = 0;
    pintarHero(heroItems[0]);
    reiniciarHeroTimer();
}

function reiniciarHeroTimer() {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => {
        heroIndex = (heroIndex + 1) % heroItems.length;
        pintarHero(heroItems[heroIndex]);
        heroDots.querySelectorAll(".hero-dot").forEach((d, i) => d.classList.toggle("active", i === heroIndex));
    }, 7000);
}

heroPlayBtn.addEventListener("click", () => {
    if (heroItems[heroIndex]) abrirDetalle(heroItems[heroIndex], true);
});
heroInfoBtn.addEventListener("click", () => {
    if (heroItems[heroIndex]) abrirDetalle(heroItems[heroIndex], false);
});

// ======================================================
// CARGA INICIAL (home)
// ======================================================
async function cargarHome() {
    console.log('🟢 Iniciando cargarHome()');
    try {
        console.log('🟡 Cargando películas, series y anime...');

        const results = await Promise.allSettled([
            fetchSeccion("movie", 1, 12),
            fetchSeccion("series", 1, 12),
            fetchSeccion("anime", 1, 12)
        ]);

        const peliculas = results[0].status === "fulfilled" ? results[0].value : [];
        const series    = results[1].status === "fulfilled" ? results[1].value : [];
        const anime     = results[2].status === "fulfilled" ? results[2].value : [];

        console.log('✅ Datos:', {
            peliculas: peliculas.length,
            series: series.length,
            anime: anime.length
        });
        renderCarousel("carousel-movies", peliculas);
        renderCarousel("carousel-series", series);
        renderCarousel("carousel-anime", anime);

        iniciarHero(peliculas.length ? peliculas : series);

        statusBadge.classList.remove("offline");
        statusBadge.classList.add("online");
        statusBadge.querySelector(".status-text").textContent = "Online";
        console.log('✅ Home cargado');
    } catch (err) {
        console.error('❌ Error en cargarHome:', err);
        statusBadge.classList.remove("online");
        statusBadge.classList.add("offline");
        statusBadge.querySelector(".status-text").textContent = "Offline";
    }
}

// ======================================================
// DETALLE (modal inmersivo)
// ======================================================
const videoContainer = document.getElementById("video-player-container");
const playerIframe = document.getElementById("player-iframe");
const playerTitle = document.getElementById("player-title");

async function abrirDetalle(item, autoPlay = false) {
    seleccionActual = item;

    detailsEmpty.classList.add("hidden");
    detailsContent.classList.remove("hidden");
    detailsPanel.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    // Pintar lo que ya tenemos
    document.getElementById("details-poster").src = item.portada || PLACEHOLDER;
    document.getElementById("details-type").textContent = tipoLabel(item.tipo);
    document.getElementById("details-title").textContent = item.nombre || "Sin título";

    const originalEl = document.getElementById("details-original-title");
    if (item.titulo_original && item.titulo_original !== item.nombre) {
        originalEl.textContent = item.titulo_original;
        originalEl.style.display = "block";
    } else {
        originalEl.style.display = "none";
    }

    document.getElementById("details-year").textContent = item.year || "-";
    document.getElementById("details-rating").textContent = item.calificacion ? Number(item.calificacion).toFixed(1) : "0";
    document.getElementById("details-synopsis").textContent = item.descripcion || "Sin descripción disponible.";

    const generosEl = document.getElementById("details-genres");
    generosEl.innerHTML = "";
    if (item.genero) {
        String(item.genero).split(",").map(g => g.trim()).filter(Boolean).forEach(g => {
            generosEl.innerHTML += `<span class="genre-tag">${escapeHtml(g)}</span>`;
        });
    }
    if (item.idiomas && item.idiomas.length) {
        generosEl.innerHTML += `<span class="genre-tag">${escapeHtml(item.idiomas.join(", "))}</span>`;
    }
    if (item.calidad && item.calidad.length) {
        generosEl.innerHTML += `<span class="genre-tag">${escapeHtml(item.calidad.join(", "))}</span>`;
    }

    actualizarBotonFavorito();

    videoContainer.classList.add("hidden");
    playerIframe.src = "about:blank";

    document.getElementById("servers-section").querySelector("#servers-loading").classList.remove("hidden");
    document.getElementById("servers-container").innerHTML = "";
    document.getElementById("seasons-section").classList.add("hidden");
    document.getElementById("downloads-section").classList.add("hidden");

    // Enriquecer si hace falta (con timeout de 15s)
    const necesitaEnriquecer =
        !item.embeds || item.embeds.length === 0 ||
        (Array.isArray(item.embeds) && item.embeds.every(e => esEmbedInvalido(e.url))) ||
        ((item.tipo === "Serie" || item.tipo === "Anime") && (!item.episodios || item.episodios.length === 0));

    const yaConfirmadoSinReproductor =
        item.fuente === "hackstore" &&
        item.tipo !== "Serie" && item.tipo !== "Anime" &&
        (!item.embeds || item.embeds.length === 0);

    if (necesitaEnriquecer && !yaConfirmadoSinReproductor && (item.postId || item.link)) {
        try {
            const params = new URLSearchParams();
            if (item.postId) params.set("postId", item.postId);
            if (item.link) params.set("link", item.link);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const res = await fetch(`/api/detalle?${params.toString()}`, { cache: "no-store", signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const completo = await res.json();
                Object.assign(item, completo);
                seleccionActual = item;
            }
        } catch (err) {
            console.error("Error o timeout enriqueciendo detalle:", err);
        }
    }

    document.getElementById("servers-loading").classList.add("hidden");

    const esSerieOAnime = item.tipo === "Serie" || item.tipo === "Anime";
    if (esSerieOAnime && Array.isArray(item.episodios) && item.episodios.length > 0) {
        document.getElementById("seasons-section").classList.remove("hidden");
        renderTemporadas(item);
    } else {
        renderServidoresYDescargas(item.embeds, item.downloads, item.reproductor, item);
        if (autoPlay) reproducir(item.embeds && item.embeds[0] ? item.embeds[0] : { url: item.reproductor }, item);
    }
}

function cerrarDetalle() {
    detailsPanel.classList.add("hidden");
    document.body.style.overflow = "";
    playerIframe.src = "about:blank";
    videoContainer.classList.add("hidden");
}
document.getElementById("btn-close-modal").addEventListener("click", cerrarDetalle);
document.getElementById("modal-backdrop-close").addEventListener("click", cerrarDetalle);
document.getElementById("close-player-btn").addEventListener("click", () => {
    videoContainer.classList.add("hidden");
    playerIframe.src = "about:blank";
});

// ---------- Favoritos ----------
function actualizarBotonFavorito() {
    const btn = document.getElementById("btn-favorito");
    const icon = document.getElementById("btn-favorito-icon");
    if (!seleccionActual) return;
    const activo = esFavorito(seleccionActual.link);
    icon.setAttribute("name", activo ? "heart" : "heart-outline");
    btn.style.color = activo ? "#e50914" : "";
}
document.getElementById("btn-favorito").addEventListener("click", () => {
    if (!seleccionActual) return;
    toggleFavoritoItem(seleccionActual);
    actualizarBotonFavorito();
});

// ---------- Temporadas y episodios ----------
function renderTemporadas(item) {
    const tabsContainer = document.getElementById("seasons-tabs-container");
    const temporadas = item.temporadas && item.temporadas.length ? item.temporadas : [1];

    tabsContainer.innerHTML = temporadas.map((s, i) =>
        `<button class="season-tab${i === 0 ? " active" : ""}" data-season="${s}">Temporada ${s}</button>`
    ).join("");

    tabsContainer.querySelectorAll(".season-tab").forEach(tab => {
        tab.addEventListener("click", async () => {
            tabsContainer.querySelectorAll(".season-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const season = parseInt(tab.dataset.season);
            const episodesContainer = document.getElementById("episodes-container");
            episodesContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
            try {
                const res = await fetch(`/api/episodios?postId=${item.postId}&season=${season}`, { cache: "no-store" });
                const data = await res.json();
                item.episodios = data.episodios || [];
                renderEpisodios(item);
            } catch {
                episodesContainer.innerHTML = `<p style="color:var(--text-muted);">Error cargando episodios.</p>`;
            }
        });
    });

    renderEpisodios(item);
}

function renderEpisodios(item) {
    const episodesContainer = document.getElementById("episodes-container");
    episodesContainer.innerHTML = "";

    if (!item.episodios || item.episodios.length === 0) {
        episodesContainer.innerHTML = `<p style="color:var(--text-muted);">No hay episodios en esta temporada.</p>`;
        return;
    }

    item.episodios.forEach((episodio, index) => {
        const tieneVideo = Boolean(episodio.video) || (Array.isArray(episodio.embeds) && episodio.embeds.length > 0);
        const btn = document.createElement("button");
        btn.className = "episode-btn" + (index === 0 ? " active" : "");
        btn.textContent = index + 1;
        btn.title = episodio.nombre || `Episodio ${index + 1}`;
        if (!tieneVideo) btn.style.opacity = "0.4";

        btn.addEventListener("click", () => {
            episodesContainer.querySelectorAll(".episode-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("details-title").textContent = `${item.nombre} - ${episodio.nombre || "Episodio " + (index + 1)}`;
            renderServidoresYDescargas(episodio.embeds || [], episodio.downloads || [], episodio.video, item);
        });

        episodesContainer.appendChild(btn);
    });
}

// ---------- Servidores y descargas ----------
function reproducir(embed, item) {
    if (!embed || !embed.url) return;
    playerIframe.src = embed.url;
    playerTitle.textContent = item?.nombre || "Reproduciendo...";
    videoContainer.classList.remove("hidden");
    videoContainer.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderServidoresYDescargas(embedsRaw, downloadsRaw, fallbackUrl, item) {
    const serversContainer = document.getElementById("servers-container");
    const downloadsSection = document.getElementById("downloads-section");
    const downloadsContainer = document.getElementById("downloads-list-container");

    serversContainer.innerHTML = "";
    downloadsContainer.innerHTML = "";

    let embeds = [];
    if (Array.isArray(embedsRaw) && embedsRaw.length > 0) {
        embeds = embedsRaw.filter(e => e && e.url && !esEmbedInvalido(e.url));
    } else if (fallbackUrl && !esEmbedInvalido(fallbackUrl)) {
        embeds = [{ url: fallbackUrl, server: "Servidor" }];
    }

    // Vimeo/MovieZone primero
    embeds.sort((a, b) => {
        const aV = /vimeos/i.test(a.url || "") || a.server === "MovieZone";
        const bV = /vimeos/i.test(b.url || "") || b.server === "MovieZone";
        return (bV ? 1 : 0) - (aV ? 1 : 0);
    });

    if (embeds.length > 0) {
        embeds.forEach((embed, index) => {
            const nombre = detectarServidor(embed.url, embed.server || embed.name);
            const lang = embed.lang || embed.idioma || "";
            const quality = embed.quality || embed.calidad || "";

            const row = document.createElement("div");
            row.className = "server-row" + (lang.toLowerCase().includes("latino") ? " latino-highlight" : "");
            row.innerHTML = `
                <div class="server-name-group">
                    <ion-icon name="play-circle-outline" class="server-logo"></ion-icon>
                    <div class="server-info">
                        <span class="server-title">${escapeHtml(nombre)}${lang.toLowerCase().includes("latino") ? '<span class="latino-badge">Latino</span>' : ""}</span>
                        <span class="server-lang">${escapeHtml([lang, quality].filter(Boolean).join(" · "))}</span>
                    </div>
                </div>
                <div class="server-actions">
                    <button class="btn-action play" data-index="${index}">
                        <ion-icon name="play"></ion-icon> Reproducir
                    </button>
                </div>
            `;
            row.querySelector(".btn-action.play").addEventListener("click", () => reproducir(embed, item));
            serversContainer.appendChild(row);
        });
    } else {
        serversContainer.innerHTML = `<div style="color:var(--text-muted); padding:20px 0; text-align:center;">Este contenido todavía no está disponible</div>`;
    }

    const downloads = Array.isArray(downloadsRaw) ? downloadsRaw : [];
    if (downloads.length > 0) {
        downloadsSection.classList.remove("hidden");
        downloads.forEach(dl => {
            const url = dl.url || dl.link || (typeof dl === "string" ? dl : null);
            if (!url || typeof url !== "string") return;

            const nombre = detectarServidor(url, dl.server || dl.name || dl.host);
            const lang = dl.lang || dl.idioma || "";
            const quality = dl.quality || dl.calidad || "";
            const size = dl.size ? ` (${dl.size})` : "";

            const row = document.createElement("div");
            row.className = "server-row";
            row.innerHTML = `
                <div class="server-name-group">
                    <ion-icon name="cloud-download-outline" class="server-logo"></ion-icon>
                    <div class="server-info">
                        <span class="server-title">${escapeHtml(nombre)}</span>
                        <span class="server-lang">${escapeHtml([lang, quality].filter(Boolean).join(" · "))}${escapeHtml(size)}</span>
                    </div>
                </div>
                <div class="server-actions">
                    <a class="btn-action download" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                        <ion-icon name="download"></ion-icon> Descargar
                    </a>
                </div>
            `;
            downloadsContainer.appendChild(row);
        });
    } else {
        downloadsSection.classList.add("hidden");
    }
}

// ======================================================
// BÚSQUEDA (solo con Enter)
// ======================================================
searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = searchInput.value.trim();
    if (texto) {
        mostrarGrid({ modo: "search", termino: texto });
    }
});

// ======================================================
// NAVEGACIÓN (nav-links, filter-tabs, filter-chips)
// ======================================================
document.getElementById("nav-link-home").addEventListener("click", (e) => {
    e.preventDefault();
    mostrarHome();
});

document.getElementById("nav-link-favoritos").addEventListener("click", (e) => {
    e.preventDefault();
    mostrarGrid({ modo: "favoritos" });
});

document.querySelectorAll(".filter-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
        e.preventDefault();
        mostrarGrid({ modo: "categoria", seccion: tab.dataset.type });
    });
});

document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        const tipo = chip.dataset.type;
        if (tipo === "all") {
            mostrarGrid({ modo: "categoria", seccion: "movie" });
        } else {
            mostrarGrid({ modo: "categoria", seccion: tipo });
        }
    });
});

// Efecto de navbar al hacer scroll
window.addEventListener("scroll", () => {
    document.getElementById("netflix-navbar").classList.toggle("scrolled", window.scrollY > 20);
});

// ======================================================
// INICIO
// ======================================================
initWakeupNotice();
cargarHome();
