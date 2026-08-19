const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs").promises;
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const app = express();

// Confiar en el proxy de Render
app.set("trust proxy", 1);

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
// Fuente de respaldo (Hackstore)
const HACKSTORE_BASE = process.env.HACKSTORE_URL || "https://www.hackstore.fo";

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

// Series/Anime ya refrescados en ESTA sesión del servidor.
// Se vacía cuando Render se duerme y vuelve a arrancar.
const refreshedThisSession = new Set();

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
    const paraInsertarRaw = items
        .filter(item => item.link)
        .map(item => {
            // Evitar que el nombre de la serie se contamine con " - Temporada X Episodio Y"
            let nombre = item.nombre || null;
            if (nombre && (item.tipo === "Serie" || item.tipo === "Anime")) {
                nombre = nombre
                    .replace(/\s*[-–—]\s*(Temporada|Season|Episodio|Episode|Capítulo|Capitulo).*$/i, "")
                    .trim();
            }
            return {
                link: item.link,
                nombre,
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
            };
        });

    // Deduplicar por link (Supabase falla si el mismo link aparece 2 veces en un upsert)
    const vistosLink = new Set();
    const paraInsertar = [];
    for (const row of paraInsertarRaw) {
        if (!row.link || vistosLink.has(row.link)) continue;
        vistosLink.add(row.link);
        paraInsertar.push(row);
    }

    if (paraInsertar.length === 0) return;

    try {
        const { error } = await supabase
            .from("movies")
            .upsert(paraInsertar, { onConflict: "link" });

        if (error) throw error;

        // Actualizamos memoria local
        paraInsertar.forEach(item => {
            knownLinks.add(item.link);
            const idx = moviesDB.findIndex(m => m.link === item.link);
            if (idx >= 0) {
                moviesDB[idx] = { ...moviesDB[idx], ...item };
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



// ======================================================
// HACKSTORE (fuente de respaldo - solo se usa si Lamovie falla)
// ======================================================

function esYouTube(url) {
    if (!url) return false;
    const u = String(url).toLowerCase();
    return (
        u.includes("youtube.com") ||
        u.includes("youtu.be") ||
        u.includes("youtube-nocookie.com")
    );
}

function esReproductorLamovie(url) {
    if (!url) return false;
    const u = String(url).toLowerCase();
    return u.includes("lamovie.org") || u.includes("lamovie");
}

function esReproductorValido(url) {
    if (!url) return false;
    if (esYouTube(url)) return false;
    if (esReproductorLamovie(url)) return false;
    return true;
}

async function obtenerHackstore(url) {
    const respuesta = await session.get(url, {
        headers: {
            ...HEADERS,
            "Referer": HACKSTORE_BASE + "/"
        },
        timeout: 25000
    });
    return cheerio.load(respuesta.data);
}

function detectarTipoHackstore(url, nombre = "") {
    const texto = `${url} ${nombre}`.toLowerCase();
    if (texto.includes("/anime/") || texto.includes("/animes/") || texto.includes("anime")) return "Anime";
    if (texto.includes("/series/") || texto.includes("serie")) return "Serie";
    return "Película";
}

function esTituloGenericoHack(texto) {
    if (!texto) return true;
    const t = String(texto).trim().toLowerCase().replace(/\s+/g, " ");
    if (t.length < 2) return true;
    const genericos = [
        "descargar peliculas gratis", "descargar películas gratis",
        "peliculas gratis", "películas gratis", "por mega", "google drive",
        "más en 1 link", "mas en 1 link", "ver peliculas gratis", "ver películas gratis"
    ];
    return genericos.some(p => t.includes(p));
}

function extraerTituloHackstore(pagina, link) {
    let nombre = null;
    pagina("h1").each((_, el) => {
        if (nombre) return;
        const texto = pagina(el).text().trim().replace(/\s+/g, " ");
        if (!esTituloGenericoHack(texto)) nombre = texto;
    });
    if (!nombre) {
        const titulo = pagina('meta[property="og:title"]').attr("content");
        if (titulo && !esTituloGenericoHack(titulo)) nombre = titulo.trim().replace(/\s+/g, " ");
    }
    if (!nombre) {
        const titulo = pagina("title").first().text().trim().replace(/\s+/g, " ");
        if (titulo && !esTituloGenericoHack(titulo)) nombre = titulo;
    }
    if (!nombre) {
        try {
            const url = new URL(link);
            const partes = url.pathname.split("/").filter(Boolean);
            if (partes.length) {
                let slug = partes[partes.length - 1]
                    .replace(/-\d{4}$/, "")
                    .replace(/[-_]+/g, " ")
                    .trim();
                if (slug) {
                    nombre = slug.replace(/\b\w/g, l => l.toUpperCase());
                }
            }
        } catch {}
    }
    if (nombre) {
        nombre = nombre
            .replace(/\s*\|\s*MisVideos.*$/i, "")
            .replace(/\s*-\s*MisVideos.*$/i, "")
            .replace(/^Descargar\s+(serie|película|pelicula|anime)\s+/i, "")
            .replace(/^Ver\s+/i, "")
            .replace(/\s*online\s*$/i, "")
            .replace(/\s*gratis\s*$/i, "")
            .trim();
    }
    return nombre;
}

function extraerPortadaHackstore(pagina, link) {
    const candidatos = [];
    function agregar(urlImg) {
        if (!urlImg) return;
        try {
            let limpia = String(urlImg).trim();
            if (limpia.includes(" ")) limpia = limpia.split(/\s+/)[0];
            const absoluta = unirUrl(link, limpia);
            if (!absoluta) return;
            if (!candidatos.includes(absoluta)) candidatos.push(absoluta);
        } catch {}
    }

    pagina('script[type="application/ld+json"]').each((_, script) => {
        try {
            const raw = pagina(script).html();
            if (!raw) return;
            const data = JSON.parse(raw);
            let objetos = Array.isArray(data) ? data : (data && typeof data === "object" ? (data["@graph"] || [data]) : []);
            for (const obj of objetos) {
                if (!obj || typeof obj !== "object") continue;
                if (obj["@type"] === "ImageObject") agregar(obj.contentUrl || obj.url);
                if (typeof obj.image === "string") agregar(obj.image);
                if (obj.image && typeof obj.image === "object") agregar(obj.image.url || obj.image.contentUrl);
                agregar(obj.thumbnailUrl);
            }
        } catch {}
    });

    agregar(pagina('meta[property="og:image"]').attr("content"));
    agregar(pagina('meta[property="og:image:secure_url"]').attr("content"));
    agregar(pagina('meta[name="twitter:image"]').attr("content"));
    agregar(pagina('meta[itemprop="image"]').attr("content"));

    pagina("img").each((_, img) => {
        const el = pagina(img);
        const posibles = [el.attr("src"), el.attr("data-src"), el.attr("data-lazy-src"), el.attr("data-original"), el.attr("srcset")];
        for (const imagen of posibles) {
            if (!imagen) continue;
            const texto = imagen.toLowerCase();
            if (texto.includes("logo") || texto.includes("avatar") || texto.includes("icon") ||
                texto.includes("banner") || texto.includes("placeholder") || texto.includes("loading") ||
                texto.includes("spinner") || texto.includes("1x1") || texto.includes("pixel")) continue;
            agregar(imagen);
        }
    });

    if (candidatos.length === 0) {
        return "https://via.placeholder.com/300x450/111111/ffffff?text=Sin+Portada";
    }

    candidatos.sort((a, b) => {
        const score = (u) => {
            let s = 0;
            const low = u.toLowerCase();
            if (low.includes("image.tmdb.org") || low.includes("tmdb.org")) s += 100;
            if (low.includes("poster") || low.includes("cover") || low.includes("portada")) s += 50;
            if (low.includes("/w500/") || low.includes("/w300/") || low.includes("/original/")) s += 30;
            if (low.includes(".jpg") || low.includes(".jpeg") || low.includes(".webp") || low.includes(".png")) s += 10;
            return s;
        };
        return score(b) - score(a);
    });

    return candidatos[0];
}

function extraerDescripcionHackstore(pagina) {
    // 1. Primero intentar meta tags
    const posiblesMeta = [
        pagina('meta[property="og:description"]').attr("content"),
        pagina('meta[name="description"]').attr("content"),
        pagina('meta[name="twitter:description"]').attr("content")
    ];

    for (const d of posiblesMeta) {
        if (d && d.trim().length > 40) {
            return d.trim().replace(/\s+/g, " ");
        }
    }

    // 2. Buscar en el contenido de la página (sinopsis real)
    const selectores = [
        ".description",
        ".sinopsis",
        ".synopsis",
        ".plot",
        ".entry-content p",
        ".post-content p",
        ".content p",
        "article p",
        ".movie-description",
        ".desc",
        "#description",
        ".text-content p"
    ];

    for (const selector of selectores) {
        const elementos = pagina(selector);
        if (elementos.length > 0) {
            let texto = "";
            elementos.each((_, el) => {
                const t = pagina(el).text().trim();
                if (t.length > 30) {
                    texto += t + " ";
                }
            });
            texto = texto.trim().replace(/\s+/g, " ");
            if (texto.length > 60) {
                return texto;
            }
        }
    }

    // 3. Último recurso: el primer párrafo largo que encuentre
    let mejor = "";
    pagina("p").each((_, el) => {
        const t = pagina(el).text().trim().replace(/\s+/g, " ");
        if (t.length > mejor.length && t.length > 80) {
            mejor = t;
        }
    });

    return mejor || "";
}

async function extraerReproductorHackstore(url, $pagina) {
    const candidatos = [];
    function agregar(urlEncontrada) {
        if (!urlEncontrada) return;
        try {
            const absoluta = new URL(urlEncontrada, url).toString();
            if (!candidatos.includes(absoluta)) candidatos.push(absoluta);
        } catch {}
    }

    $pagina("iframe").each((_, el) => {
        agregar($pagina(el).attr("src"));
        agregar($pagina(el).attr("data-src"));
        agregar($pagina(el).attr("data-url"));
        agregar($pagina(el).attr("data-embed"));
    });
    $pagina("embed").each((_, el) => agregar($pagina(el).attr("src")));
    $pagina("video, source").each((_, el) => {
        agregar($pagina(el).attr("src"));
        agregar($pagina(el).attr("data-src"));
    });
    $pagina("[data-player], [data-video], [data-iframe]").each((_, el) => {
        agregar($pagina(el).attr("data-player") || $pagina(el).attr("data-video") || $pagina(el).attr("data-iframe"));
    });

    const html = $pagina.html() || "";
    const regex = /https?:\/\/[^\s"'<>\\]+/gi;
    const urls = html.match(regex) || [];
    for (const encontrada of urls) {
        let limpia = encontrada.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/["'<>),]+$/g, "");
        agregar(limpia);
    }

    const prioridad = ["play.php", "/embed/", "/player/", "/embed-", "iframe", ".m3u8", ".mp4"];
    candidatos.sort((a, b) => {
        const pa = prioridad.findIndex(x => a.toLowerCase().includes(x));
        const pb = prioridad.findIndex(x => b.toLowerCase().includes(x));
        return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
    });

    for (const candidato of candidatos) {
        try {
            if (candidato.includes(".m3u8") || candidato.includes(".mp4")) return candidato;

            if (candidato.includes("play.php")) {
                const htmlPlayer = await obtenerHTML(candidato);
                const match = htmlPlayer.match(/window\.location\.href\s*=\s*["']([^"']+)/i) ||
                              htmlPlayer.match(/location\.href\s*=\s*["']([^"']+)/i);
                if (match) {
                    const siguiente = unirUrl(candidato, match[1]);
                    if (siguiente) return siguiente;
                }
                const urlsPlayer = htmlPlayer.match(regex) || [];
                for (const urlPlayer of urlsPlayer) {
                    const limpia = urlPlayer.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/["'<>),]+$/g, "");
                    if (limpia.includes(".m3u8") || limpia.includes(".mp4") || limpia.includes("/embed/") || limpia.includes("/player/")) {
                        return limpia;
                    }
                }
            }

            if (candidato.includes("/embed/") || candidato.includes("/player/") || candidato.includes("embed-")) {
                return candidato;
            }
        } catch {}
    }
    return null;
}

function extraerEpisodiosHackstore(pagina, paginaBase) {
    const episodios = [];
    const vistos = new Set();

    pagina("a[href]").each((_, elemento) => {
        let texto = pagina(elemento).text().trim().replace(/\s+/g, " ");
        texto = texto
            .replace(/\.text\s*\{[^}]*\}/gi, "")
            .replace(/font-size:[^;]+;/gi, "")
            .replace(/font-weight:[^;]+;/gi, "")
            .replace(/fill:\s*#[0-9a-f]+;/gi, "")
            .replace(/\{[^}]*\}/g, "")
            .trim();

        const match = texto.match(/(\d+\s*[x×]\s*\d+|episodio\s*\d+|ep\.?\s*\d+|capítulo\s*\d+|capitulo\s*\d+)/i);
        if (match) texto = match[0].replace(/\s+/g, "");

        if (!texto || texto.length < 2 || texto.toLowerCase().includes("disponible")) {
            const href = pagina(elemento).attr("href") || "";
            const matchHref = href.match(/(\d+[x×]\d+|episodio[-_]?\d+|ep[-_]?\d+)/i);
            if (matchHref) texto = matchHref[0].replace(/[-_]/g, " ");
            else return;
        }

        const href = pagina(elemento).attr("href");
        if (!href) return;
        const url = unirUrl(paginaBase, href);
        if (!url) return;

        const contenido = `${texto} ${url}`.toLowerCase();
        const pareceEpisodio = /episodio|episode|capitulo|capítulo|\bep\.?\s*\d+|\b\d+x\d+\b/i.test(contenido);
        if (!pareceEpisodio || vistos.has(url) || url === paginaBase) return;

        vistos.add(url);
        episodios.push({
            nombre: texto || `Episodio ${episodios.length + 1}`,
            link: url,
            video: null,
            embeds: [],
            downloads: [],
            soloTrailer: false
        });
    });
    return episodios;
}


async function procesarPaginaHackstore(link) {
    const pagina = await obtenerHackstore(link);
    const nombre = extraerTituloHackstore(pagina, link);
    const portada = extraerPortadaHackstore(pagina, link);
    const descripcion = extraerDescripcionHackstore(pagina);
    const tipo = detectarTipoHackstore(link, nombre || "");
    let reproductor = await extraerReproductorHackstore(link, pagina);

    let soloTrailer = false;
    if (esYouTube(reproductor)) {
        soloTrailer = true;
        reproductor = null;
    }

    const episodios = extraerEpisodiosHackstore(pagina, link);

    let year = null;
    let genero = null;
    pagina('script[type="application/ld+json"]').each((_, script) => {
        try {
            const raw = pagina(script).html();
            if (!raw) return;
            const data = JSON.parse(raw);
            const objetos = Array.isArray(data) ? data : (data && typeof data === "object" ? (data["@graph"] || [data]) : []);
            for (const obj of objetos) {
                if (!obj || typeof obj !== "object") continue;
                if (!year && (obj.dateCreated || obj.datePublished)) {
                    year = String(obj.dateCreated || obj.datePublished).substring(0, 4);
                }
                if (!genero && obj.genre) {
                    genero = Array.isArray(obj.genre) ? obj.genre.join(", ") : obj.genre;
                }
            }
        } catch {}
    });

    let nombreFinal = nombre || "Sin título";
    if (soloTrailer) nombreFinal = `${nombreFinal} (Solo trailer - No disponible)`;

    // Procesar solo los primeros episodios para no demorar
    const episodiosProcesados = [];
    const limiteEp = Math.min(episodios.length, 12);
    for (let i = 0; i < limiteEp; i++) {
        const ep = episodios[i];
        try {
            const epPagina = await obtenerHackstore(ep.link);
            let video = await extraerReproductorHackstore(ep.link, epPagina);
            let epSoloTrailer = false;
            if (esYouTube(video)) {
                epSoloTrailer = true;
                video = null;
            }
            episodiosProcesados.push({
                nombre: epSoloTrailer ? `${ep.nombre} (Solo trailer)` : ep.nombre,
                link: ep.link,
                video,
                embeds: video ? [{ url: video, server: "Hackstore", name: "Hackstore" }] : [],
                downloads: [],
                soloTrailer: epSoloTrailer
            });
        } catch {
            episodiosProcesados.push({ ...ep, video: null, embeds: [], downloads: [], soloTrailer: false });
        }
    }

    return {
        nombre: nombreFinal,
        titulo_original: null,
        portada,
        backdrop: null,
        descripcion,
        year,
        genero,
        tipo,
        idiomas: [],
        calidad: [],
        paises: [],
        calificacion: null,
        calificacion_comunidad: null,
        votos: null,
        fecha_estreno: null,
        duracion: null,
        certificacion: null,
        ultimo_episodio: null,
        link,
        reproductor: reproductor || null,
        embeds: reproductor ? [{ url: reproductor, server: "Hackstore", name: "Hackstore" }] : [],
        downloads: [],
        soloTrailer,
        episodios: episodiosProcesados,
        temporadas: [],
        postId: null,
        fuente: "hackstore"
    };
}

async function buscarEnHackstore(termino, seccion = null, limit = 20) {
    try {
        let url;
        if (termino) {
            url = `${HACKSTORE_BASE}/?s=${encodeURIComponent(termino)}`;
        } else {
            if (seccion === "series") url = `${HACKSTORE_BASE}/series/`;
            else if (seccion === "animes" || seccion === "anime") url = `${HACKSTORE_BASE}/animes/`;
            else url = `${HACKSTORE_BASE}/peliculas/`;
        }

        console.log(`[Hackstore] Consultando: ${url}`);
        const pagina = await obtenerHackstore(url);
        const links = new Set();

        pagina("a[href]").each((_, el) => {
            let href = pagina(el).attr("href");
            if (!href) return;
            try {
                href = unirUrl(HACKSTORE_BASE, href);
                href = limpiarUrl(href);
            } catch { return; }
            if (!href) return;

            const esPelicula = href.startsWith(HACKSTORE_BASE + "/peliculas/");
            const esSerie = href.startsWith(HACKSTORE_BASE + "/series/");
            const esAnime = href.startsWith(HACKSTORE_BASE + "/animes/");

            if (!esPelicula && !esSerie && !esAnime) return;
            if (href === limpiarUrl(HACKSTORE_BASE + "/peliculas/") ||
                href === limpiarUrl(HACKSTORE_BASE + "/series/") ||
                href === limpiarUrl(HACKSTORE_BASE + "/animes/")) return;
            if (/\/page\/\d+\/?$/.test(href)) return;

            if (!termino) {
                if (seccion === "peliculas" && !esPelicula) return;
                if (seccion === "series" && !esSerie) return;
                if ((seccion === "animes" || seccion === "anime") && !esAnime) return;
            }

            links.add(href);
        });

        const lista = Array.from(links).slice(0, limit);
        const resultados = [];

        for (let i = 0; i < lista.length; i++) {
            try {
                const item = await procesarPaginaHackstore(lista[i]);
                resultados.push(item);
                console.log(`[Hackstore ${i + 1}/${lista.length}] ${item.nombre}`);
            } catch (err) {
                console.error(`[Hackstore ERROR] ${lista[i]}:`, err.message);
            }
        }

        return resultados;
    } catch (err) {
        console.error("[Hackstore] Error general:", err.message);
        return [];
    }
}

async function buscarPlayerEnHackstorePorTitulo(nombre) {
    if (!nombre) return null;
    try {
        const limpio = String(nombre)
            .replace(/\s*\(Solo trailer.*?\)/gi, "")
            .replace(/\s*-\s*No disponible.*/gi, "")
            .trim();

        const resultados = await buscarEnHackstore(limpio, null, 5);
        if (!resultados.length) return null;

        const nombreLower = limpio.toLowerCase();
        let mejor = resultados.find(r => 
            (r.nombre || "").toLowerCase().includes(nombreLower) || 
            nombreLower.includes((r.nombre || "").toLowerCase())
        );
        if (!mejor) mejor = resultados[0];
        
        if (mejor) {
            console.log(`[Hackstore] Título encontrado: ${mejor.nombre}`);
            console.log(`[Hackstore] Player encontrado: ${mejor.reproductor}`);
            console.log(`[Hackstore] Embeds:`, mejor.embeds);
            console.log(`[Hackstore] ¿Es válido?:`, esReproductorValido(mejor.reproductor));
        }
        
        if (mejor && esReproductorValido(mejor.reproductor)) {
            return mejor;
        }

        if (mejor && Array.isArray(mejor.episodios)) {
            const epConVideo = mejor.episodios.find(e => esReproductorValido(e.video));
            if (epConVideo) return mejor;
        }
        return null;
    } catch (err) {
        console.error("[Hackstore] Error buscando player por título:", err.message);
        return null;
    }
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
    const q = encodeURIComponent(String(query).trim());
    const url = `${API}/search?postType=any&q=${q}&postsPerPage=${perPage}`;
    const data = await apiGet(url);
    let posts = data?.data?.posts || data?.data || [];
    if (!Array.isArray(posts)) posts = [];
    return posts.map(formatItem);
}




function detectarServerDesdeUrl(url, fallback) {
    if (!url) return fallback || "Servidor";
    const u = String(url).toLowerCase();

    if (u.includes("vimeos.net") || u.includes("player.vimeos")) return "MovieZone";

    const mapa = [
        ["goodstream", "GoodstreamOne"],
        ["streamwish", "StreamWish"],
        ["filemoon", "Filemoon"],
        ["voe", "Voe"],
        ["doodstream", "Doodstream"],
        ["dood", "Doodstream"],
        ["streamtape", "Streamtape"],
        ["mixdrop", "Mixdrop"],
        ["upstream", "Upstream"],
        ["vidmoly", "Vidmoly"],
        ["mp4upload", "Mp4Upload"],
        ["ok.ru", "OK"],
        ["youtube", "YouTube"],
        ["youtu.be", "YouTube"],
        ["mediafire", "Mediafire"],
        ["mega.nz", "Mega"],
        ["mega.co", "Mega"],
        ["drive.google", "Google Drive"],
        ["pixeldrain", "Pixeldrain"],
        ["1fichier", "1Fichier"],
        ["yourupload", "YourUpload"],
        ["uqload", "Uqload"],
        ["vidhide", "Vidhide"],
        ["lulustream", "LuluStream"],
        ["filelions", "FileLions"],
        ["vidguard", "Vidguard"],
        ["netu", "Netu"],
        ["hqq", "Netu"],
        ["waaw", "Netu"],
        ["krakenfiles", "Krakenfiles"],
        ["supervideo", "SuperVideo"]
    ];

    for (const [k, n] of mapa) {
        if (u.includes(k)) return n;
    }

    if (fallback && !/^online$/i.test(String(fallback)) && !/^servidor/i.test(String(fallback))) {
        return String(fallback);
    }

    try {
        const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
        if (host) return host.charAt(0).toUpperCase() + host.slice(1);
    } catch {}

    return "Servidor";
}

function normalizarEmbed(e) {
    if (!e) return null;
    const url = e.url || e.link || e.src || null;
    if (!url) return null;
    const server = detectarServerDesdeUrl(url, e.server || e.name || e.host || e.provider);
    return {
        url,
        server,
        name: server,
        lang: e.lang || e.language || e.idioma || e.audio || null,
        quality: e.quality || e.calidad || e.resolution || null,
        size: e.size || null
    };
}

function normalizarDownload(d) {
    if (!d) return null;
    if (typeof d === "string") {
        const server = detectarServerDesdeUrl(d, null);
        return { url: d, server, name: server, lang: null, quality: null, size: null };
    }
    const url = d.url || d.link || d.href || null;
    if (!url) return null;
    const server = detectarServerDesdeUrl(url, d.server || d.name || d.host || d.provider);
    return {
        url,
        server,
        name: server,
        lang: d.lang || d.language || d.idioma || null,
        quality: d.quality || d.calidad || null,
        size: d.size || d.filesize || null
    };
}

async function getPlayer(postId) {
    try {
        const url = `${API}/player?postId=${postId}&demo=0`;
        const data = await apiGet(url);
        let embeds = data?.data?.embeds || [];
        let downloads = data?.data?.downloads || [];

        // También revisar otras posibles claves de la API
        if ((!embeds || embeds.length === 0) && data?.data) {
            const d = data.data;
            const extras = [].concat(d.players || [], d.servers || [], d.sources || [], d.links || []);
            if (extras.length) embeds = extras;
        }

        embeds = embeds.map(normalizarEmbed).filter(Boolean);
        downloads = downloads.map(normalizarDownload).filter(Boolean);

        // Filtrar placeholders de Lamovie y YouTube (no sirven para reproducir)
        const embedsValidos = embeds.filter(e => e.url && esReproductorValido(e.url));
        const embedsInvalidos = embeds.filter(e => e.url && !esReproductorValido(e.url));

        // Si solo hay placeholders, intentar extraer iframes reales de la página embed de Lamovie
        if (embedsValidos.length === 0 && embedsInvalidos.length > 0) {
            for (const inv of embedsInvalidos.slice(0, 2)) {
                try {
                    if (!inv.url || !String(inv.url).includes("lamovie")) continue;
                    const html = await obtenerHTML(inv.url);
                    const $ = cheerio.load(html);
                    $("iframe, embed, video source, video").each((_, el) => {
                        const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-url");
                        if (src && esReproductorValido(src)) {
                            embedsValidos.push(normalizarEmbed({ url: src, server: "Lamovie-resolved" }));
                        }
                    });
                    // Buscar URLs de servidores conocidos en el HTML
                    const urls = String(html).match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
                    for (const u of urls) {
                        const limpia = u.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/["'<>),]+$/g, "");
                        if (esReproductorValido(limpia) && !embedsValidos.some(e => e.url === limpia)) {
                            // Solo dominios de streaming conocidos
                            const host = limpia.toLowerCase();
                            if (/vimeos|dood|streamtape|voe|filemoon|mixdrop|streamwish|vidmoly|uqload|goodstream|upstream|mp4upload|vidhide|vidguard/.test(host)) {
                                embedsValidos.push(normalizarEmbed({ url: limpia }));
                            }
                        }
                    }
                } catch (err) {
                    console.error("[getPlayer] Error resolviendo embed Lamovie:", err.message);
                }
            }
        }

        // Usar solo embeds válidos si hay; si no, dejar los originales (para diagnóstico)
        embeds = embedsValidos.length > 0 ? embedsValidos : embeds.filter(e => e.url && !esYouTube(e.url));

        // Vimeo / MovieZone primero
        embeds.sort((a, b) => {
            const aV = /vimeos/i.test(a.url || "") || a.server === "MovieZone" || a.name === "MovieZone";
            const bV = /vimeos/i.test(b.url || "") || b.server === "MovieZone" || b.name === "MovieZone";
            if (aV && !bV) return -1;
            if (!aV && bV) return 1;
            return 0;
        });

        let reproductor = null;
        for (const e of embeds) {
            if (e.url && esReproductorValido(e.url)) {
                reproductor = e.url;
                break;
            }
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

// Construye siempre un link de Lamovie (aunque en DB esté el de Hackstore)
function linkLamovieDeItem(item) {
    if (item.link && String(item.link).includes("lamovie")) return item.link;
    if (item.linkLamovie && String(item.linkLamovie).includes("lamovie")) return item.linkLamovie;
    const slug = item.slug || null;
    if (slug) {
        if (item.tipo === "Anime") return `${BASE}/animes/${slug}/`;
        if (item.tipo === "Serie") return `${BASE}/series/${slug}/`;
        return `${BASE}/peliculas/${slug}/`;
    }
    if (item.link) {
        const m = String(item.link).match(/\/(?:animes|series|peliculas|anime|serie)\/([^\/\?]+)/i);
        if (m) {
            const s = m[1].replace(/\/$/, "");
            if (item.tipo === "Anime") return `${BASE}/animes/${s}/`;
            if (item.tipo === "Serie") return `${BASE}/series/${s}/`;
            return `${BASE}/peliculas/${s}/`;
        }
    }
    return null;
}

// Extrae embeds reales scrapeando la página HTML de Lamovie (cuando la API solo da placeholder)
async function scrapearPlayersDesdePagina(pageUrl) {
    const encontrados = [];
    if (!pageUrl) return encontrados;
    try {
        const html = await obtenerHTML(pageUrl);
        const $ = cheerio.load(html);

        $("iframe, embed, video source, video").each((_, el) => {
            const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-url") || $(el).attr("data-lazy-src");
            if (src && esReproductorValido(src)) {
                encontrados.push(normalizarEmbed({ url: unirUrl(pageUrl, src) || src }));
            }
        });

        // data-player / botones de servidor
        $("[data-player], [data-video], [data-embed], [data-src], [data-url]").each((_, el) => {
            const src = $(el).attr("data-player") || $(el).attr("data-video") || $(el).attr("data-embed") || $(el).attr("data-src") || $(el).attr("data-url");
            if (src && esReproductorValido(src)) {
                encontrados.push(normalizarEmbed({ url: unirUrl(pageUrl, src) || src }));
            }
        });

        // URLs de servidores conocidos en el HTML/JSON embebido
        const urls = String(html).match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
        for (const u of urls) {
            const limpia = u.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/["'<>),;]+$/g, "");
            if (!esReproductorValido(limpia)) continue;
            const host = limpia.toLowerCase();
            if (/vimeos|dood|streamtape|voe\.|filemoon|mixdrop|streamwish|vidmoly|uqload|goodstream|upstream|mp4upload|vidhide|vidguard|yourupload|lulustream|filelions|netu|waaw|hqq/.test(host)) {
                if (!encontrados.some(e => e.url === limpia)) {
                    encontrados.push(normalizarEmbed({ url: limpia }));
                }
            }
        }

        // Ordenar vimeos primero
        encontrados.sort((a, b) => {
            const aV = /vimeos/i.test(a.url || "");
            const bV = /vimeos/i.test(b.url || "");
            return (bV ? 1 : 0) - (aV ? 1 : 0);
        });
    } catch (err) {
        console.error("[Scrape Lamovie] Error:", err.message);
    }
    return encontrados;
}

// ======================================================
// ¿El item ya tiene contenido válido guardado?
// ======================================================
function itemTieneContenidoValido(item) {
    if (!item) return false;

    const embedsValidos = Array.isArray(item.embeds)
        ? item.embeds.filter(e => e && e.url && esReproductorValido(e.url))
        : [];
    const reproductorValido = item.reproductor && esReproductorValido(item.reproductor);

    // Series / Anime: válido si tiene episodios con video
    if (item.tipo === "Serie" || item.tipo === "Anime") {
        const episodiosConVideo = Array.isArray(item.episodios) && item.episodios.some(ep => {
            const videoOk = ep.video && esReproductorValido(ep.video);
            const embedsOk = Array.isArray(ep.embeds) && ep.embeds.some(e => e && e.url && esReproductorValido(e.url));
            return videoOk || embedsOk;
        });
        return episodiosConVideo || reproductorValido || embedsValidos.length > 0;
    }

    // Películas: válido si tiene reproductor o embeds
    return reproductorValido || embedsValidos.length > 0;
}

async function enriquecerItem(item) {
    if (!item.postId && !item.fuente) return item;

    // Si ya viene de Hackstore, no hace falta enriquecer más
    if (item.fuente === "hackstore") return item;

    if (item.postId) {
        // Obtener reproductor y descargas del título principal (Lamovie API)
        const playerData = await getPlayer(item.postId);
        item.reproductor = playerData.reproductor;
        item.downloads = playerData.downloads || [];
        item.embeds = playerData.embeds || [];

        // Link real de Lamovie (nunca scrapear hackstore como si fuera Lamovie)
        const linkLamovie = linkLamovieDeItem(item);
        if (linkLamovie && (!item.link || !String(item.link).includes("lamovie"))) {
            // Preferir link de Lamovie en memoria (sin borrar el original si hacía falta)
            item.linkLamovie = linkLamovie;
        }

        // Si la API solo dio placeholder, scrapear la página HTML de Lamovie
        const apiSinValidos = !item.reproductor || !esReproductorValido(item.reproductor);
        const embedsApiValidos = Array.isArray(item.embeds)
            ? item.embeds.filter(e => e && e.url && esReproductorValido(e.url))
            : [];
        if (apiSinValidos && embedsApiValidos.length === 0 && linkLamovie) {
            console.log(`[Scrape] API sin player válido → scrapeando página Lamovie: ${linkLamovie}`);
            const scraped = await scrapearPlayersDesdePagina(linkLamovie);
            if (scraped.length > 0) {
                item.embeds = scraped;
                item.reproductor = scraped[0].url;
                item.soloTrailer = false;
                console.log(`[Scrape] Encontrados ${scraped.length} embeds en la página de Lamovie`);
            }
        }

        if (item.reproductor && (item.reproductor.includes("youtube.com") || item.reproductor.includes("youtu.be"))) {
            item.soloTrailer = true;
            if (item.nombre && !item.nombre.includes("Solo trailer")) {
                item.nombre = `${item.nombre} (Solo trailer - No disponible)`;
            }
        }

        // Si es serie o anime → cargar temporadas y episodios
        if (item.tipo === "Serie" || item.tipo === "Anime") {
            // Primero pedir temporada 1 para saber la lista de temporadas
            let epData = await getEpisodes(item.postId, 1);
            let seasons = epData.seasons || [];
            if (!seasons.length) seasons = [1];
            seasons = [...new Set(seasons.map(s => parseInt(s)).filter(n => !isNaN(n)))].sort((a, b) => a - b);
            // Si la API dice "3" como número de temporadas en vez de array [1,2,3]
            if (seasons.length === 1 && seasons[0] > 1 && seasons[0] <= 30) {
                const total = seasons[0];
                seasons = Array.from({ length: total }, (_, i) => i + 1);
            }

            item.temporadas = seasons;
            item.episodios = [];

            // Recorrer temporadas hasta reunir episodios (máx 40 en total)
            const MAX_EPS = 40;
            for (const seasonNum of seasons) {
                if (item.episodios.length >= MAX_EPS) break;
                const dataTemp = seasonNum === 1 ? epData : await getEpisodes(item.postId, seasonNum);
                const posts = dataTemp.posts || [];
                console.log(`[Episodios] ${item.nombre} T${seasonNum}: ${posts.length} eps`);

                for (const ep of posts) {
                    if (item.episodios.length >= MAX_EPS) break;
                    let epPlayer = await getPlayer(ep._id);

                    const epSinValido = !epPlayer.reproductor || !esReproductorValido(epPlayer.reproductor);
                    const epEmbedsOk = Array.isArray(epPlayer.embeds) && epPlayer.embeds.some(e => e && e.url && esReproductorValido(e.url));
                    if (epSinValido && !epEmbedsOk && linkLamovie && ep.slug) {
                        const epUrl = `${linkLamovie.replace(/\/?$/, "/")}${ep.slug}/`;
                        const scrapedEp = await scrapearPlayersDesdePagina(epUrl);
                        if (scrapedEp.length > 0) {
                            epPlayer = {
                                reproductor: scrapedEp[0].url,
                                embeds: scrapedEp,
                                downloads: epPlayer.downloads || []
                            };
                        }
                    }

                    item.episodios.push({
                        id: ep._id,
                        nombre: ep.title || `T${ep.season_number || seasonNum}E${String(ep.episode_number || item.episodios.length + 1).padStart(2, "0")}`,
                        season: ep.season_number || seasonNum,
                        episode: ep.episode_number || null,
                        video: epPlayer.reproductor || null,
                        embeds: epPlayer.embeds || [],
                        downloads: epPlayer.downloads || [],
                        soloTrailer: epPlayer.reproductor
                            ? (epPlayer.reproductor.includes("youtube") || epPlayer.reproductor.includes("youtu.be"))
                            : false
                    });
                }
            }
            console.log(`[Episodios] ${item.nombre}: total ${item.episodios.length} eps cargados, temporadas: ${seasons.join(",")}`);
        }
    } else {
        const linkLamovie = linkLamovieDeItem(item);
        if (linkLamovie) {
            const scraped = await scrapearPlayersDesdePagina(linkLamovie);
            if (scraped.length > 0) {
                item.embeds = scraped;
                item.reproductor = scraped[0].url;
            }
        }
    }

    // ======================================================
    // FALLBACK A HACKSTORE
    // Orden correcto: 1º Lamovie → 2º Hackstore (solo si Lamovie no tiene nada válido)
    // Para Series/Anime también se consideran los episodios.
    // ======================================================

    // Embeds válidos del título principal
    const embedsValidos = Array.isArray(item.embeds)
        ? item.embeds.filter(e => e && e.url && esReproductorValido(e.url))
        : [];

    const reproductorValido = item.reproductor && esReproductorValido(item.reproductor);

    // En series/anime: ¿algún episodio tiene player/embeds válidos de Lamovie?
    let episodiosConVideo = false;
    if ((item.tipo === "Serie" || item.tipo === "Anime") && Array.isArray(item.episodios)) {
        episodiosConVideo = item.episodios.some(ep => {
            const videoOk = ep.video && esReproductorValido(ep.video);
            const embedsOk = Array.isArray(ep.embeds) && ep.embeds.some(e => e && e.url && esReproductorValido(e.url));
            return videoOk || embedsOk;
        });
    }

    // Log de diagnóstico
    console.log(`[Diagnóstico] "${item.nombre}" → reproductor: ${item.reproductor ? item.reproductor.substring(0, 80) : "null"} | embeds: ${Array.isArray(item.embeds) ? item.embeds.length : 0} | embedsValidos: ${embedsValidos.length} | episodiosConVideo: ${episodiosConVideo}`);

    // Solo es "malo" si NO hay nada válido ni en el título ni en los episodios
    const playerMalo = !reproductorValido && embedsValidos.length === 0 && !episodiosConVideo;

    if (playerMalo && item.nombre) {
        console.log(`[Fallback] Lamovie no trajo player válido para "${item.nombre}". Buscando en Hackstore...`);
        try {
            const alternativo = await buscarPlayerEnHackstorePorTitulo(item.nombre);
            if (alternativo && esReproductorValido(alternativo.reproductor)) {
                console.log(`[Fallback] ¡Encontrado player bueno en Hackstore para "${item.nombre}"!`);
                item.reproductor = alternativo.reproductor;
                item.embeds = alternativo.embeds || [{ url: alternativo.reproductor, server: "Hackstore", name: "Hackstore" }];
                item.soloTrailer = false;
                item.nombre = item.nombre
                    .replace(/\s*\(Solo trailer.*?\)/gi, "")
                    .replace(/\s*-\s*No disponible.*/gi, "")
                    .trim();
                if ((item.tipo === "Serie" || item.tipo === "Anime") && Array.isArray(alternativo.episodios) && alternativo.episodios.length > 0) {
                    item.episodios = alternativo.episodios;
                }
                item.fuente = "hackstore-fallback";
            } else {
                console.log(`[Fallback] Hackstore tampoco tiene player válido para "${item.nombre}". Se mantienen datos de Lamovie.`);
            }
        } catch (err) {
            console.error("[Fallback] Error buscando alternativa en Hackstore:", err.message);
        }
    } else {
        // Lamovie ya trajo algo bueno (título o episodios) → lo usamos
        if (embedsValidos.length > 0 && !reproductorValido) {
            item.reproductor = embedsValidos[0].url;
        }
        console.log(`[Lamovie] Contenido válido para "${item.nombre}" (embeds: ${embedsValidos.length}, episodiosConVideo: ${episodiosConVideo}). No se busca en Hackstore.`);
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

    // 1. PRIMERO: Supabase (fuente de verdad)
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
            await setCache(cacheKey, pagina); // opcional: actualizar caché
            return pagina;
        }
    }

    // 1b. Búsqueda local en Supabase (soporta varias palabras
    /*
    if (termino && moviesDB.length > 0) {
        const palabras = termino.toLowerCase().trim().split(/\s+/).filter(Boolean);

        const filtrados = moviesDB.filter(item => {
            const texto = `${item.nombre || ""} ${item.titulo_original || ""}`.toLowerCase();
            return palabras.every(p => texto.includes(p));
        });

        if (filtrados.length > 0) {
            console.log(`Búsqueda local Supabase: ${filtrados.length} resultados para "${termino}"`);
            const pagina = filtrados.slice(0, limit);
            await setCache(cacheKey, pagina);
            return pagina;
        }
    }*/

    // 2. SEGUNDO: Caché temporal (solo si Supabase no tenía datos)
    if (!termino) {
        const cached = await getCache(cacheKey);
        if (cached) {
            console.log("Cache hit (tmp):", cacheKey);
            return cached;
        }
    }

    // 3. TERCERO: API de Lamovie
    console.log("Cache miss + Supabase vacío o búsqueda → usando API de Lamovie...");

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

        // Enriquecer primeros (incluye fallback a Hackstore si el player es de "lamovie")
        const limiteEnriquecer = Math.min(resultados.length, 8);
        for (let i = 0; i < limiteEnriquecer; i++) {
            try {
                resultados[i] = await enriquecerItem(resultados[i]);
                console.log(`[Lamovie ${i + 1}/${limiteEnriquecer}] ${resultados[i].nombre}`);
            } catch (err) {
                console.error(`Error enriqueciendo ${resultados[i]?.nombre}:`, err.message);
            }
        }

        // Guardar enriquecidos en Supabase
        const enriquecidos = resultados.filter(r =>
            r && r.link && (
                r.reproductor ||
                (Array.isArray(r.embeds) && r.embeds.length > 0) ||
                (Array.isArray(r.episodios) && r.episodios.length > 0)
            )
        );
        if (enriquecidos.length > 0) {
            await guardarEnSupabase(enriquecidos);
        }
        
    } catch (err) {
        console.error("Error en buscar (Lamovie):", err.message);
    }

   // 4. También buscar en Hackstore (para completar resultados)
let resultadosHackstore = [];
try {
    const seccionHack = seccion === "series" ? "series"
                      : (seccion === "animes" || seccion === "anime") ? "animes"
                      : "peliculas";
    resultadosHackstore = await buscarEnHackstore(termino, seccionHack, limit);
} catch (err) {
    console.error("Error en buscar (Hackstore):", err.message);
}

// 5. Combinar resultados evitando duplicados (prioridad a Lamovie)
// Clave = título normalizado + año (exacta). No mezcla películas distintas.
function normalizarTitulo(titulo) {
    return String(titulo || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\(.*?\)/g, "")
        .replace(/\[.*?\]/g, "")
        .replace(/\b(19|20)\d{2}\b/g, "")
        .replace(/[:\-–—_|]/g, " ")
        .replace(/\b(the|el|la|los|las|un|una|a|an)\b/g, " ")
        .replace(/[^a-z0-9\s]/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extraerAnio(item) {
    if (item.year) return String(item.year).substring(0, 4);
    const m = String(item.nombre || "").match(/\b((?:19|20)\d{2})\b/);
    return m ? m[1] : "";
}

function claveDedup(item) {
    const titulo = normalizarTitulo(item.nombre);
    if (!titulo) return "";
    const anio = extraerAnio(item);
    return anio ? `${titulo}|${anio}` : titulo;
}

function claveTitulo(item) {
    return normalizarTitulo(item.nombre);
}

function scoreItem(item) {
    let s = 0;
    if (Array.isArray(item.episodios)) s += item.episodios.length * 10;
    if (item.reproductor && esReproductorValido(item.reproductor)) s += 50;
    if (Array.isArray(item.embeds)) {
        s += item.embeds.filter(e => e && e.url && esReproductorValido(e.url)).length * 5;
    }
    if (item.calificacion) s += Number(item.calificacion) || 0;
    if (item.portada) s += 2;
    if (item.descripcion) s += 1;
    return s;
}

const vistos = new Set();
const vistosTitulo = new Map(); // titulo normalizado → índice en resultadosFinales
const resultadosFinales = [];

function agregarSinDuplicar(item) {
    const key = claveDedup(item);
    const tituloKey = claveTitulo(item);
    if (!key && !tituloKey) return false;

    // Misma clave exacta titulo|año
    if (key && vistos.has(key)) return false;

    // Mismo título aunque falte el año → quedarse con el de más score
    if (tituloKey && vistosTitulo.has(tituloKey)) {
        const idx = vistosTitulo.get(tituloKey);
        const actual = resultadosFinales[idx];
        if (scoreItem(item) > scoreItem(actual)) {
            resultadosFinales[idx] = item;
            if (key) vistos.add(key);
        }
        return false;
    }

    if (key) vistos.add(key);
    if (tituloKey) vistosTitulo.set(tituloKey, resultadosFinales.length);
    resultadosFinales.push(item);
    return true;
}

// Primero los de Lamovie (tienen prioridad)
for (const item of resultados) {
    agregarSinDuplicar(item);
}

// Luego los de Hackstore que no estén ya
for (const item of resultadosHackstore) {
    agregarSinDuplicar(item);
}

// Por último, lo que ya teníamos guardado en Supabase para este término
if (termino) {
    const palabras = termino.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const enSupabase = moviesDB.filter(item => {
        const texto = `${item.nombre || ""} ${item.titulo_original || ""}`.toLowerCase();
        return palabras.every(p => texto.includes(p));
    });
    for (const item of enSupabase) {
        agregarSinDuplicar(item);
    }
}

resultados = resultadosFinales;
    

// Guardar todo lo nuevo
if (resultados.length > 0) {
    await guardarEnSupabase(resultados);
}

// Solo cachear si NO es una búsqueda
if (!termino) {
    await setCache(cacheKey, resultados);
}

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
        const force = req.query.force === "1" || req.query.force === "true";

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

        // --------------------------------------------------
        // CACHÉ INTELIGENTE (por sesión de Render)
        // - Series/Anime: se refrescan UNA vez por arranque del servidor
        //   (primera vez que entras tras despertar → refresh; si vuelves a entrar → Supabase)
        // - Películas: si ya tienen player válido → solo Supabase
        // - force=1 → forzar re-enriquecimiento
        // --------------------------------------------------
        const esSerieOAnime = item.tipo === "Serie" || item.tipo === "Anime";
        const yaValido = itemTieneContenidoValido(item);
        const sessionKey = String(item.postId || item.link || item.nombre || "");
        const yaRefrescadoEstaSesion = sessionKey && refreshedThisSession.has(sessionKey);

        // Película con player válido → caché
        if (!esSerieOAnime && yaValido && !force) {
            console.log(`[Cache] Película desde Supabase: "${item.nombre}"`);
            return res.json(item);
        }

        // Serie/Anime ya refrescada en esta sesión y con contenido válido → caché
        if (esSerieOAnime && yaValido && yaRefrescadoEstaSesion && !force) {
            console.log(`[Cache] Serie/Anime desde Supabase (ya refrescada esta sesión): "${item.nombre}"`);
            return res.json(item);
        }

        if (esSerieOAnime && !yaRefrescadoEstaSesion) {
            console.log(`[Refresh] Primera vez esta sesión → refrescando serie/anime: "${item.nombre}"`);
        } else if (force) {
            console.log(`[Force] Re-enriqueciendo forzado: "${item.nombre}"`);
        } else {
            console.log(`[Enrich] Sin contenido válido → enriqueciendo: "${item.nombre}"`);
        }

        // Enriquecer (Lamovie → Hackstore si hace falta)
        const enriquecido = await enriquecerItem({ ...item, postId: item.postId || postId });

        // Guardamos la versión completa en Supabase
        await guardarEnSupabase([enriquecido]);

        // Marcar como refrescado en esta sesión (series/anime)
        if (esSerieOAnime && sessionKey) {
            refreshedThisSession.add(sessionKey);
            // También por el postId del enriquecido por si cambió
            if (enriquecido.postId) refreshedThisSession.add(String(enriquecido.postId));
            if (enriquecido.link) refreshedThisSession.add(String(enriquecido.link));
        }

        // Invalidar cachés de listado para que el grid se actualice
        try {
            const files = await fs.readdir(CACHE_DIR);
            await Promise.all(
                files
                    .filter(f => f.startsWith("peliculas_") || f.startsWith("series_") || f.startsWith("animes_"))
                    .map(f => fs.unlink(path.join(CACHE_DIR, f)))
            );
            console.log("Cachés de listado invalidadas");
        } catch (err) {
            // no pasa nada si falla
        }

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

        // --------------------------------------------------
        // Al despertar Render: refrescar items SIN contenido válido
        // - Películas sin player
        // - Series/Anime sin episodios/player (detectar temporadas/episodios nuevos)
        // Máximo 8 en total, en segundo plano.
        // Los que YA tienen contenido válido no se tocan.
        // --------------------------------------------------
        setTimeout(async () => {
            try {
                const pendientes = moviesDB
                    .filter(m => !itemTieneContenidoValido(m))
                    .slice(0, 8);

                if (pendientes.length === 0) {
                    console.log("[Startup] No hay items pendientes de player/episodios. Nada que refrescar.");
                    return;
                }

                console.log(`[Startup] Refrescando ${pendientes.length} items sin contenido válido (pelis/series/anime)...`);
                for (const item of pendientes) {
                    try {
                        const actualizado = await enriquecerItem({ ...item });
                        await guardarEnSupabase([actualizado]);
                        console.log(`[Startup] Actualizado: ${actualizado.nombre} (${actualizado.tipo || "Película"})`);
                    } catch (err) {
                        console.error(`[Startup] Error con ${item.nombre}:`, err.message);
                    }
                }
                console.log("[Startup] Refresco de items incompletos terminado.");
            } catch (err) {
                console.error("[Startup] Error en refresco:", err.message);
            }
        }, 5000); // espera 5s después de arrancar
    }
);
