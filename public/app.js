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
    detail: document.getElementById("view-detail")
};

const contenedores = {
    home: document.getElementById("home-container"),
    peliculas: document.getElementById("peliculas-container"),
    series: document.getElementById("series-container"),
    anime: document.getElementById("anime-container"),
    search: document.getElementById("search-container")
};

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
async function cargarSeccion(seccion) {
    if (cargando) return;
    cargando = true;

    seccionActual = seccion;

    const contenedor = contenedores[seccion] || contenedores.peliculas;
    const info = infos[seccion] || infos.peliculas;

    contenedor.innerHTML = `<div class="loading">Cargando ${textoSeccion(seccion)}...</div>`;
    if (info) info.textContent = "Cargando...";

    try {
        let url = "/api/catalogo";
        if (seccion === "series") url = "/api/series";
        if (seccion === "anime") url = "/api/animes";

        const respuesta = await fetch(url, { cache: "no-store" });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

        const datos = await respuesta.json();
        const lista = datos.resultados || [];

        mostrarCatalogo(lista, contenedor);

        if (info) {
            info.textContent = `${lista.length} disponibles`;
        }

        // Si es home, también llenamos el slider de 2026
        if (seccion === "peliculas" || seccion === "home") {
            llenarSliderNuevas(lista);
            // También llenamos el contenedor de home
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
                <p>${escapeHtml(item.nombre || "Sin título")}</p>
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

        const tieneVideo =
            Boolean(item.reproductor) ||
            (Array.isArray(item.episodios) && item.episodios.some(e => e.video));

        card.innerHTML = `
            <div class="poster-wrap">
                <img src="${escapeAttribute(portada)}" alt="${escapeAttribute(nombre)}" loading="lazy">
                <span class="type-badge">${escapeHtml(tipo)}</span>
                ${
                    tieneVideo
                        ? `<span class="available">Disponible</span>`
                        : `<span class="unavailable">Sin reproductor</span>`
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
function seleccionar(item) {
    seleccionActual = item;
    vistaAnterior = Object.keys(vistas).find(k => vistas[k].classList.contains("active")) || "home";

    // Título
    document.getElementById("detail-title").textContent = item.nombre || "Sin título";

    // Título original
    const originalEl = document.getElementById("detail-original");
    if (item.titulo_original && item.titulo_original !== item.nombre) {
        originalEl.textContent = item.titulo_original;
        originalEl.style.display = "block";
    } else {
        originalEl.style.display = "none";
    }

    // Descripción
    document.getElementById("detail-description").textContent =
        item.descripcion || "Sin descripción disponible.";

    // Portada
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

    // Meta info
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
    if (item.paises && item.paises.length) {
        meta.innerHTML += `<div class="meta-item"><strong>País:</strong> ${escapeHtml(item.paises.join(", "))}</div>`;
    }
    if (item.duracion) {
        meta.innerHTML += `<div class="meta-item"><strong>Duración:</strong> ${escapeHtml(String(item.duracion))} min</div>`;
    }

    const player = document.getElementById("detail-player");
    const serversSection = document.getElementById("servers-section");
    const serversContainer = document.getElementById("servers-container");
    const downloadsSection = document.getElementById("downloads-section");
    const downloadsContainer = document.getElementById("downloads-container");
    const episodesSection = document.getElementById("episodes-section");
    const episodesContainer = document.getElementById("episodes-container");
    const seasonSelect = document.getElementById("season-select");

    // Limpiar todo
    serversContainer.innerHTML = "";
    downloadsContainer.innerHTML = "";
    episodesContainer.innerHTML = "";
    player.src = "about:blank";
    serversSection.style.display = "none";
    downloadsSection.style.display = "none";
    episodesSection.style.display = "none";

    const esSerieOAnime = item.tipo === "Serie" || item.tipo === "Anime";

    // ========== SERIE / ANIME ==========
    if (esSerieOAnime && Array.isArray(item.episodios) && item.episodios.length > 0) {
        episodesSection.style.display = "block";

        // Selector de temporadas
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

        renderEpisodios(item);
    }
    // ========== PELÍCULA ==========
    else {
        // Solo para películas mostramos servidores y descargas de inmediato
        renderServidoresYDescargas(item.embeds, item.downloads, item.reproductor);
    }

    mostrarVista("detail");
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
            cargarSeccion("peliculas"); // home usa películas + slider
        } else if (vista === "peliculas") {
            mostrarVista("peliculas");
            cargarSeccion("peliculas");
        } else if (vista === "series") {
            mostrarVista("series");
            cargarSeccion("series");
        } else if (vista === "anime") {
            mostrarVista("anime");
            cargarSeccion("anime");
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
