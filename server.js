const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs").promises;
const app = express();
const PORT = process.env.PORT || 3000;
const BASE =
    process.env.SOURCE_URL ||
    "https://www.hackstore.fo";
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
let knownLinks = new Set();

async function cargarDatosGitHub() {
    if (!GITHUB_DATA_URL) {
        console.log("GITHUB_DATA_URL no configurada");
        return;
    }
    try {
        const res = await session.get(GITHUB_DATA_URL, { timeout: 10000 });
        const data = Array.isArray(res.data) ? res.data : [];
        knownLinks = new Set(data.map(item => item.link).filter(Boolean));
        console.log(`GitHub: ${knownLinks.size} items conocidos cargados`);
    } catch (err) {
        console.error("No se pudo cargar JSON de GitHub:", err.message);
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

async function enviarNuevosATelegram(items) {
    if (!items || items.length === 0) return;

    const nuevos = items.filter(item => item.link && !knownLinks.has(item.link));
    if (nuevos.length === 0) {
        console.log("No hay items nuevos para Telegram");
        return;
    }

    // Actualizamos el set local para no reenviar en esta sesión
    nuevos.forEach(item => knownLinks.add(item.link));

    // Función para escapar HTML de Telegram
    function escapeHtml(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    // Enviamos de 8 en 8 para no pasarnos del límite de 4096 caracteres
    const TAMANO_LOTE = 8;

    for (let i = 0; i < nuevos.length; i += TAMANO_LOTE) {
        const lote = nuevos.slice(i, i + TAMANO_LOTE);

        let mensaje = `🎬 <b>${lote.length} nuevo(s) detectado(s)</b> (${i + 1}-${Math.min(i + TAMANO_LOTE, nuevos.length)} de ${nuevos.length})\n\n`;

        for (const item of lote) {
            mensaje += `<b>${escapeHtml(item.nombre || "Sin título")}</b>\n`;
            mensaje += `Tipo: ${escapeHtml(item.tipo || "?")}\n`;
            if (item.soloTrailer) mensaje += `⚠️ Solo trailer (YouTube)\n`;
            if (item.reproductor) mensaje += `▶ ${escapeHtml(item.reproductor)}\n`;
            if (item.portada) mensaje += `🖼 ${escapeHtml(item.portada)}\n`;
            mensaje += `Link: ${escapeHtml(item.link)}\n`;
            mensaje += `────────────────\n`;
        }

        // Si por alguna razón todavía es demasiado largo, lo cortamos
        if (mensaje.length > 4000) {
            mensaje = mensaje.substring(0, 4000) + "\n...(mensaje recortado)";
        }

        await enviarTelegram(mensaje);

        // Pequeña pausa para no saturar la API de Telegram
        if (i + TAMANO_LOTE < nuevos.length) {
            await new Promise(r => setTimeout(r, 600));
        }
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
function extraerEpisodios(
    pagina,
    paginaBase
) {
    const episodios = [];
    const vistos = new Set();
    pagina("a[href]").each(
        (_, elemento) => {
            const texto =
                pagina(elemento)
                    .text()
                    .trim()
                    .replace(/\s+/g, " ");
            const href =
                pagina(elemento)
                    .attr("href");
            if (!href) return;
            const url =
                unirUrl(
                    paginaBase,
                    href
                );
            if (!url) return;
            const contenido =
                `${texto} ${url}`
                    .toLowerCase();
            const pareceEpisodio =
                /episodio|episode|capitulo|capítulo|\bep\.?\s*\d+|\b\d+x\d+\b/i
                    .test(contenido);
            if (!pareceEpisodio) {
                return;
            }
            if (vistos.has(url)) {
                return;
            }
            if (url === paginaBase) {
                return;
            }
            vistos.add(url);
            episodios.push({
                nombre:
                    texto ||
                    `Episodio ${
                        episodios.length + 1
                    }`,
                link: url,
                video: null
            });
        }
    );
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
async function buscar(
    termino,
    seccion = null
) {
    // Generar clave de cache
    let cacheKey;
    if (termino) {
        cacheKey = "search_" + termino.toLowerCase().trim().replace(/\s+/g, "_");
    } else {
        cacheKey = seccion || "peliculas";
    }

    // Intentar leer del cache
    const cached = await getCache(cacheKey);
    if (cached) {
        console.log("Cache hit:", cacheKey);
        return cached;
    }

    console.log("Cache miss:", cacheKey);

    let url;
    if (termino) {
        url =
            BASE +
            "/?s=" +
            encodeURIComponent(
                termino
            );
    } else {
        if (seccion === "series") {
            url =
                BASE +
                "/series/";
        } else if (
            seccion === "animes"
        ) {
            url =
                BASE +
                "/animes/";
        } else {
            url =
                BASE +
                "/peliculas/";
        }
    }
    console.log(
        "Consultando:",
        url
    );
    const pagina =
        await obtener(url);
    const links =
        new Set();
    pagina("a[href]").each(
        (_, elemento) => {
            let href =
                pagina(elemento)
                    .attr("href");
            if (!href) return;
            try {
                href =
                    unirUrl(
                        BASE,
                        href
                    );
                href =
                    limpiarUrl(
                        href
                    );
            } catch {
                return;
            }
            if (!href) return;
            const esPelicula =
                href.startsWith(
                    BASE +
                    "/peliculas/"
                );
            const esSerie =
                href.startsWith(
                    BASE +
                    "/series/"
                );
            const esAnime =
                href.startsWith(
                    BASE +
                    "/animes/"
                );
            if (
                !esPelicula &&
                !esSerie &&
                !esAnime
            ) {
                return;
            }
            if (
                href ===
                    limpiarUrl(
                        BASE +
                        "/peliculas/"
                    ) ||
                href ===
                    limpiarUrl(
                        BASE +
                        "/series/"
                    ) ||
                href ===
                    limpiarUrl(
                        BASE +
                        "/animes/"
                    )
            ) {
                return;
            }
            if (
                /\/page\/\d+\/?$/.test(
                    href
                )
            ) {
                return;
            }
            if (
                !termino &&
                seccion === "peliculas" &&
                !esPelicula
            ) {
                return;
            }
            if (
                !termino &&
                seccion === "series" &&
                !esSerie
            ) {
                return;
            }
            if (
                !termino &&
                seccion === "animes" &&
                !esAnime
            ) {
                return;
            }
            links.add(href);
        }
    );
    const lista =
        Array.from(links).sort();
    const resultados = [];
    const limite =
        Math.min(
            lista.length,
            30
        );
    for (
        let i = 0;
        i < limite;
        i++
    ) {
        try {
            let item =
                await procesarPagina(
                    lista[i]
                );
            if (
                item.tipo === "Serie" ||
                item.tipo === "Anime"
            ) {
                item =
                    await procesarEpisodios(
                        item
                    );
            }
            resultados.push(item);
            console.log(
                `[${i + 1}/${limite}] ${
                    item.nombre ||
                    lista[i]
                }`
            );
        } catch (error) {
            console.error(
                `[ERROR] ${lista[i]}`,
                error.message
            );
        }
    }

    // Guardar en cache temporal
    await setCache(cacheKey, resultados);

    // Enviar solo los nuevos a Telegram
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
app.get(
    "/api/catalogo",
    async (req, res) => {
        try {
            const resultados =
                await buscar(
                    "",
                    "peliculas"
                );
            res.json({
                resultados
            });
        } catch (error) {
            console.error(error);
            await enviarTelegram(`⚠️ Error en /api/catalogo\n${error.message}`);
            res
                .status(500)
                .json({
                    error:
                        "No se pudo cargar el catálogo",
                    detalle:
                        error.message
                });
        }
    }
);
// ======================================================
// SERIES
// ======================================================
app.get(
    "/api/series",
    async (req, res) => {
        try {
            const resultados =
                await buscar(
                    "",
                    "series"
                );
            res.json({
                resultados
            });
        } catch (error) {
            console.error(error);
            await enviarTelegram(`⚠️ Error en /api/series\n${error.message}`);
            res
                .status(500)
                .json({
                    error:
                        "No se pudieron cargar las series",
                    detalle:
                        error.message
                });
        }
    }
);
// ======================================================
// ANIME
// ======================================================
app.get(
    "/api/animes",
    async (req, res) => {
        try {
            const resultados =
                await buscar(
                    "",
                    "animes"
                );
            res.json({
                resultados
            });
        } catch (error) {
            console.error(error);
            await enviarTelegram(`⚠️ Error en /api/animes\n${error.message}`);
            res
                .status(500)
                .json({
                    error:
                        "No se pudo cargar el anime",
                    detalle:
                        error.message
                });
        }
    }
);
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

        // Cargar lo que ya está guardado en GitHub
        await cargarDatosGitHub();

        // Aviso de inicio
        await enviarTelegram(`✅ <b>MovieZone iniciado</b>\nPuerto: ${PORT}\nItems conocidos: ${knownLinks.size}`);
    }
);
