// ======================================================
// ELEMENTOS
// ======================================================
const searchInput = document.getElementById("search");

const vistas = {
    home: document.getElementById("view-home"),
    peliculas: document.getElementById("view-peliculas"),
    series: document.getElementById("view-series"),
    anime: document.getElementById("view-anime"),
    search: document.getElementById("view-search"),
    detail: document.getElementById("view-detail"),
    favoritos: document.getElementById("view-favoritos"),
    historial: document.getElementById("view-historial")
};

const contenedores = {
    home: document.getElementById("home-container"),
    peliculas: document.getElementById("peliculas-container"),
    series: document.getElementById("series-container"),
    anime: document.getElementById("anime-container"),
    search: document.getElementById("search-container")
};

// ======================================================
// PAGINACIÓN Y FAVORITOS
// ======================================================
let paginaActual = {
    peliculas: 1,
    series: 1,
    anime: 1
};

const LIMIT = 24;

// Favoritos (localStorage)
function obtenerFavoritos() {
    try {
        return JSON.parse(localStorage.getItem("moviezone_favoritos") || "[]");
    } catch {
        return [];
    }
}

function guardarFavoritos(lista) {
    localStorage.setItem("moviezone_favoritos", JSON.stringify(lista));
}

function esFavorito(link) {
    return obtenerFavoritos().some(f => f.link === link);
}

function toggleFavorito() {
    if (!seleccionActual) return;

    let favoritos = obtenerFavoritos();
    const existe = favoritos.findIndex(f => f.link === seleccionActual.link);

    if (existe >= 0) {
        favoritos.splice(existe, 1);
    } else {
        favoritos.unshift({
            link: seleccionActual.link,
            nombre: seleccionActual.nombre,
            portada: seleccionActual.portada,
            tipo: seleccionActual.tipo,
            year: seleccionActual.year,
            reproductor: seleccionActual.reproductor,
            embeds: seleccionActual.embeds || [],
            episodios: seleccionActual.episodios || [],
            descripcion: seleccionActual.descripcion
        });
    }

    guardarFavoritos(favoritos);
    actualizarBotonFavorito();
}

function actualizarBotonFavorito() {
    const btn = document.getElementById("btn-favorito");
    if (!btn || !seleccionActual) return;

    if (esFavorito(seleccionActual.link)) {
        btn.textContent = "★ Quitar de favoritos";
        btn.classList.add("activo");
    } else {
        btn.textContent = "☆ Agregar a favoritos";
        btn.classList.remove("activo");
    }
}



// ======================================================
// HISTORIAL DE VISTOS
// ======================================================
function obtenerHistorial() {
    try {
        return JSON.parse(localStorage.getItem("moviezone_historial") || "[]");
    } catch {
        return [];
    }
}

function guardarHistorial(lista) {
    localStorage.setItem("moviezone_historial", JSON.stringify(lista));
}

function agregarAlHistorial(item) {
    if (!item || !item.link) return;

    let historial = obtenerHistorial();

    // Quitamos si ya existe para ponerlo al principio
    historial = historial.filter(h => h.link !== item.link);

    historial.unshift({
        link: item.link,
        nombre: item.nombre,
        portada: item.portada,
        tipo: item.tipo,
        year: item.year,
        postId: item.postId || null,
        vistoEn: new Date().toISOString()
    });

    // Guardamos solo los últimos 50
    if (historial.length > 50) {
        historial = historial.slice(0, 50);
    }

    guardarHistorial(historial);
}

function limpiarHistorial() {
    if (confirm("¿Seguro que quieres borrar todo el historial?")) {
        localStorage.removeItem("moviezone_historial");
        cargarHistorial();
    }
}

function cargarHistorial() {
    const historial = obtenerHistorial();
    const contenedor = document.getElementById("historial-container");
    const info = document.getElementById("historial-info");

    if (info) info.textContent = `${historial.length} vistos`;

    if (historial.length === 0) {
        contenedor.innerHTML = `<div class="loading">Todavía no has visto nada.</div>`;
        return;
    }

    mostrarCatalogo(historial, contenedor);
}

const infos = {
    home: document.getElementById("home-info"),
    peliculas: document.getElementById("peliculas-info"),
    series: document.getElementById("series-info"),
    anime: document.getElementById("anime-info"),
    search: document.getElementById("search-info")
};

const nuevasTrack = document.getElementById("nuevas-track");

let seleccionActual = null;
let seccionActual = "peliculas";
let vistaAnterior = "home";
let cargando = false;

// ======================================================
// CAMBIAR VISTA
// ======================================================
function mostrarVista(nombre) {
    Object.values(vistas).forEach(v => v.classList.remove("active"));
    if (vistas[nombre]) {
        vistas[nombre].classList.add("active");
    }

    // Actualizar menú activo
    document.querySelectorAll("nav a").forEach(a => {
        a.classList.toggle("active", a.dataset.vista === nombre);
    });

    // Limpiar búsqueda si no es la vista de search
    if (nombre !== "search") {
        searchInput.value = "";
    }

    vistaAnterior = nombre === "detail" ? vistaAnterior : nombre;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function volverAtras() {
    mostrarVista(vistaAnterior || "home");
}

// ======================================================
// CARGAR SECCIÓN
// ======================================================
async function cargarSeccion(seccion, pagina = 1) {
    if (cargando) return;
    cargando = true;

    seccionActual = seccion;
    paginaActual[seccion] = pagina;

    const contenedor = contenedores[seccion] || contenedores.peliculas;
    const info = infos[seccion] || infos.peliculas;
    const paginacionEl = document.getElementById(`${seccion}-paginacion`);

    contenedor.innerHTML = `<div class="loading">Cargando ${textoSeccion(seccion)}...</div>`;
    if (info) info.textContent = "Cargando...";
    if (paginacionEl) paginacionEl.innerHTML = "";

    try {
        let url = `/api/catalogo?page=${pagina}&limit=${LIMIT}`;
        if (seccion === "series") url = `/api/series?page=${pagina}&limit=${LIMIT}`;
        if (seccion === "anime") url = `/api/animes?page=${pagina}&limit=${LIMIT}`;

        const respuesta = await fetch(url, { cache: "no-store" });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

        const datos = await respuesta.json();
        const lista = datos.resultados || [];

        mostrarCatalogo(lista, contenedor);

        if (info) {
            info.textContent = `Página ${pagina} · ${lista.length} resultados`;
        }

        // Dibujar botones de paginación
        if (paginacionEl) {
            dibujarPaginacion(paginacionEl, seccion, pagina, lista.length);
        }

        // Si es home, también llenamos el slider
        if (seccion === "peliculas" || seccion === "home") {
            llenarSliderNuevas(lista);
            if (seccion === "peliculas") {
                mostrarCatalogo(lista, contenedores.home);
                if (infos.home) infos.home.textContent = `${lista.length} disponibles`;
            }
        }

    } catch (error) {
        console.error(error);
        contenedor.innerHTML = `
            <div class="loading">
                No se pudo cargar la sección.<br><br>
                <small>${escapeHtml(error.message)}</small>
            </div>
        `;
    } finally {
        cargando = false;
    }
}

function dibujarPaginacion(contenedor, seccion, paginaActualNum, cantidadActual) {
    contenedor.innerHTML = "";

    const btnAnterior = document.createElement("button");
    btnAnterior.textContent = "← Anterior";
    btnAnterior.disabled = paginaActualNum <= 1;
    btnAnterior.onclick = () => cargarSeccion(seccion, paginaActualNum - 1);
    contenedor.appendChild(btnAnterior);

    const btnActual = document.createElement("button");
    btnActual.textContent = `Página ${paginaActualNum}`;
    btnActual.classList.add("active");
    btnActual.disabled = true;
    contenedor.appendChild(btnActual);

    const btnSiguiente = document.createElement("button");
    btnSiguiente.textContent = "Siguiente →";
    // Si trajo menos del límite, probablemente no hay más páginas
    btnSiguiente.disabled = cantidadActual < LIMIT;
    btnSiguiente.onclick = () => cargarSeccion(seccion, paginaActualNum + 1);
    contenedor.appendChild(btnSiguiente);
}

function textoSeccion(seccion) {
    if (seccion === "series") return "series";
    if (seccion === "anime") return "anime";
    return "películas";
}



// ======================================================
// SLIDER NOVEDADES 2026
// ======================================================
function llenarSliderNuevas(lista) {
    if (!nuevasTrack) return;

    const nuevas = lista.filter(item => {
        const year = String(item.year || "");
        const nombre = (item.nombre || "").toLowerCase();
        return year === "2026" || nombre.includes("2026");
    });

    if (nuevas.length === 0) {
        nuevasTrack.innerHTML = `<p style="color:#666;padding:20px 0;">No hay novedades 2026 por ahora</p>`;
        return;
    }

    // Duplicamos para el efecto infinito
    const items = [...nuevas, ...nuevas];

    nuevasTrack.innerHTML = items.map(item => {
        const portada = item.portada || "https://via.placeholder.com/140x210/11131a/ffffff?text=Sin+portada";
        return `
            <div class="nueva-card" data-id="${escapeAttribute(item.link || "")}">
                <img src="${escapeAttribute(portada)}" alt="${escapeAttribute(item.nombre || "")}" loading="lazy">
                <p class="nueva-titulo">${escapeHtml(item.nombre || "Sin título")}</p>
            </div>
        `;
    }).join("");

    // Click en las tarjetas del slider
    nuevasTrack.querySelectorAll(".nueva-card").forEach(card => {
        card.addEventListener("click", () => {
            const link = card.dataset.id;
            const item = lista.find(i => i.link === link);
            if (item) seleccionar(item);
        });
    });
}

// ======================================================
// MOSTRAR CATÁLOGO
// ======================================================
function mostrarCatalogo(lista, contenedor) {
    if (!contenedor) return;

    contenedor.innerHTML = "";

    if (!lista.length) {
        contenedor.innerHTML = `<div class="loading">No se encontraron resultados.</div>`;
        return;
    }

    lista.forEach(item => {
        const card = document.createElement("article");
        card.className = "movie";

        const portada = item.portada || "https://via.placeholder.com/300x450/11131a/ffffff?text=Sin+portada";
        const nombre = item.nombre || "Sin título";
        const tipo = item.tipo || "Película";
        
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
                u.includes("hackstore") ||
                u.includes("play.php")
            );
        }


        // Cuando revisas si tiene video disponible:
        const embedsValidos = Array.isArray(item.embeds)
            ? item.embeds.filter(e => e && e.url && !esEmbedInvalido(e.url))
            : [];

        const tieneVideo =
            (item.reproductor && !esEmbedInvalido(item.reproductor)) ||
            embedsValidos.length > 0 ||
            (Array.isArray(item.episodios) && item.episodios.some(e =>
                (e.video && !esEmbedInvalido(e.video)) ||
                (Array.isArray(e.embeds) && e.embeds.some(em => em && em.url && !esEmbedInvalido(em.url)))
            ));

        card.innerHTML = `
            <div class="poster-wrap">
                <img src="${escapeAttribute(portada)}" alt="${escapeAttribute(nombre)}" loading="lazy">
                <span class="type-badge">${escapeHtml(tipo)}</span>
                ${
                    tieneVideo
                    ? `<span class="available"><span class="dot green"></span> Disponible</span>`
                    : `<span class="available pending"><span class="dot red"></span> Disponible</span>`
                }
            </div>
            <div class="movie-info-small">
                <h3>${escapeHtml(nombre)}</h3>
                <span>
                    ${
                        item.episodios && item.episodios.length
                            ? `${item.episodios.length} episodios`
                            : tipo
                    }
                </span>
            </div>
        `;

        const img = card.querySelector("img");
        img.addEventListener("error", () => {
            img.src = "https://via.placeholder.com/300x450/11131a/ffffff?text=Sin+portada";
        });

        card.addEventListener("click", () => seleccionar(item));
        contenedor.appendChild(card);
    });
}

// ======================================================
// SELECCIONAR (abre la vista detalle)
// ======================================================
async function seleccionar(item) {
    seleccionActual = item;
    vistaAnterior = Object.keys(vistas).find(k => vistas[k].classList.contains("active")) || "home";

    // Mostramos la vista de detalle de inmediato con lo que ya tenemos
    document.getElementById("detail-title").textContent = item.nombre || "Sin título";

    const originalEl = document.getElementById("detail-original");
    if (item.titulo_original && item.titulo_original !== item.nombre) {
        originalEl.textContent = item.titulo_original;
        originalEl.style.display = "block";
    } else {
        originalEl.style.display = "none";
    }

    document.getElementById("detail-description").textContent =
        item.descripcion || "Sin descripción disponible.";

    const poster = document.getElementById("detail-poster");
    poster.src = item.portada || "https://via.placeholder.com/300x450/11131a/ffffff?text=Sin+portada";
    poster.onerror = () => {
        poster.src = "https://via.placeholder.com/300x450/11131a/ffffff?text=Sin+portada";
    };

    // Tags
    const tags = document.getElementById("detail-tags");
    tags.innerHTML = "";
    if (item.tipo) agregarTag(item.tipo, tags);
    if (item.year) agregarTag(item.year, tags);
    if (item.genero) {
        String(item.genero).split(",").forEach(g => {
            const clean = g.trim();
            if (clean) agregarTag(clean, tags);
        });
    }
    if (item.soloTrailer) agregarTag("Solo trailer", tags);

    // Meta
    const meta = document.getElementById("detail-meta");
    meta.innerHTML = "";
    if (item.calificacion) {
        meta.innerHTML += `<div class="meta-item"><strong>★</strong> ${escapeHtml(String(item.calificacion))}</div>`;
    }
    if (item.idiomas && item.idiomas.length) {
        meta.innerHTML += `<div class="meta-item"><strong>Idioma:</strong> ${escapeHtml(item.idiomas.join(", "))}</div>`;
    }
    if (item.calidad && item.calidad.length) {
        meta.innerHTML += `<div class="meta-item"><strong>Calidad:</strong> ${escapeHtml(item.calidad.join(", "))}</div>`;
    }

    // Limpiamos player y secciones
    const player = document.getElementById("detail-player");
    const serversSection = document.getElementById("servers-section");
    const serversContainer = document.getElementById("servers-container");
    const downloadsSection = document.getElementById("downloads-section");
    const downloadsContainer = document.getElementById("downloads-container");
    const episodesSection = document.getElementById("episodes-section");
    const episodesContainer = document.getElementById("episodes-container");

    player.src = "about:blank";
    serversContainer.innerHTML = `<div class="loading">Cargando servidores...</div>`;
    serversSection.style.display = "block";
    downloadsSection.style.display = "none";
    episodesSection.style.display = "none";
    downloadsContainer.innerHTML = "";
    episodesContainer.innerHTML = "";

    mostrarVista("detail");
    actualizarBotonFavorito();

    // Guardamos en historial de vistos
    agregarAlHistorial(item);

    // ========== AQUÍ ESTÁ LA CORRECCIÓN ==========
    // Si no tiene embeds o episodios, los pedimos de nuevo al servidor

    const necesitaEnriquecer =
        !item.embeds || item.embeds.length === 0 ||
        (Array.isArray(item.embeds) && item.embeds.every(e => {
            const u = (e.url || "").toLowerCase();
            return u.includes("lamovie") || u.includes("4shared.com") || u.includes("hackstore") || u.includes("play.php") || u.includes("sblanh.com");
        })) ||
        ((item.tipo === "Serie" || item.tipo === "Anime") && (!item.episodios || item.episodios.length === 0));

    if (necesitaEnriquecer && (item.postId || item.link)) {
        try {
            const params = new URLSearchParams();
            if (item.postId) params.set("postId", item.postId);
            if (item.link) params.set("link", item.link);

            const res = await fetch(`/api/detalle?${params.toString()}`, { cache: "no-store" });
            if (res.ok) {
                const completo = await res.json();
                // Actualizamos el item actual con los datos completos
                Object.assign(seleccionActual, completo);
                item = seleccionActual;
            }
        } catch (err) {
            console.error("Error enriqueciendo detalle:", err);
        }
    }

    // Ahora sí renderizamos con los datos (completos o no)
    const esSerieOAnime = item.tipo === "Serie" || item.tipo === "Anime";

    if (esSerieOAnime && Array.isArray(item.episodios) && item.episodios.length > 0) {
        episodesSection.style.display = "block";

        const seasonSelect = document.getElementById("season-select");
        if (seasonSelect) {
            const temporadas = item.temporadas && item.temporadas.length ? item.temporadas : [1];
            seasonSelect.innerHTML = temporadas.map(s =>
                `<option value="${s}">Temporada ${s}</option>`
            ).join("");

            seasonSelect.onchange = async () => {
                const season = parseInt(seasonSelect.value);
                episodesContainer.innerHTML = `<div class="loading">Cargando temporada ${season}...</div>`;
                try {
                    const res = await fetch(`/api/episodios?postId=${item.postId}&season=${season}`, { cache: "no-store" });
                    const data = await res.json();
                    item.episodios = data.episodios || [];
                    renderEpisodios(item);
                } catch (err) {
                    episodesContainer.innerHTML = `<div class="loading">Error cargando episodios</div>`;
                }
            };
        }

        renderEpisodios(item);
    } else {
        renderServidoresYDescargas(item.embeds, item.downloads, item.reproductor, item);
    }
}

////FAVORITOS//////
function cargarFavoritos() {
    const favoritos = obtenerFavoritos();
    const contenedor = document.getElementById("favoritos-container");
    const info = document.getElementById("favoritos-info");

    if (info) info.textContent = `${favoritos.length} guardados`;

    if (favoritos.length === 0) {
        contenedor.innerHTML = `<div class="loading">No tienes favoritos todavía.<br>Marca alguna película o serie con la estrella ★</div>`;
        return;
    }

    mostrarCatalogo(favoritos, contenedor);
}


// ========== RENDER EPISODIOS ==========
function renderEpisodios(item) {
    const episodesContainer = document.getElementById("episodes-container");
    const player = document.getElementById("detail-player");
    episodesContainer.innerHTML = "";

    if (!item.episodios || item.episodios.length === 0) {
        episodesContainer.innerHTML = `<div class="loading">No hay episodios en esta temporada</div>`;
        return;
    }

    item.episodios.forEach((episodio, index) => {
        const boton = document.createElement("button");
        const nombre = episodio.nombre || `Episodio ${index + 1}`;
        const tieneVideo = Boolean(episodio.video) || (Array.isArray(episodio.embeds) && episodio.embeds.length > 0);

        boton.className = tieneVideo ? "episode" : "episode unavailable";
        boton.innerHTML = `
            <strong>${escapeHtml(nombre)}</strong>
            <span>${tieneVideo ? "Disponible" : "Sin reproductor"}</span>
        `;

        boton.addEventListener("click", () => {
            if (!tieneVideo) return;

            document.getElementById("detail-title").textContent = `${item.nombre} - ${nombre}`;

            // Al seleccionar episodio → mostrar todos sus servidores
            renderServidoresYDescargas(
                episodio.embeds || [],
                episodio.downloads || [],
                episodio.video,
                item
            );
        });

        episodesContainer.appendChild(boton);
    });
}

// ========== RENDER SERVIDORES + DESCARGAS ==========
function detectarNombreServidor(url, fallbackName) {
    if (!url) return fallbackName || "Servidor";
    const u = String(url).toLowerCase();

    // Vimeo → MovieZone (como pediste)
    if (u.includes("vimeos.net") || u.includes("player.vimeos")) return "MovieZone";

    const mapa = [
        ["goodstream", "GoodstreamOne"],
        ["streamwish", "StreamWish"],
        ["filemoon", "Filemoon"],
        ["voe", "Voe"],
        ["dood", "Doodstream"],
        ["doodstream", "Doodstream"],
        ["streamtape", "Streamtape"],
        ["mixdrop", "Mixdrop"],
        ["upstream", "Upstream"],
        ["vidmoly", "Vidmoly"],
        ["mp4upload", "Mp4Upload"],
        ["ok.ru", "OK"],
        ["okru", "OK"],
        ["youtube", "YouTube"],
        ["youtu.be", "YouTube"],
        ["mediafire", "Mediafire"],
        ["mega.nz", "Mega"],
        ["mega.co", "Mega"],
        ["drive.google", "Google Drive"],
        ["pixeldrain", "Pixeldrain"],
        ["1fichier", "1Fichier"],
        ["krakenfiles", "Krakenfiles"],
        ["yourupload", "YourUpload"],
        ["uqload", "Uqload"],
        ["vidhide", "Vidhide"],
        ["lulustream", "LuluStream"],
        ["filelions", "FileLions"],
        ["vidguard", "Vidguard"],
        ["netu", "Netu"],
        ["hqq", "Netu"],
        ["waaw", "Netu"],
        ["supervideo", "SuperVideo"],
        ["vipss", "Vipss"],
        ["online", "Online"]
    ];

    for (const [key, name] of mapa) {
        if (u.includes(key)) return name;
    }

    // Si viene un nombre de la API y no es genérico
    if (fallbackName) {
        const n = String(fallbackName).trim();
        if (n && !/^online$/i.test(n) && !/^servidor\s*\d*$/i.test(n)) {
            return n.charAt(0).toUpperCase() + n.slice(1);
        }
    }

    try {
        const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
        if (host) return host.charAt(0).toUpperCase() + host.slice(1);
    } catch {}

    return "Servidor";
}

function formatearLangQuality(lang, quality, itemLangs, itemQualities) {
    // lang puede ser string o array
    let langs = [];
    if (Array.isArray(lang)) langs = lang.filter(Boolean);
    else if (lang) langs = [String(lang)];

    // Si el embed no trae idioma, usar los del item (sin repetir)
    if (langs.length === 0 && Array.isArray(itemLangs) && itemLangs.length) {
        langs = itemLangs.slice(0, 3);
    }

    let quals = [];
    if (Array.isArray(quality)) quals = quality.filter(Boolean);
    else if (quality) quals = [String(quality)];

    if (quals.length === 0 && Array.isArray(itemQualities) && itemQualities.length) {
        quals = [itemQualities[0]];
    }

    const langPart = langs.length ? langs.join(" - ") : "";
    const qualPart = quals.length ? quals.join(" / ") : "";

    if (langPart && qualPart) return `${langPart} | ${qualPart}`;
    if (langPart) return langPart;
    if (qualPart) return qualPart;
    return "";
}

function labelServidor(embed, index, item) {
    const url = embed.url || "";
    const nombre = detectarNombreServidor(url, embed.server || embed.name);
    const extra = formatearLangQuality(
        embed.lang || embed.language || embed.idioma,
        embed.quality || embed.calidad,
        item?.idiomas,
        item?.calidad
    );

// Formato: [GoodstreamOne] Latino - Inglés | HD 720p
    return extra ? `[${nombre}] ${extra}` : `[${nombre}]`;
}

function labelDescarga(dl, index, item) {
    const url = dl.url || dl.link || (typeof dl === "string" ? dl : "");
    const nombre = detectarNombreServidor(url, dl.server || dl.name || dl.host);
    const extra = formatearLangQuality(
        dl.lang || dl.language || dl.idioma,
        dl.quality || dl.calidad,
        item?.idiomas,
        item?.calidad
    );
    let label = extra ? `[${nombre}] ${extra}` : `[${nombre}]`;
    if (dl.size) label += ` (${dl.size})`;
    return label;
}

// ========== RENDER SERVIDORES + DESCARGAS ==========
function renderServidoresYDescargas(embedsRaw, downloadsRaw, fallbackUrl, itemRef) {
    const item = itemRef || seleccionActual || {};
    const serversSection = document.getElementById("servers-section");
    const serversContainer = document.getElementById("servers-container");
    const downloadsSection = document.getElementById("downloads-section");
    const downloadsContainer = document.getElementById("downloads-container");
    const player = document.getElementById("detail-player");

    serversContainer.innerHTML = "";
    downloadsContainer.innerHTML = "";
    player.src = "about:blank";

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
        u.includes("hackstore") ||
        u.includes("play.php")
    );
    }
    
    let embeds = [];
    if (Array.isArray(embedsRaw) && embedsRaw.length > 0) {
        embeds = embedsRaw.filter(e => e && e.url && !esEmbedInvalido(e.url));
    } else if (fallbackUrl && !esEmbedInvalido(fallbackUrl)) {
        embeds = [{ url: fallbackUrl, server: "Servidor" }];
    }

// aqui va el short
    // Vimeo / MovieZone primero
    embeds.sort((a, b) => {
        const aV = /vimeos/i.test(a.url || "") || a.server === "MovieZone" || a.name === "MovieZone";
        const bV = /vimeos/i.test(b.url || "") || b.server === "MovieZone" || b.name === "MovieZone";
        if (aV && !bV) return -1;
        if (!aV && bV) return 1;
        return 0;
    });
    
    if (embeds.length > 0) {
        serversSection.style.display = "block";

        embeds.forEach((embed, index) => {
            const btn = document.createElement("button");
            btn.className = "server-btn" + (index === 0 ? " active" : "");
            btn.textContent = labelServidor(embed, index, item);

            btn.addEventListener("click", () => {
                serversContainer.querySelectorAll(".server-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                player.src = embed.url;
            });

            serversContainer.appendChild(btn);
        });

        player.src = embeds[0].url;
    } else {
        // Solo este mensaje. SIN enlace de Telegram.
        serversSection.style.display = "block";
        serversContainer.innerHTML = `<div style="color:#999;padding:12px 0;">Este contenido todavía no está disponible</div>`;
        player.src = "about:blank";
    }

    // Descargas
    const downloads = Array.isArray(downloadsRaw) ? downloadsRaw : [];
    if (downloads.length > 0) {
        downloadsSection.style.display = "block";

        downloads.forEach((dl, index) => {
            const url = dl.url || dl.link || (typeof dl === "string" ? dl : null);
            if (!url || typeof url !== "string") return;

            const a = document.createElement("a");
            a.className = "download-btn";
            a.href = url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.innerHTML = `⬇ ${escapeHtml(labelDescarga(dl, index, item))}`;
            downloadsContainer.appendChild(a);
        });
    } else {
        downloadsSection.style.display = "none";
    }
}

// ======================================================
// TAGS
// ======================================================
function agregarTag(texto, contenedor) {
    if (!texto || !contenedor) return;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = texto;
    contenedor.appendChild(tag);
}

// ======================================================
// BÚSQUEDA
// ======================================================
let temporizadorBusqueda;

searchInput.addEventListener("input", () => {
    clearTimeout(temporizadorBusqueda);
    const texto = searchInput.value.trim();

    if (!texto) {
        mostrarVista(seccionActual === "peliculas" ? "home" : seccionActual);
        return;
    }

    temporizadorBusqueda = setTimeout(() => buscar(texto), 450);
});

async function buscar(texto) {
    mostrarVista("search");

    const contenedor = contenedores.search;
    const info = infos.search;

    contenedor.innerHTML = `<div class="loading">Buscando...</div>`;
    if (info) info.textContent = "Buscando...";

    try {
        const respuesta = await fetch(
            `/api/buscar?q=${encodeURIComponent(texto)}`,
            { cache: "no-store" }
        );
        const datos = await respuesta.json();
        const lista = datos.resultados || [];

        mostrarCatalogo(lista, contenedor);
        if (info) info.textContent = `${lista.length} resultados`;
    } catch (error) {
        console.error(error);
        contenedor.innerHTML = `<div class="loading">Error realizando la búsqueda.</div>`;
    }
}

// ======================================================
// MENÚ
// ======================================================
document.querySelectorAll("nav a").forEach(enlace => {
    enlace.addEventListener("click", (e) => {
        e.preventDefault();
        const vista = enlace.dataset.vista;

        if (vista === "home") {
            mostrarVista("home");
            cargarSeccion("peliculas");
        } else if (vista === "peliculas") {
            mostrarVista("peliculas");
            cargarSeccion("peliculas", paginaActual.peliculas || 1);
        } else if (vista === "series") {
            mostrarVista("series");
            cargarSeccion("series", paginaActual.series || 1);
        } else if (vista === "anime") {
            mostrarVista("anime");
            cargarSeccion("anime", paginaActual.anime || 1);
        } else if (vista === "favoritos") {
            mostrarVista("favoritos");
            cargarFavoritos();
        } else if (vista === "historial") {
            mostrarVista("historial");
            cargarHistorial();
        }
    });
});

// ======================================================
// SEGURIDAD
// ======================================================
function escapeHtml(texto) {
    return String(texto)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttribute(texto) {
    return escapeHtml(texto);
}

// ======================================================
// INICIO
// ======================================================
mostrarVista("home");
cargarSeccion("peliculas");
