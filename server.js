const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const BASE = process.env.SOURCE_URL || "https://www.hackstore.fo";

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


// ======================================================
// PORTADA
// ======================================================

function extraerPortada($, link) {

    let portada = null;

    // JSON-LD
    $('script[type="application/ld+json"]').each((_, script) => {

        if (portada) return;

        try {

            const raw = $(script).html();

            if (!raw) return;

            const data = JSON.parse(raw);

            let objetos = [];

            if (Array.isArray(data)) {
                objetos = data;
            }

            else if (
                data &&
                typeof data === "object"
            ) {
                objetos = data["@graph"] || [data];
            }

            for (const obj of objetos) {

                if (!obj || typeof obj !== "object") {
                    continue;
                }

                if (obj["@type"] === "ImageObject") {

                    portada =
                        obj.contentUrl ||
                        obj.url ||
                        null;
                }

                if (!portada) {

                    if (typeof obj.image === "string") {
                        portada = obj.image;
                    }

                    else if (
                        obj.image &&
                        typeof obj.image === "object"
                    ) {
                        portada =
                            obj.image.url ||
                            obj.image.contentUrl ||
                            null;
                    }
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

        const og =
            $('meta[property="og:image"]')
                .attr("content");

        if (og) {
            portada = og;
        }
    }


    // Twitter image
    if (!portada) {

        const twitter =
            $('meta[name="twitter:image"]')
                .attr("content");

        if (twitter) {
            portada = twitter;
        }
    }


    if (portada) {
        portada = unirUrl(link, portada);
    }

    return portada;
}


// ======================================================
// NOMBRE
// ======================================================

function extraerNombre($) {

    let nombre = null;

    const h1 = $("h1").first();

    if (h1.length) {

        nombre =
            h1.text()
                .trim()
                .replace(/\s+/g, " ");
    }


    if (!nombre) {

        const og =
            $('meta[property="og:title"]')
                .attr("content");

        if (og) {
            nombre =
                og
                    .replace(/\s+/g, " ")
                    .trim();
        }
    }


    if (!nombre) {

        const title =
            $("title")
                .first()
                .text()
                .trim();

        if (title) {
            nombre = title;
        }
    }


    // Evitar que aparezca el título genérico
    if (
        nombre &&
        /descargar peliculas gratis/i.test(nombre)
    ) {
        nombre = null;
    }


    return nombre;
}


// ======================================================
// DESCRIPCIÓN
// ======================================================

function extraerDescripcion($) {

    const og =
        $('meta[property="og:description"]')
            .attr("content");

    if (og) {
        return og.trim();
    }

    const meta =
        $('meta[name="description"]')
            .attr("content");

    if (meta) {
        return meta.trim();
    }

    return "";
}


// ======================================================
// TIPO
// ======================================================

function detectarTipo(link) {

    const url = link.toLowerCase();

    if (url.includes("/anime/") || url.includes("/animes/")) {
        return "Anime";
    }

    if (url.includes("/series/")) {
        return "Serie";
    }

    return "Película";
}


// ======================================================
// REPRODUCTOR
// ======================================================

function extraerReproductor($, link) {

    let reproductor = null;

    $("iframe[src]").each((_, iframe) => {

        if (reproductor) return;

        const src = $(iframe).attr("src");

        if (!src) return;

        const url = unirUrl(link, src);

        if (!url) return;

        /*
         * Conservamos el iframe encontrado.
         * No dependemos de que tenga un nombre
         * concreto.
         */

        reproductor = url;
    });


    // También buscar embeds en objetos/video
    if (!reproductor) {

        $("embed[src], video[src]").each((_, elemento) => {

            if (reproductor) return;

            const src = $(elemento).attr("src");

            if (!src) return;

            reproductor =
                unirUrl(link, src);
        });
    }


    return reproductor;
}


// ======================================================
// EPISODIOS
// ======================================================

function extraerEpisodios($, link) {

    const episodios = [];

    const vistos = new Set();

    $("a[href]").each((_, elemento) => {

        const href =
            $(elemento).attr("href");

        if (!href) return;

        const url =
            unirUrl(link, href);

        if (!url) return;


        const texto =
            $(elemento)
                .text()
                .replace(/\s+/g, " ")
                .trim();


        const contenido =
            `${texto} ${url}`;


        /*
         * Formatos habituales:
         *
         * Episodio 1
         * Episodio 10
         * 1x1
         * 1x10
         * Episode 1
         * Capítulo 1
         */

        const pareceEpisodio =
            /episodio\s*\d+|episode\s*\d+|cap[ií]tulo\s*\d+|\b\d+x\d+\b|\bep\.?\s*\d+/i
                .test(contenido);


        if (!pareceEpisodio) {
            return;
        }


        if (vistos.has(url)) {
            return;
        }


        vistos.add(url);


        let nombre =
            texto ||
            `Episodio ${episodios.length + 1}`;


        /*
         * Limpiar textos basura que algunas
         * páginas meten junto al botón.
         */

        nombre =
            nombre
                .replace(/disponible/gi, "")
                .replace(/\s+/g, " ")
                .trim();


        if (!nombre) {
            nombre =
                `Episodio ${episodios.length + 1}`;
        }


        episodios.push({

            nombre,

            link: url,

            video: null

        });

    });


    /*
     * Ordenar por temporada/episodio cuando
     * encontramos 1x1, 1x2, etc.
     */

    episodios.sort((a, b) => {

        const obtenerNumero = texto => {

            const m =
                texto.match(
                    /(\d+)\s*x\s*(\d+)/i
                );

            if (m) {
                return (
                    Number(m[1]) * 10000 +
                    Number(m[2])
                );
            }

            const e =
                texto.match(/\d+/);

            return e
                ? Number(e[0])
                : 999999;
        };


        return (
            obtenerNumero(a.nombre) -
            obtenerNumero(b.nombre)
        );
    });


    return episodios;
}


// ======================================================
// PROCESAR EPISODIO
// ======================================================

async function procesarEpisodio(episodio) {

    try {

        const $ =
            await obtener(
                episodio.link
            );


        const video =
            extraerReproductor(
                $,
                episodio.link
            );


        return {

            nombre:
                episodio.nombre,

            link:
                episodio.link,

            video:
                video

        };

    } catch {

        return {

            nombre:
                episodio.nombre,

            link:
                episodio.link,

            video:
                null

        };
    }
}


// ======================================================
// PROCESAR ITEM
// ======================================================

async function procesarItem(link) {

    const $ =
        await obtener(link);


    const nombre =
        extraerNombre($);


    const portada =
        extraerPortada(
            $,
            link
        );


    const descripcion =
        extraerDescripcion($);


    const tipo =
        detectarTipo(link);


    const reproductor =
        extraerReproductor(
            $,
            link
        );


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


        /*
         * Obtener el reproductor de cada
         * episodio.
         */

        const procesados = [];

        for (
            const episodio of episodios
        ) {

            const resultado =
                await procesarEpisodio(
                    episodio
                );

            procesados.push(
                resultado
            );
        }

        episodios =
            procesados;
    }


    return {

        nombre:
            nombre ||
            "Título no disponible",

        portada:
            portada,

        descripcion:
            descripcion ||
            "Sin descripción disponible.",

        tipo,

        link,

        reproductor,

        episodios

    };
}


// ======================================================
// OBTENER LISTA DE UNA SECCIÓN
// ======================================================

async function obtenerSeccion(seccion) {

    const url =
        `${BASE}/${seccion}/`;


    console.log(
        `Cargando sección: ${url}`
    );


    const $ =
        await obtener(url);


    const links =
        new Set();


    $("a[href]").each((_, elemento) => {

        let href =
            $(elemento)
                .attr("href");


        if (!href) return;


        const urlCompleta =
            unirUrl(BASE, href);


        if (!urlCompleta) return;


        const limpia =
            limpiarUrl(
                urlCompleta
            );


        /*
         * Solamente enlaces de la
         * sección actual.
         */

        if (
            !limpia.startsWith(
                `${BASE}/${seccion}/`
            )
        ) {
            return;
        }


        /*
         * No agregar la página principal.
         */

        if (
            limpia.replace(/\/$/, "") ===
            url.replace(/\/$/, "")
        ) {
            return;
        }


        /*
         * No agregar paginación.
         */

        if (
            /\/page\/\d+\/?$/.test(limpia)
        ) {
            return;
        }


        links.add(limpia);

    });


    const lista =
        Array.from(links);


    console.log(
        `${seccion}: ${lista.length} enlaces`
    );


    const resultados = [];


    /*
     * Límite para evitar que Render
     * se quede procesando demasiado.
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

            console.log(
                `[${i + 1}/${limite}] ${lista[i]}`
            );


            const item =
                await procesarItem(
                    lista[i]
                );


            resultados.push(item);

        } catch (error) {

            console.error(
                "Error procesando:",
                lista[i],
                error.message
            );
        }
    }


    return resultados;
}


// ======================================================
// API - PELÍCULAS
// ======================================================

app.get(
    "/api/peliculas",
    async (req, res) => {

        try {

            const resultados =
                await obtenerSeccion(
                    "peliculas"
                );


            res.json({
                resultados
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    "No se pudieron cargar las películas",

                detalle:
                    error.message

            });
        }
    }
);


// ======================================================
// API - SERIES
// ======================================================

app.get(
    "/api/series",
    async (req, res) => {

        try {

            const resultados =
                await obtenerSeccion(
                    "series"
                );


            res.json({
                resultados
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    "No se pudieron cargar las series",

                detalle:
                    error.message

            });
        }
    }
);


// ======================================================
// API - ANIME
// ======================================================

app.get(
    "/api/animes",
    async (req, res) => {

        try {

            /*
             * La sección que indicaste es:
             * /animes/
             */

            const resultados =
                await obtenerSeccion(
                    "animes"
                );


            res.json({
                resultados
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    "No se pudieron cargar los animes",

                detalle:
                    error.message

            });
        }
    }
);


// ======================================================
// API - BÚSQUEDA
// ======================================================

app.get(
    "/api/buscar",
    async (req, res) => {

        try {

            const termino =
                String(
                    req.query.q || ""
                )
                .trim()
                .toLowerCase();


            if (!termino) {

                return res.json({
                    resultados: []
                });
            }


            /*
             * Buscar en las tres secciones.
             */

            const [
                peliculas,
                series,
                animes
            ] = await Promise.all([

                obtenerSeccion("peliculas"),

                obtenerSeccion("series"),

                obtenerSeccion("animes")

            ]);


            const todos = [

                ...peliculas,

                ...series,

                ...animes

            ];


            const resultados =
                todos.filter(item => {

                    const texto =
                        [
                            item.nombre,
                            item.descripcion,
                            item.tipo
                        ]
                        .join(" ")
                        .toLowerCase();


                    return texto.includes(
                        termino
                    );
                });


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
// CATÁLOGO GENERAL
// ======================================================

app.get(
    "/api/catalogo",
    async (req, res) => {

        try {

            const [
                peliculas,
                series,
                animes
            ] = await Promise.all([

                obtenerSeccion("peliculas"),

                obtenerSeccion("series"),

                obtenerSeccion("animes")

            ]);


            res.json({

                resultados: [

                    ...peliculas,

                    ...series,

                    ...animes

                ]

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
// SPA
// ======================================================

app.get(
    "*",
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
