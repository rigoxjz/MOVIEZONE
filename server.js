const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const BASE = (process.env.SOURCE_URL || "https://www.hackstore.fo").replace(/\/+$/, "");

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
        const u = new URL(urlStr);

        let pathname = u.pathname;

        if (!pathname.endsWith("/")) {
            pathname += "/";
        }

        return `${u.protocol}//${u.host}${pathname}`;
    } catch {
        return urlStr;
    }
}


async function obtenerHTML(url) {
    const response = await session.get(url, {
        validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.data || "";
}


async function obtener(url) {
    const html = await obtenerHTML(url);
    return cheerio.load(html);
}


// ======================================================
// TIPO DE CONTENIDO
// ======================================================

function detectarTipo(url, nombre = "") {

    const texto =
        `${url} ${nombre}`.toLowerCase();

    if (
        texto.includes("/anime/") ||
        texto.includes("anime")
    ) {
        return "Anime";
    }

    if (
        texto.includes("/series/") ||
        texto.includes("serie") ||
        texto.includes("series")
    ) {
        return "Serie";
    }

    return "Película";
}


// ======================================================
// ES URL DE TU FUENTE
// ======================================================

function esFuentePropia(url) {

    try {
        const origen = new URL(BASE);
        const destino = new URL(url);

        return destino.origin === origen.origin;
    } catch {
        return false;
    }
}


// ======================================================
// EXTRAER PORTADA
// ======================================================

function extraerPortada($, paginaURL) {

    let portada = null;

    $('script[type="application/ld+json"]').each((_, script) => {

        if (portada) return;

        try {

            const raw = $(script).html();

            if (!raw) return;

            const data = JSON.parse(raw);

            let objetos = [];

            if (Array.isArray(data)) {
                objetos = data;
            } else if (
                data &&
                typeof data === "object"
            ) {
                objetos = data["@graph"] || [data];
            }

            for (const obj of objetos) {

                if (!obj || typeof obj !== "object") {
                    continue;
                }

                if (obj.image) {

                    if (typeof obj.image === "string") {
                        portada = obj.image;
                    } else if (obj.image.url) {
                        portada = obj.image.url;
                    }

                }

                if (!portada && obj.contentUrl) {
                    portada = obj.contentUrl;
                }

                if (!portada && obj.thumbnailUrl) {
                    portada = obj.thumbnailUrl;
                }

                if (portada) break;
            }

        } catch {
            // JSON-LD inválido
        }

    });


    if (!portada) {

        portada =
            $('meta[property="og:image"]')
                .attr("content") || null;

    }


    if (!portada) {

        portada =
            $('meta[name="twitter:image"]')
                .attr("content") || null;

    }


    if (portada) {
        portada = unirUrl(paginaURL, portada);
    }


    return portada;
}


// ======================================================
// EXTRAER REPRODUCTOR PROPIO
// ======================================================

function extraerReproductor($, paginaURL) {

    let reproductor = null;

    $("iframe[src]").each((_, iframe) => {

        if (reproductor) return;

        const src = $(iframe).attr("src");

        if (!src) return;

        const iframeURL =
            unirUrl(paginaURL, src);

        if (!iframeURL) return;

        /*
         * Solo se aceptan reproductores
         * pertenecientes a tu propia fuente.
         */
        if (esFuentePropia(iframeURL)) {

            reproductor = iframeURL;

        }

    });

    return reproductor;
}


// ======================================================
// EXTRAER EPISODIOS
// ======================================================

function extraerEpisodios($, paginaURL) {

    const episodios = [];
    const vistos = new Set();

    $("a[href]").each((_, elemento) => {

        const texto =
            $(elemento)
                .text()
                .trim()
                .replace(/\s+/g, " ");

        const href =
            $(elemento).attr("href");

        if (!href) return;

        const url =
            unirUrl(paginaURL, href);

        if (!url) return;

        if (vistos.has(url)) return;


        const contenido =
            `${texto} ${url}`.toLowerCase();


        const pareceEpisodio =
            /episodio|episode|capitulo|capítulo|\bep\.?\s*\d+/i
                .test(contenido);


        if (!pareceEpisodio) {
            return;
        }


        /*
         * El episodio debe pertenecer
         * a tu propia fuente.
         */
        if (!esFuentePropia(url)) {
            return;
        }


        vistos.add(url);


        episodios.push({
            nombre:
                texto ||
                `Episodio ${episodios.length + 1}`,

            link: url,

            video: null
        });

    });


    return episodios;
}


// ======================================================
// PROCESAR UNA FICHA
// ======================================================

async function procesarPagina(link) {

    const $ = await obtener(link);

    let nombre = null;
    let descripcion = "";
    let year = null;
    let genero = null;


    // --------------------------------------------------
    // NOMBRE
    // --------------------------------------------------

    nombre =
        $("h1")
            .first()
            .text()
            .trim()
            .replace(/\s+/g, " ");


    if (!nombre) {

        nombre =
            $('meta[property="og:title"]')
                .attr("content") || null;

    }


    // --------------------------------------------------
    // DESCRIPCIÓN
    // --------------------------------------------------

    descripcion =
        $('meta[property="og:description"]')
            .attr("content") ||
        $('meta[name="description"]')
            .attr("content") ||
        "";


    // --------------------------------------------------
    // PORTADA
    // --------------------------------------------------

    const portada =
        extraerPortada($, link);


    // --------------------------------------------------
    // JSON-LD
    // --------------------------------------------------

    $('script[type="application/ld+json"]').each((_, script) => {

        try {

            const raw = $(script).html();

            if (!raw) return;

            const data = JSON.parse(raw);

            let objetos = [];

            if (Array.isArray(data)) {
                objetos = data;
            } else if (
                data &&
                typeof data === "object"
            ) {
                objetos =
                    data["@graph"] || [data];
            }


            for (const obj of objetos) {

                if (!obj || typeof obj !== "object") {
                    continue;
                }


                if (!year) {

                    const fecha =
                        obj.datePublished ||
                        obj.dateCreated;

                    if (fecha) {
                        year =
                            String(fecha).substring(0, 4);
                    }

                }


                if (!genero && obj.genre) {

                    genero =
                        Array.isArray(obj.genre)
                            ? obj.genre.join(", ")
                            : String(obj.genre);

                }

            }

        } catch {
            // ignorar
        }

    });


    // --------------------------------------------------
    // TIPO
    // --------------------------------------------------

    const tipo =
        detectarTipo(
            link,
            nombre || ""
        );


    // --------------------------------------------------
    // REPRODUCTOR
    // --------------------------------------------------

    const reproductor =
        extraerReproductor(
            $,
            link
        );


    // --------------------------------------------------
    // EPISODIOS
    // --------------------------------------------------

    let episodios = [];

    if (
        tipo === "Serie" ||
        tipo === "Anime"
    ) {

        episodios =
            extraerEpisodios(
                $,
                link
            );

    }


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


    for (const episodio of item.episodios) {

        try {

            const $ =
                await obtener(
                    episodio.link
                );


            const reproductor =
                extraerReproductor(
                    $,
                    episodio.link
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
// EXTRAER ENLACES DE UN LISTADO
// ======================================================

async function obtenerEnlacesListado(urlListado) {

    try {

        const $ =
            await obtener(
                urlListado
            );


        const links =
            new Set();


        $("a[href]").each((_, elemento) => {

            const href =
                $(elemento).attr("href");

            if (!href) return;


            const url =
                unirUrl(
                    BASE,
                    href
                );

            if (!url) return;


            const limpia =
                limpiarUrl(url);


            if (!esFuentePropia(limpia)) {
                return;
            }


            if (
                !(
                    limpia.includes("/peliculas/") ||
                    limpia.includes("/series/") ||
                    limpia.includes("/anime/")
                )
            ) {
                return;
            }


            if (
                /\/page\/\d+\/?$/.test(limpia)
            ) {
                return;
            }


            links.add(limpia);

        });


        return Array.from(links);

    } catch {

        return [];

    }
}


// ======================================================
// CATÁLOGO INICIAL
// ======================================================

async function catalogoInicial() {

    const categorias = [

        `${BASE}/peliculas/`,
        `${BASE}/series/`,
        `${BASE}/anime/`

    ];


    const todos =
        new Set();


    for (const categoria of categorias) {

        const links =
            await obtenerEnlacesListado(
                categoria
            );


        for (const link of links) {
            todos.add(link);
        }

    }


    const lista =
        Array.from(todos);


    /*
     * Límite para evitar que Render
     * tarde demasiado en el arranque.
     */
    const limite =
        Math.min(lista.length, 30);


    const resultados = [];


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

        } catch (error) {

            console.error(
                "Error catálogo:",
                lista[i],
                error.message
            );

        }

    }


    return resultados;
}


// ======================================================
// BÚSQUEDA
// ======================================================

async function buscar(termino) {

    const url =
        `${BASE}/?s=${encodeURIComponent(termino)}`;


    const $ =
        await obtener(url);


    const links =
        new Set();


    $("a[href]").each((_, elemento) => {

        const href =
            $(elemento).attr("href");

        if (!href) return;


        const url =
            unirUrl(
                BASE,
                href
            );

        if (!url) return;


        const limpia =
            limpiarUrl(url);


        if (!esFuentePropia(limpia)) {
            return;
        }


        if (
            !(
                limpia.includes("/peliculas/") ||
                limpia.includes("/series/") ||
                limpia.includes("/anime/")
            )
        ) {
            return;
        }


        if (
            /\/page\/\d+\/?$/.test(limpia)
        ) {
            return;
        }


        links.add(limpia);

    });


    const lista =
        Array.from(links);


    const limite =
        Math.min(lista.length, 30);


    const resultados = [];


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

        } catch (error) {

            console.error(
                "Error búsqueda:",
                lista[i],
                error.message
            );

        }

    }


    return resultados;
}


// ======================================================
// API CATÁLOGO
// ======================================================

app.get(
    "/api/catalogo",
    async (req, res) => {

        try {

            const resultados =
                await catalogoInicial();


            res.json({
                resultados
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    "No se pudo cargar el catálogo",

                detalle:
                    error.message

            });

        }

    }
);


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

                return res.status(400).json({

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

            res.status(500).json({

                error:
                    "No se pudo realizar la búsqueda",

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
// FALLBACK
// ======================================================

app.use((req, res, next) => {

    if (
        req.path.startsWith("/api/")
    ) {
        return next();
    }

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );

});


// ======================================================
// SERVIDOR
// ======================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `MovieZone ejecutándose en puerto ${PORT}`
        );

        console.log(
            `Fuente: ${BASE}`
        );

    }
);