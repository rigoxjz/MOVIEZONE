const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
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
// PORTADA
// ======================================================
function extraerPortada(pagina, link) {
    let portada = null;
    // JSON-LD
    pagina(
        'script[type="application/ld+json"]'
    ).each((_, script) => {
        if (portada) return;
        try {
            const raw =
                pagina(script).html();
            if (!raw) return;
            const data =
                JSON.parse(raw);
            let objetos = [];
            if (Array.isArray(data)) {
                objetos = data;
            } else if (
                data &&
                typeof data === "object"
            ) {
                objetos =
                    data["@graph"] ||
                    [data];
            }
            for (const obj of objetos) {
                if (
                    !obj ||
                    typeof obj !== "object"
                ) {
                    continue;
                }
                if (
                    obj["@type"] ===
                    "ImageObject"
                ) {
                    portada =
                        obj.contentUrl ||
                        obj.url ||
                        null;
                }
                if (
                    !portada &&
                    typeof obj.image ===
                        "string"
                ) {
                    portada = obj.image;
                }
                if (
                    !portada &&
                    obj.image &&
                    typeof obj.image ===
                        "object"
                ) {
                    portada =
                        obj.image.url ||
                        obj.image.contentUrl ||
                        null;
                }
                if (!portada) {
                    portada =
                        obj.thumbnailUrl ||
                        null;
                }
                if (portada) break;
            }
        } catch {}
    });
    // OG IMAGE
    if (!portada) {
        portada =
            pagina(
                'meta[property="og:image"]'
            ).attr("content") || null;
    }
    // TWITTER IMAGE
    if (!portada) {
        portada =
            pagina(
                'meta[name="twitter:image"]'
            ).attr("content") || null;
    }
    // META IMAGE
    if (!portada) {
        portada =
            pagina(
                'meta[name="image"]'
            ).attr("content") || null;
    }
    // IMÁGENES
    if (!portada) {
        pagina("img").each((_, img) => {
            if (portada) return;
            const elemento =
                pagina(img);
            const posibles = [
                elemento.attr("src"),
                elemento.attr("data-src"),
                elemento.attr("data-lazy-src"),
                elemento.attr("data-original"),
                elemento.attr("data-lazyload")
            ];
            for (const imagen of posibles) {
                if (!imagen) continue;
                const texto =
                    imagen.toLowerCase();
                if (
                    texto.includes("logo") ||
                    texto.includes("avatar") ||
                    texto.includes("icon") ||
                    texto.includes("banner") ||
                    texto.includes("placeholder") ||
                    texto.includes("loading")
                ) {
                    continue;
                }
                portada = imagen;
                break;
            }
        });
    }
    if (portada) {
        portada =
            unirUrl(link, portada);
    }
    return portada;
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

            // Si es directamente un recurso reproducible
            if (
                candidato.includes(".m3u8") ||
                candidato.includes(".mp4")
            ) {

                return candidato;

            }


            // ==================================================
            // PLAY.PHP
            // ==================================================

            if (
                candidato.includes("play.php")
            ) {

                const htmlPlayer =
                    await obtenerHTML(
                        candidato
                    );


                // window.location.href
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


                // location.href
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


                // URL dentro del HTML
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


            // ==================================================
            // PLAYER / EMBED
            // ==================================================

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
    const reproductor =
        await extraerReproductor(
            link,
            pagina
        );
    const episodios =
        extraerEpisodios(
            pagina,
            link
        );
    let year = null;
    let genero = null;
    // JSON-LD adicional
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
    return {
        nombre,
        portada,
        descripcion,
        year,
        genero,
        tipo,
        link,
        reproductor,
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
            const reproductor =
                await extraerReproductor(
                    episodio.link,
                    pagina
                );
            episodios.push({
                nombre:
                    episodio.nombre,
                link:
                    episodio.link,
                video:
                    reproductor
            });
        } catch {
            episodios.push({
                nombre:
                    episodio.nombre,
                link:
                    episodio.link,
                video:
                    null
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
            // Evitar páginas principales
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
            // Evitar paginación
            if (
                /\/page\/\d+\/?$/.test(
                    href
                )
            ) {
                return;
            }
            // Mantener la sección solicitada
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
    /*
     * Límite para no saturar Render.
     */
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
    return resultados;
}
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
    () => {
        console.log(
            `MovieZone ejecutándose en puerto ${PORT}`
        );
        console.log(
            `Fuente: ${BASE}`
        );
    }
);
