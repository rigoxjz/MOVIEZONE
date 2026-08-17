const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs").promises;
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const app = express();
// ======================================================
// SEGURIDAD (Helmet + Rate Limit)
// ======================================================
app.use(helmet({
    contentSecurityPolicy: false, // necesario porque usamos iframes de otros dominios
    crossOriginEmbedderPolicy: false
}));

// Límite general: 120 peticiones cada 15 minutos por IP
const limiterGeneral = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas peticiones. Espera un momento e inténtalo de nuevo." }
});

// Límite más estricto para búsqueda
const limiterBusqueda = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas búsquedas. Espera un momento." }
});

app.use(limiterGeneral);

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_KEY || ""
);
const PORT = process.env.PORT || 3000;


const BASE = process.env.SOURCE_URL || "https://lamovie.org";
const API  = "https://lamovie.org/wp-api/v1";
const IMG  = "https://lamovie.org/wp-content/uploads";

const GENRES = {
    17: "Drama", 18: "Comedia", 33: "Suspense", 32: "Acción", 520: "Animación",
    96: "Terror", 180: "Crimen", 130: "Aventura", 398: "Familia", 115: "Romance",
    97: "Misterio", 131: "Ciencia ficción", 229: "Fantasía", 164: "Documental",
    165: "Historia", 8: "Música", 6787: "Película de TV", 3056: "Bélica", 674: "Western", 703: "Kids"
};
const QUALITIES = {
    495: "Full HD", 496: "Dual 1080p", 88953: "HD 720p", 58679: "BDRip",
    58681: "HDTV", 59268: "Dual 720p", 649: "HD", 58683: "WEB-DL 720p",
    53691: "DVDRip", 58678: "WEB-DL 1080p", 88954: "4K Ultra HD",
    69831: "WEB-DL 4k", 49673: "1080P", 82756: "4K HDR"
};
const LANGS = {
    58651: "Latino", 58652: "Inglés", 58654: "Japonés", 58655: "Subtitulado",
    58653: "Castellano", 58667: "Coreano", 58661: "Portugués"
};
const YEARS = {
    4: "2025", 1461: "2022", 2236: "2023", 74006: "2026", 2169: "2021",
    1354: "2024", 2792: "2020", 1816: "2019", 1926: "2018", 1874: "2017"
};

const COUNTRIES = {
    457: "Estados Unidos", 774: "Reino Unido", 787: "Canadá", 617: "Francia",
    5436: "México", 2499: "España", 733: "Japón", 4601: "Corea del Sur",
    1431: "Alemania", 7746: "Argentina"
};

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36",
    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};
const session = axios.create({
    headers: HEADERS,
    timeout: 20000,
    maxRedirects: 5
});

// ======================================================
// TELEGRAM + GITHUB (solo nuevos)
// ======================================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const GITHUB_DATA_URL = process.env.GITHUB_DATA_URL || "";

// Set de links que ya existen en el JSON de GitHub
// Base de datos en memoria (cargada desde GitHub)
// Base de datos en memoria (cargada desde Supabase)
let moviesDB = [];
let knownLinks = new Set();

async function cargarDatosSupabase() {
    try {
        const { data, error } = await supabase
            .from("movies")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        moviesDB = data || [];
        knownLinks = new Set(moviesDB.map(item => item.link).filter(Boolean));

        console.log(`Supabase DB cargada: ${moviesDB.length} items`);
    } catch (err) {
        console.error("No se pudo cargar desde Supabase:", err.message);
        moviesDB = [];
        knownLinks = new Set();
    }
}

async function enviarTelegram(texto) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHAT_ID,
                text: texto,
                parse_mode: "HTML",
                disable_web_page_preview: true
            },
            { timeout: 10000 }
        );
    } catch (err) {
        console.error("Error enviando a Telegram:", err.message);
    }
}



async function guardarEnSupabase(items) {
    if (!items || items.length === 0) return;

    // Guardamos TODO lo enriquecido (no solo los "nuevos")
    // así se actualizan los embeds, episodios, etc.
    const paraInsertar = items
        .filter(item => item.link)
        .map(item => ({
            link: item.link,
            nombre: item.nombre || null,
            titulo_original: item.titulo_original || null,
            portada: item.portada || null,
            backdrop: item.backdrop || null,
            descripcion: item.descripcion || null,
            year: item.year || null,
            genero: item.genero || null,
            tipo: item.tipo || "Película",
            idiomas: item.idiomas || [],
            calidad: item.calidad || [],
            paises: item.paises || [],
            calificacion: item.calificacion || null,
            calificacion_comunidad: item.calificacion_comunidad || null,
            votos: item.votos ? Math.trunc(Number(item.votos)) || null : null,
            fecha_estreno: item.fecha_estreno || null,
            duracion: item.duracion ? Math.trunc(Number(item.duracion)) || null : null,
            certificacion: item.certificacion || null,
            ultimo_episodio: item.ultimo_episodio || null,
            reproductor: item.reproductor || null,
            embeds: item.embeds || [],
            downloads: item.downloads || [],
            solo_trailer: !!item.soloTrailer,
            episodios: item.episodios || [],
            temporadas: item.temporadas || [],
            postId: item.postId || null
        }));

    if (paraInsertar.length === 0) return;

    try {
        const { error } = await supabase
            .from("movies")
            .upsert(paraInsertar, { onConflict: "link" });

        if (error) throw error;

        // Actualizamos memoria local
        paraInsertar.forEach(item => {
            knownLinks.add(item.link);
            // Reemplazamos o agregamos en moviesDB
            const idx = moviesDB.findIndex(m => m.link === item.link);
            if (idx >= 0) {
                moviesDB[idx] = item;
            } else {
                moviesDB.unshift(item);
            }
        });

        console.log(`Guardados/actualizados ${paraInsertar.length} items en Supabase`);
    } catch (err) {
        console.error("Error guardando en Supabase:", err.message);
    }
}


async function enviarNuevosATelegram(items) {
    if (!items || items.length === 0) return;

    const nuevos = items.filter(item => item.link && !knownLinks.has(item.link));
    if (nuevos.length === 0) {
        console.log("No hay items nuevos para Telegram");
        return;
    }
// Guardar automáticamente en Supabase
    await guardarEnSupabase(nuevos);
    
    // Actualizamos el set local
    nuevos.forEach(item => knownLinks.add(item.link));

    try {
        const FormData = require("form-data");
        const form = new FormData();

        const jsonContent = JSON.stringify(nuevos, null, 2);
        const buffer = Buffer.from(jsonContent, "utf-8");

        const nombreArchivo = `nuevos_${Date.now()}.json`;

        form.append("chat_id", TELEGRAM_CHAT_ID);
        form.append("caption", `📄 ${nuevos.length} nuevo(s) item(s)\nDescarga este archivo y súbelo a data/movies_saved.json`);
        form.append("document", buffer, {
            filename: nombreArchivo,
            contentType: "application/json"
        });

        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
            form,
            {
                headers: form.getHeaders(),
                timeout: 20000
            }
        );

        console.log(`Enviado archivo JSON con ${nuevos.length} items nuevos`);
    } catch (err) {
        console.error("Error enviando archivo a Telegram:", err.message);

        // Respaldo: si falla el archivo, manda el JSON como texto
        const jsonLimpio = JSON.stringify(nuevos, null, 2);
        const mensaje = `📄 <b>${nuevos.length} nuevo(s) item(s)</b>\n\n<pre>${jsonLimpio.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 3800)}</pre>`;
        await enviarTelegram(mensaje);
    }
}

// ======================================================
// CACHE (archivos temporales en /tmp - compatible con Render)
// ======================================================
const CACHE_DIR = path.join("/tmp", "moviezone-cache");

async function getCache(key) {
    try {
        const file = path.join(CACHE_DIR, `${key}.json`);
        const data = await fs.readFile(file, "utf8");
        return JSON.parse(data);
    } catch {
        return null;
    }
}

async function setCache(key, data) {
    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        const file = path.join(CACHE_DIR, `${key}.json`);
        await fs.writeFile(file, JSON.stringify(data), "utf8");
    } catch (error) {
        console.error("Error guardando cache:", error.message);
    }
}

// ======================================================
// UTILIDADES
// ======================================================
function unirUrl(base, relativa) {
    try {
        return new URL(relativa, base).toString();
    } catch {
        return null;
    }
}
function limpiarUrl(urlStr) {
    try {
        const p = new URL(urlStr);
        let pathname = p.pathname;
        if (!pathname.endsWith("/")) {
            pathname += "/";
        }
        return `${p.protocol}//${p.host}${pathname}`;
    } catch {
        return urlStr;
    }
}
async function obtener(url) {
    const respuesta = await session.get(url);
    return cheerio.load(respuesta.data);
}
async function obtenerHTML(url) {
    const respuesta = await session.get(url);
    return respuesta.data;
}

function resolveIds(ids, mapping) {
    if (!ids) return [];
    if (!Array.isArray(ids)) ids = [ids];
    return ids.map(i => mapping[parseInt(i)] || String(i)).filter(Boolean);
}


function formatItem(p) {
    const images = p.images || {};
    let poster = images.poster || "";
    if (poster && !poster.startsWith("http")) poster = IMG + poster;

    let backdrop = images.backdrop || "";
    if (backdrop && !backdrop.startsWith("http")) backdrop = IMG + backdrop;

    const tipoRaw = p.type || "";
    let tipo = "Película";
    let link = null;

    if (tipoRaw === "movies") {
        tipo = "Película";
        link = `${BASE}/peliculas/${p.slug}/`;
    } else if (tipoRaw === "tvshows") {
        tipo = "Serie";
        link = `${BASE}/series/${p.slug}/`;
    } else if (tipoRaw === "animes") {
        tipo = "Anime";
        link = `${BASE}/animes/${p.slug}/`;
    }

    const yearArr = resolveIds(p.years, YEARS);
    const year = yearArr[0] || (p.release_date ? String(p.release_date).substring(0, 4) : null);

    return {
        id: p._id,
        nombre: p.title || "Sin título",
        titulo_original: p.original_title || null,
        slug: p.slug,
        tipo,
        descripcion: p.overview || "",
        portada: poster || null,
        backdrop: backdrop || null,
        year,
        genero: resolveIds(p.genres, GENRES).join(", ") || null,
        idiomas: resolveIds(p.lang, LANGS),
        calidad: resolveIds(p.quality, QUALITIES),
        calificacion: p.rating || p.imdb_rating || null,
        calificacion_comunidad: p.community_rating || null,
        votos: p.vote_count || p.community_vote_count || null,
        fecha_estreno: p.release_date || null,
        duracion: p.runtime || null,
        certificacion: p.certification || null,
        paises: resolveIds(p.countries, COUNTRIES),
        ultimo_episodio: p.latest_episode || null,
        link,
        reproductor: null,
        downloads: [],
        embeds: [],
        soloTrailer: false,
        episodios: [],
        temporadas: [],
        postId: p._id
    };
}

async function apiGet(url) {
    const res = await session.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
            "Accept": "application/json"
        },
        timeout: 25000
    });
    return res.data;
}

async function listSection(section = "movies", page = 1, perPage = 24) {
    const postType = section === "series" || section === "tvshows" ? "tvshows"
                   : section === "animes" || section === "anime" ? "animes"
                   : "movies";

    const url = `${API}/listing/${postType}?page=${page}&orderBy=latest&order=desc&postType=${postType}&postsPerPage=${perPage}`;
    const data = await apiGet(url);
    const posts = data?.data?.posts || [];
    return posts.map(formatItem);
}

async function searchApi(query, perPage = 20) {
    const q = encodeURIComponent(query);
    const url = `${API}/search?postType=any&q=${q}&postsPerPage=${perPage}`;
    const data = await apiGet(url);
    let posts = data?.data?.posts || data?.data || [];
    if (!Array.isArray(posts)) posts = [];
    return posts.map(formatItem);
}

async function getPlayer(postId) {
    try {
        const url = `${API}/player?postId=${postId}&demo=0`;
        const data = await apiGet(url);
        const embeds = data?.data?.embeds || [];
        const downloads = data?.data?.downloads || [];

        // Priorizamos el primer embed bueno
        let reproductor = null;
        for (const e of embeds) {
            if (e.url && !e.url.includes("youtube.com") && !e.url.includes("youtu.be")) {
                reproductor = e.url;
                break;
            }
        }
        // Si solo hay YouTube, lo usamos igual
        if (!reproductor && embeds.length > 0) {
            reproductor = embeds[0].url;
        }

        return { reproductor, embeds, downloads };
    } catch (err) {
        console.error("Error getPlayer:", err.message);
        return { reproductor: null, embeds: [], downloads: [] };
    }
}

async function getEpisodes(serieId, season = 1) {
    try {
        const url = `${API}/single/episodes/list?_id=${serieId}&season=${season}&page=1&postsPerPage=50`;
        const data = await apiGet(url);
        return data?.data || {};
    } catch {
        return {};
    }
}

async function enriquecerItem(item) {
    if (!item.postId) return item;

    // Obtener reproductor y descargas del título principal
    const playerData = await getPlayer(item.postId);
    item.reproductor = playerData.reproductor;
    item.downloads = playerData.downloads || [];
    item.embeds = playerData.embeds || [];

    if (item.reproductor && (item.reproductor.includes("youtube.com") || item.reproductor.includes("youtu.be"))) {
        item.soloTrailer = true;
        if (item.nombre && !item.nombre.includes("Solo trailer")) {
            item.nombre = `${item.nombre} (Solo trailer - No disponible)`;
        }
    }

    // Si es serie o anime → cargar temporadas y episodios
if (item.tipo === "Serie" || item.tipo === "Anime") {
        const epData = await getEpisodes(item.postId, 1);
        let seasons = epData.seasons || [];
        if (!seasons.length) seasons = [1];
        seasons = [...new Set(seasons.map(s => parseInt(s)))].sort((a, b) => a - b);

        item.temporadas = seasons;
        item.episodios = [];

        // Cargamos la primera temporada por defecto
        const posts = epData.posts || [];

        for (const ep of posts) {
            const epPlayer = await getPlayer(ep._id);
            item.episodios.push({
                id: ep._id,
                nombre: ep.title || `T${ep.season_number}E${String(ep.episode_number).padStart(2, "0")}`,
                season: ep.season_number,
                episode: ep.episode_number,
                video: epPlayer.reproductor || null,
                embeds: epPlayer.embeds || [],
                downloads: epPlayer.downloads || [],
                soloTrailer: epPlayer.reproductor
                    ? (epPlayer.reproductor.includes("youtube") || epPlayer.reproductor.includes("youtu.be"))
                    : false
            });
        }
    }

    return item;
}


function esYouTube(url) {
    if (!url) return false;
    const u = String(url).toLowerCase();
    return (
        u.includes("youtube.com") ||
        u.includes("youtu.be") ||
        u.includes("youtube-nocookie.com")
    );
}

// ======================================================
// TIPO
// ======================================================
function detectarTipo(url, nombre = "") {
    const texto =
        `${url} ${nombre}`.toLowerCase();
    if (
        texto.includes("/anime/") ||
        texto.includes("/animes/") ||
        texto.includes("anime")
    ) {
        return "Anime";
    }
    if (
        texto.includes("/series/") ||
        texto.includes("serie")
    ) {
        return "Serie";
    }
    return "Película";
}
// ======================================================
// TÍTULO
// ======================================================
function esTituloGenerico(texto) {
    if (!texto) return true;
    const t = String(texto)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
    if (t.length < 2) return true;
    const genericos = [
        "descargar peliculas gratis",
        "descargar películas gratis",
        "peliculas gratis",
        "películas gratis",
        "por mega",
        "google drive",
        "más en 1 link",
        "mas en 1 link",
        "ver peliculas gratis",
        "ver películas gratis"
    ];
    return genericos.some(
        palabra => t.includes(palabra)
    );
}
function extraerTitulo(pagina, link) {
    let nombre = null;
    // H1
    pagina("h1").each((_, el) => {
        if (nombre) return;
        const texto = pagina(el)
            .text()
            .trim()
            .replace(/\s+/g, " ");
        if (!esTituloGenerico(texto)) {
            nombre = texto;
        }
    });
    // OG TITLE
    if (!nombre) {
        const titulo =
            pagina(
                'meta[property="og:title"]'
            ).attr("content");
        if (
            titulo &&
            !esTituloGenerico(titulo)
        ) {
            nombre = titulo
                .trim()
                .replace(/\s+/g, " ");
        }
    }
    // META TITLE
    if (!nombre) {
        const titulo =
            pagina(
                'meta[name="title"]'
            ).attr("content");
        if (
            titulo &&
            !esTituloGenerico(titulo)
        ) {
            nombre = titulo
                .trim()
                .replace(/\s+/g, " ");
        }
    }
    // TITLE
    if (!nombre) {
        const titulo =
            pagina("title")
                .first()
                .text()
                .trim()
                .replace(/\s+/g, " ");
        if (
            titulo &&
            !esTituloGenerico(titulo)
        ) {
            nombre = titulo;
        }
    }
    // Slug como último respaldo
    if (!nombre) {
        try {
            const url = new URL(link);
            const partes =
                url.pathname
                    .split("/")
                    .filter(Boolean);
            if (partes.length) {
                let slug =
                    partes[partes.length - 1];
                slug = slug
                    .replace(/-\d{4}$/, "")
                    .replace(/[-_]+/g, " ")
                    .trim();
                if (slug) {
                    nombre = slug.replace(
                        /\b\w/g,
                        letra =>
                            letra.toUpperCase()
                    );
                }
            }
        } catch {}
    }
    if (nombre) {
        nombre = nombre
            .replace(
                /\s*\|\s*MisVideos.*$/i,
                ""
            )
            .replace(
                /\s*-\s*MisVideos.*$/i,
                ""
            )
            .trim();
    }
    return nombre;
}
// ======================================================
// PORTADA (mejorada)
// ======================================================
function extraerPortada(pagina, link) {
    const candidatos = [];

    function agregar(urlImg) {
        if (!urlImg) return;
        try {
            let limpia = String(urlImg).trim();
            // Limpiar srcset (tomar la primera URL)
            if (limpia.includes(" ")) {
                limpia = limpia.split(/\s+/)[0];
            }
            const absoluta = unirUrl(link, limpia);
            if (!absoluta) return;
            if (!candidatos.includes(absoluta)) {
                candidatos.push(absoluta);
            }
        } catch {}
    }

    // 1. JSON-LD
    pagina('script[type="application/ld+json"]').each((_, script) => {
        try {
            const raw = pagina(script).html();
            if (!raw) return;
            const data = JSON.parse(raw);
            let objetos = [];
            if (Array.isArray(data)) {
                objetos = data;
            } else if (data && typeof data === "object") {
                objetos = data["@graph"] || [data];
            }
            for (const obj of objetos) {
                if (!obj || typeof obj !== "object") continue;
                if (obj["@type"] === "ImageObject") {
                    agregar(obj.contentUrl || obj.url);
                }
                if (typeof obj.image === "string") {
                    agregar(obj.image);
                }
                if (obj.image && typeof obj.image === "object") {
                    agregar(obj.image.url || obj.image.contentUrl);
                }
                agregar(obj.thumbnailUrl);
            }
        } catch {}
    });

    // 2. Metas
    agregar(pagina('meta[property="og:image"]').attr("content"));
    agregar(pagina('meta[property="og:image:secure_url"]').attr("content"));
    agregar(pagina('meta[name="twitter:image"]').attr("content"));
    agregar(pagina('meta[name="twitter:image:src"]').attr("content"));
    agregar(pagina('meta[name="image"]').attr("content"));
    agregar(pagina('meta[itemprop="image"]').attr("content"));

    // 3. Imágenes del DOM
    pagina("img").each((_, img) => {
        const el = pagina(img);
        const posibles = [
            el.attr("src"),
            el.attr("data-src"),
            el.attr("data-lazy-src"),
            el.attr("data-original"),
            el.attr("data-lazyload"),
            el.attr("data-srcset"),
            el.attr("srcset")
        ];
        for (const imagen of posibles) {
            if (!imagen) continue;
            const texto = imagen.toLowerCase();
            if (
                texto.includes("logo") ||
                texto.includes("avatar") ||
                texto.includes("icon") ||
                texto.includes("banner") ||
                texto.includes("placeholder") ||
                texto.includes("loading") ||
                texto.includes("spinner") ||
                texto.includes("1x1") ||
                texto.includes("pixel")
            ) {
                continue;
            }
            agregar(imagen);
        }
    });

    // 4. Background-image en estilos
    pagina("[style*='background']").each((_, el) => {
        const style = pagina(el).attr("style") || "";
        const match = style.match(/url\(['"]?([^'")\s]+)['"]?\)/i);
        if (match) {
            agregar(match[1]);
        }
    });

    if (candidatos.length === 0) {
        return "https://via.placeholder.com/300x450/111111/ffffff?text=Sin+Portada";
    }

    // Priorizar: image.tmdb.org > poster/cover keywords > el resto
    candidatos.sort((a, b) => {
        const aLow = a.toLowerCase();
        const bLow = b.toLowerCase();

        const score = (u) => {
            let s = 0;
            if (u.includes("image.tmdb.org") || u.includes("tmdb.org")) s += 100;
            if (u.includes("poster") || u.includes("cover") || u.includes("portada")) s += 50;
            if (u.includes("/w500/") || u.includes("/w300/") || u.includes("/original/")) s += 30;
            if (u.includes(".jpg") || u.includes(".jpeg") || u.includes(".webp") || u.includes(".png")) s += 10;
            return s;
        };

        return score(bLow) - score(aLow);
    });

    return candidatos[0];
}

// ======================================================
// DESCRIPCIÓN
// ======================================================
function extraerDescripcion(pagina) {
    const posibles = [
        pagina(
            'meta[property="og:description"]'
        ).attr("content"),
        pagina(
            'meta[name="description"]'
        ).attr("content"),
        pagina(
            'meta[name="twitter:description"]'
        ).attr("content")
    ];
    for (const descripcion of posibles) {
        if (
            descripcion &&
            descripcion.trim().length > 10
        ) {
            return descripcion
                .trim()
                .replace(/\s+/g, " ");
        }
    }
    return "";
}
// ======================================================
// REPRODUCTOR
// ======================================================
async function extraerReproductor(url, $pagina) {

    const candidatos = [];

    function agregar(urlEncontrada) {

        if (!urlEncontrada) return;

        try {

            const absoluta =
                new URL(
                    urlEncontrada,
                    url
                ).toString();

            if (!candidatos.includes(absoluta)) {
                candidatos.push(absoluta);
            }

        } catch {}

    }


    // ======================================================
    // 1. IFRAME
    // ======================================================

    $pagina("iframe").each((_, el) => {

        agregar(
            $pagina(el).attr("src")
        );

        agregar(
            $pagina(el).attr("data-src")
        );

        agregar(
            $pagina(el).attr("data-url")
        );

        agregar(
            $pagina(el).attr("data-embed")
        );

    });


    // ======================================================
    // 2. EMBED
    // ======================================================

    $pagina("embed").each((_, el) => {

        agregar(
            $pagina(el).attr("src")
        );

    });


    // ======================================================
    // 3. VIDEO
    // ======================================================

    $pagina("video").each((_, el) => {

        agregar(
            $pagina(el).attr("src")
        );

        agregar(
            $pagina(el).attr("data-src")
        );

    });


    $pagina("source").each((_, el) => {

        agregar(
            $pagina(el).attr("src")
        );

        agregar(
            $pagina(el).attr("data-src")
        );

    });


    // ======================================================
    // 4. ATRIBUTOS COMUNES DE REPRODUCTORES
    // ======================================================

    $pagina("[data-player]").each((_, el) => {

        agregar(
            $pagina(el).attr("data-player")
        );

    });


    $pagina("[data-video]").each((_, el) => {

        agregar(
            $pagina(el).attr("data-video")
        );

    });


    $pagina("[data-iframe]").each((_, el) => {

        agregar(
            $pagina(el).attr("data-iframe")
        );

    });


    // ======================================================
    // 5. BUSCAR URLs DENTRO DEL HTML
    // ======================================================

    const html = $pagina.html() || "";

    const regex =
        /https?:\/\/[^\s"'<>\\]+/gi;

    const urls =
        html.match(regex) || [];


    for (const encontrada of urls) {

        let limpia =
            encontrada
                .replace(/\\u002F/g, "/")
                .replace(/\\\//g, "/")
                .replace(/["'<>),]+$/g, "");

        agregar(limpia);

    }


    // ======================================================
    // 6. PRIORIZAR PLAYERS
    // ======================================================

    const prioridad = [

        "play.php",
        "/embed/",
        "/player/",
        "/embed-",
        "iframe",
        ".m3u8"

    ];


    candidatos.sort((a, b) => {

        const pa =
            prioridad.findIndex(
                x => a.toLowerCase().includes(x)
            );

        const pb =
            prioridad.findIndex(
                x => b.toLowerCase().includes(x)
            );

        return (
            (pa === -1 ? 999 : pa) -
            (pb === -1 ? 999 : pb)
        );

    });


    // ======================================================
    // 7. PROBAR CANDIDATOS
    // ======================================================

    for (const candidato of candidatos) {

        try {

            if (
                candidato.includes(".m3u8") ||
                candidato.includes(".mp4")
            ) {

                return candidato;

            }


            if (
                candidato.includes("play.php")
            ) {

                const htmlPlayer =
                    await obtenerHTML(
                        candidato
                    );


                const match =
                    htmlPlayer.match(
                        /window\.location\.href\s*=\s*["']([^"']+)/i
                    );


                if (match) {

                    const siguiente =
                        unirUrl(
                            candidato,
                            match[1]
                        );

                    if (siguiente) {
                        return siguiente;
                    }

                }


                const match2 =
                    htmlPlayer.match(
                        /location\.href\s*=\s*["']([^"']+)/i
                    );


                if (match2) {

                    const siguiente =
                        unirUrl(
                            candidato,
                            match2[1]
                        );

                    if (siguiente) {
                        return siguiente;
                    }

                }


                const urlsPlayer =
                    htmlPlayer.match(regex) || [];


                for (
                    const urlPlayer of urlsPlayer
                ) {

                    const limpia =
                        urlPlayer
                            .replace(
                                /\\u002F/g,
                                "/"
                            )
                            .replace(
                                /\\\//g,
                                "/"
                            )
                            .replace(
                                /["'<>),]+$/g,
                                ""
                            );


                    if (
                        limpia.includes(
                            ".m3u8"
                        ) ||
                        limpia.includes(
                            ".mp4"
                        ) ||
                        limpia.includes(
                            "/embed/"
                        ) ||
                        limpia.includes(
                            "/player/"
                        )
                    ) {

                        return limpia;

                    }

                }

            }


            if (
                candidato.includes("/embed/") ||
                candidato.includes("/player/") ||
                candidato.includes("embed-")
            ) {

                return candidato;

            }

        } catch (error) {

            console.log(
                "No se pudo comprobar reproductor:",
                candidato
            );

        }

    }


    return null;
}
// ======================================================
// EPISODIOS
// ======================================================
function extraerEpisodios(pagina, paginaBase) {
    const episodios = [];
    const vistos = new Set();

    pagina("a[href]").each((_, elemento) => {
        let texto = pagina(elemento)
            .text()
            .trim()
            .replace(/\s+/g, " ");

        // Limpiar basura de CSS / SVG que a veces viene en el texto
        texto = texto
            .replace(/\.text\s*\{[^}]*\}/gi, "")
            .replace(/font-size:[^;]+;/gi, "")
            .replace(/font-weight:[^;]+;/gi, "")
            .replace(/fill:\s*#[0-9a-f]+;/gi, "")
            .replace(/dominant-baseline:[^;]+;/gi, "")
            .replace(/text-anchor:[^;]+;/gi, "")
            .replace(/\{[^}]*\}/g, "")
            .trim();

        // Si después de limpiar queda muy sucio, intentar sacar solo el patrón de episodio
        const match = texto.match(/(\d+\s*[x×]\s*\d+|episodio\s*\d+|ep\.?\s*\d+|capítulo\s*\d+|capitulo\s*\d+)/i);
        if (match) {
            texto = match[0].replace(/\s+/g, "");
        }

        // Si todavía está vacío o es basura, saltamos
        if (!texto || texto.length < 2 || texto.toLowerCase().includes("disponible")) {
            // Intentamos usar el href como respaldo para generar nombre
            const href = pagina(elemento).attr("href") || "";
            const matchHref = href.match(/(\d+[x×]\d+|episodio[-_]?\d+|ep[-_]?\d+)/i);
            if (matchHref) {
                texto = matchHref[0].replace(/[-_]/g, " ");
            } else {
                return;
            }
        }

        const href = pagina(elemento).attr("href");
        if (!href) return;

        const url = unirUrl(paginaBase, href);
        if (!url) return;

        const contenido = `${texto} ${url}`.toLowerCase();
        const pareceEpisodio = /episodio|episode|capitulo|capítulo|\bep\.?\s*\d+|\b\d+x\d+\b/i.test(contenido);

        if (!pareceEpisodio) return;
        if (vistos.has(url)) return;
        if (url === paginaBase) return;

        vistos.add(url);

        episodios.push({
            nombre: texto || `Episodio ${episodios.length + 1}`,
            link: url,
            video: null
        });
    });

    return episodios;
}
// ======================================================
// PROCESAR PÁGINA
// ======================================================
async function procesarPagina(link) {
    const pagina =
        await obtener(link);
    const nombre =
        extraerTitulo(
            pagina,
            link
        );
    const portada =
        extraerPortada(
            pagina,
            link
        );
    const descripcion =
        extraerDescripcion(
            pagina
        );
    const tipo =
        detectarTipo(
            link,
            nombre || ""
        );
    let reproductor =
        await extraerReproductor(
            link,
            pagina
        );

    let soloTrailer = false;
    if (esYouTube(reproductor)) {
        soloTrailer = true;
    }

    const episodios =
        extraerEpisodios(
            pagina,
            link
        );
    let year = null;
    let genero = null;
    pagina(
        'script[type="application/ld+json"]'
    ).each((_, script) => {
        try {
            const raw =
                pagina(script).html();
            if (!raw) return;
            const data =
                JSON.parse(raw);
            const objetos =
                Array.isArray(data)
                    ? data
                    : (
                        data &&
                        typeof data ===
                            "object"
                    )
                        ? (
                            data["@graph"] ||
                            [data]
                        )
                        : [];
            for (const obj of objetos) {
                if (
                    !obj ||
                    typeof obj !==
                        "object"
                ) {
                    continue;
                }
                if (
                    !year &&
                    obj.dateCreated
                ) {
                    year =
                        String(
                            obj.dateCreated
                        ).substring(0, 4);
                }
                if (
                    !year &&
                    obj.datePublished
                ) {
                    year =
                        String(
                            obj.datePublished
                        ).substring(0, 4);
                }
                if (
                    !genero &&
                    obj.genre
                ) {
                    genero =
                        Array.isArray(
                            obj.genre
                        )
                            ? obj.genre.join(", ")
                            : obj.genre;
                }
            }
        } catch {}
    });

    let nombreFinal = nombre;
    if (soloTrailer && nombreFinal) {
        nombreFinal = `${nombreFinal} (Solo trailer - No disponible)`;
    } else if (soloTrailer) {
        nombreFinal = "Película no disponible (Solo trailer)";
    }

    return {
        nombre: nombreFinal,
        portada,
        descripcion,
        year,
        genero,
        tipo,
        link,
        reproductor,
        soloTrailer,
        episodios
    };
}
// ======================================================
// PROCESAR EPISODIOS
// ======================================================
async function procesarEpisodios(item) {
    if (
        !Array.isArray(item.episodios) ||
        item.episodios.length === 0
    ) {
        return item;
    }
    const episodios = [];
    for (
        const episodio
        of item.episodios
    ) {
        try {
            const pagina =
                await obtener(
                    episodio.link
                );
            let reproductor =
                await extraerReproductor(
                    episodio.link,
                    pagina
                );

            let soloTrailer = false;
            if (esYouTube(reproductor)) {
                soloTrailer = true;
            }

            let nombreEp = episodio.nombre;
            if (soloTrailer) {
                nombreEp = `${nombreEp} (Solo trailer)`;
            }

            episodios.push({
                nombre: nombreEp,
                link: episodio.link,
                video: reproductor,
                soloTrailer
            });
        } catch {
            episodios.push({
                nombre: episodio.nombre,
                link: episodio.link,
                video: null,
                soloTrailer: false
            });
        }
    }
    item.episodios =
        episodios;
    return item;
}
// ======================================================
// BUSCAR / LISTAR
// ======================================================
async function buscar(termino, seccion = null, page = 1, limit = 24) {
    let cacheKey;
    if (termino) {
        cacheKey = "search_" + termino.toLowerCase().trim().replace(/\s+/g, "_");
    } else {
        cacheKey = `${seccion || "peliculas"}_p${page}_l${limit}`;
    }

    // 1. Cache temporal
    const cached = await getCache(cacheKey);
    if (cached) {
        console.log("Cache hit (tmp):", cacheKey);
        return cached;
    }

    // 2. Base de datos Supabase
    if (!termino && moviesDB.length > 0) {
        let filtrados = moviesDB;

        if (seccion === "series") {
            filtrados = moviesDB.filter(item => item.tipo === "Serie");
        } else if (seccion === "animes" || seccion === "anime") {
            filtrados = moviesDB.filter(item => item.tipo === "Anime");
        } else {
            filtrados = moviesDB.filter(item => item.tipo === "Película" || !item.tipo);
        }

        // Paginación sobre Supabase
        const inicio = (page - 1) * limit;
        const pagina = filtrados.slice(inicio, inicio + limit);

        if (pagina.length > 0) {
            console.log(`Sirviendo desde Supabase (${seccion || "peliculas"}): página ${page}`);
            await setCache(cacheKey, pagina);
            return pagina;
        }
    }

    // 3. API nueva
    console.log("Cache miss + Supabase vacío o búsqueda → usando nueva API...");

    let resultados = [];

    try {
        if (termino) {
            resultados = await searchApi(termino, limit);
        } else {
            const section = seccion === "series" ? "series"
                          : (seccion === "animes" || seccion === "anime") ? "animes"
                          : "peliculas";
            resultados = await listSection(section, page, limit);
        }

        // Enriquecer solo los primeros
        const limiteEnriquecer = Math.min(resultados.length, 12);
        for (let i = 0; i < limiteEnriquecer; i++) {
            try {
                resultados[i] = await enriquecerItem(resultados[i]);
                console.log(`[${i + 1}/${limiteEnriquecer}] ${resultados[i].nombre}`);
            } catch (err) {
                console.error(`Error enriqueciendo ${resultados[i]?.nombre}:`, err.message);
            }
        }

    } catch (err) {
        console.error("Error en buscar:", err.message);
    }

    await setCache(cacheKey, resultados);
    await enviarNuevosATelegram(resultados);

    return resultados;
}


// ======================================================
// MANEJO DE ERRORES → Telegram
// ======================================================
process.on("uncaughtException", async (err) => {
    console.error("uncaughtException:", err);
    await enviarTelegram(`🚨 <b>Error crítico (uncaughtException)</b>\n\n${err.message}\n\n${err.stack?.slice(0, 800) || ""}`);
});

process.on("unhandledRejection", async (reason) => {
    console.error("unhandledRejection:", reason);
    await enviarTelegram(`🚨 <b>Error no manejado (unhandledRejection)</b>\n\n${String(reason).slice(0, 1000)}`);
});

// ======================================================
// API BÚSQUEDA
// ======================================================
app.get(
    "/api/buscar",
    limiterBusqueda,
    async (req, res) => {
        try {
            const termino =
                String(
                    req.query.q || ""
                ).trim();
            if (!termino) {
                return res
                    .status(400)
                    .json({
                        error:
                            "Escribe algo para buscar"
                    });
            }
            const resultados =
                await buscar(
                    termino
                );
            res.json({
                resultados
            });
        } catch (error) {
            console.error(error);
            await enviarTelegram(`⚠️ Error en /api/buscar\n${error.message}`);
            res
                .status(500)
                .json({
                    error:
                        "No se pudo realizar la búsqueda",
                    detalle:
                        error.message
                });
        }
    }
);
// ======================================================
// PELÍCULAS
// ======================================================
// ======================================================
// PELÍCULAS (con paginación)
// ======================================================
app.get("/api/catalogo", async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(48, Math.max(12, parseInt(req.query.limit) || 24));

        const resultados = await buscar("", "peliculas", page, limit);
        res.json({
            resultados,
            page,
            limit,
            total: resultados.length
        });
    } catch (error) {
        console.error(error);
        await enviarTelegram(`⚠️ Error en /api/catalogo\n${error.message}`);
        res.status(500).json({
            error: "No se pudo cargar el catálogo",
            detalle: error.message
        });
    }
});

// ======================================================
// SERIES (con paginación)
// ======================================================
app.get("/api/series", async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(48, Math.max(12, parseInt(req.query.limit) || 24));

        const resultados = await buscar("", "series", page, limit);
        res.json({
            resultados,
            page,
            limit,
            total: resultados.length
        });
    } catch (error) {
        console.error(error);
        await enviarTelegram(`⚠️ Error en /api/series\n${error.message}`);
        res.status(500).json({
            error: "No se pudieron cargar las series",
            detalle: error.message
        });
    }
});

// ======================================================
// ANIME (con paginación)
// ======================================================
app.get("/api/animes", async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(48, Math.max(12, parseInt(req.query.limit) || 24));

        const resultados = await buscar("", "animes", page, limit);
        res.json({
            resultados,
            page,
            limit,
            total: resultados.length
        });
    } catch (error) {
        console.error(error);
        await enviarTelegram(`⚠️ Error en /api/animes\n${error.message}`);
        res.status(500).json({
            error: "No se pudo cargar el anime",
            detalle: error.message
        });
    }
});


// ======================================================
// EPISODIOS POR TEMPORADA
// ======================================================
app.get("/api/episodios", async (req, res) => {
    try {
        const postId = req.query.postId;
        const season = parseInt(req.query.season) || 1;

        if (!postId) {
            return res.status(400).json({ error: "Falta postId" });
        }

        const epData = await getEpisodes(postId, season);
        let seasons = epData.seasons || [];
        if (!seasons.length) seasons = [1];
        seasons = [...new Set(seasons.map(s => parseInt(s)))].sort((a, b) => a - b);

        const posts = epData.posts || [];
        const episodios = [];

        for (const ep of posts) {
            const epPlayer = await getPlayer(ep._id);
            episodios.push({
                id: ep._id,
                nombre: ep.title || `T${ep.season_number}E${String(ep.episode_number).padStart(2, "0")}`,
                season: ep.season_number,
                episode: ep.episode_number,
                video: epPlayer.reproductor || null,
                embeds: epPlayer.embeds || [],
                downloads: epPlayer.downloads || [],
                soloTrailer: epPlayer.reproductor
                    ? (epPlayer.reproductor.includes("youtube") || epPlayer.reproductor.includes("youtu.be"))
                    : false
            });
        }

        res.json({
            temporadas: seasons,
            seasonActual: season,
            episodios
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "No se pudieron cargar los episodios", detalle: error.message });
    }
});



// ======================================================
// DETALLE COMPLETO (fuerza enriquecimiento)
// ======================================================
app.get("/api/detalle", async (req, res) => {
    try {
        const postId = req.query.postId;
        const link = req.query.link;

        if (!postId && !link) {
            return res.status(400).json({ error: "Falta postId o link" });
        }

        // Buscamos el item en memoria / Supabase
        let item = null;

        if (postId) {
            item = moviesDB.find(m => String(m.postId) === String(postId) || String(m.id) === String(postId));
        }
        if (!item && link) {
            item = moviesDB.find(m => m.link === link);
        }

        // Si no está en DB, creamos uno mínimo
        if (!item) {
            item = {
                postId: postId || null,
                link: link || null,
                nombre: "Cargando...",
                tipo: "Película",
                embeds: [],
                downloads: [],
                episodios: [],
                temporadas: []
            };
        }

        // Siempre enriquecemos de nuevo (esto arregla el problema)
        const enriquecido = await enriquecerItem({ ...item, postId: item.postId || postId });

        // Guardamos la versión completa en Supabase
        await guardarEnSupabase([enriquecido]);

        res.json(enriquecido);
    } catch (error) {
        console.error("Error en /api/detalle:", error.message);
        res.status(500).json({ error: "No se pudo cargar el detalle", detalle: error.message });
    }
});
// ======================================================
// FRONTEND
// ======================================================
app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);
// ======================================================
// RUTAS DE INTERFAZ
// ======================================================
app.get(
    "/peliculas",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);
app.get(
    "/series",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);
app.get(
    "/animes",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);


// ======================================================
// INICIO
// ======================================================
app.get(
    "/",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);
// ======================================================
// SERVIDOR
// ======================================================
app.listen(
    PORT,
    async () => {
        console.log(
            `MovieZone ejecutándose en puerto ${PORT}`
        );
        console.log(
            `Fuente: ${BASE}`
        );

        // Cargar lo que ya está guardado en Supabase
        await cargarDatosSupabase();

        // Aviso de inicio
        await enviarTelegram(`✅ <b>MovieZone iniciado</b>\nPuerto: ${PORT}\nItems conocidos: ${knownLinks.size}`);
    }
);
