const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================================
// CONFIGURACIÓN
// ======================================================

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


async function obtenerHTML(url) {

    const respuesta = await session.get(url);

    return respuesta.data || "";

}


async function obtener(url) {

    const html = await obtenerHTML(url);

    return cheerio.load(html);

}


// ======================================================
// DETECTAR TIPO
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
// OBTENER PORTADA
// ======================================================

function extraerPortada($, paginaUrl) {

    let portada = null;


    // ==================================================
    // JSON-LD
    // ==================================================

    $('script[type="application/ld+json"]').each(
        (_, script) => {

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
                            obj.url;

                    }


                    if (!portada) {

                        portada =
                            obj.thumbnailUrl ||
                            obj.image ||
                            null;

                    }


                    if (portada) {
                        break;
                    }

                }

            } catch {
                // Ignorar JSON-LD inválido
            }

        }
    );


    // ==================================================
    // OG IMAGE
    // ==================================================

    if (!portada) {

        portada =
            $('meta[property="og:image"]')
                .attr("content") ||
            $('meta[name="twitter:image"]')
                .attr("content") ||
            null;

    }


    // ==================================================
    // IMG PRINCIPAL COMO ÚLTIMO RESPALDO
    // ==================================================

    if (!portada) {

        const posibles = [
            "img.wp-post-image",
            ".poster img",
            ".thumbnail img",
            ".post-thumbnail img",
            "article img"
        ];

        for (const selector of posibles) {

            const src =
                $(selector)
                    .first()
                    .attr("src");

            if (src) {

                portada = src;

                break;
            }

        }

    }


    if (portada) {

        portada =
            unirUrl(
                paginaUrl,
                portada
            );

    }


    return portada;
}


// ======================================================
// OBTENER NOMBRE
// ======================================================

function extraerNombre($) {

    let nombre = null;


    // H1
    const h1 = $("h1").first();

    if (h1.length) {

        nombre =
            h1.text()
                .trim()
                .replace(/\s+/g, " ");

    }


    // OG TITLE
    if (!nombre) {

        nombre =
            $('meta[property="og:title"]')
                .attr("content") ||
            null;

    }


    // TITLE
    if (!nombre) {

        nombre =
            $("title")
                .first()
                .text()
                .trim() ||
            null;

    }


    return nombre;
}


// ======================================================
// PROCESAR UNA FICHA
// ======================================================

async function procesarPagina(link) {

    const $ = await obtener(link);

    const nombre =
        extraerNombre($);

    const portada =
        extraerPortada(
            $,
            link
        );

    const descripcion =
        $('meta[property="og:description"]')
            .attr("content") ||
        "";


    const tipo =
        detectarTipo(
            link,
            nombre || ""
        );


    // ==================================================
    // BUSCAR REPRODUCTOR
    // ==================================================

    let reproductor = null;


    $("iframe[src]").each(
        (_, iframe) => {

            if (reproductor) return;

            const src =
                $(iframe).attr("src");

            if (!src) return;

            const iframeUrl =
                unirUrl(
                    link,
                    src
                );

            if (!iframeUrl) return;


            // Mantener el comportamiento
            // de tu scraper original.

            if (
                iframeUrl.startsWith(BASE)
            ) {

                reproductor =
                    iframeUrl;

            }

        }
    );


    // ==================================================
    // EPISODIOS
    // ==================================================

    const episodios =
        extraerEpisodios(
            $,
            link
        );


    return {

        nombre:
            nombre ||
            "Título no disponible",

        portada:
            portada,

        descripcion:
            descripcion.trim(),

        tipo,

        link,

        reproductor,

        episodios

    };

}


// ======================================================
// EXTRAER EPISODIOS
// ======================================================

function extraerEpisodios(
    $,
    paginaBase
) {

    const episodios = [];

    const vistos =
        new Set();


    $("a[href]").each(
        (_, elemento) => {

            const texto =
                $(elemento)
                    .text()
                    .trim()
                    .replace(/\s+/g, " ");


            const href =
                $(elemento)
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


            /*
             * Detectar:
             *
             * Episodio 1
             * Episode 1
             * Capítulo 1
             * 1x1
             * 1x2
             * etc.
             */

            const pareceEpisodio =
                /episodio|episode|capitulo|capítulo|\b\d+\s*x\s*\d+\b|\bep\.?\s*\d+/i
                    .test(contenido);


            if (!pareceEpisodio) {
                return;
            }


            if (vistos.has(url)) {
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

        }
    );


    return episodios;
}


// ======================================================
// PROCESAR EPISODIOS
// ======================================================

async function procesarEpisodios(item) {

    if (
        !Array.isArray(item.episodios) ||
        !item.episodios.length
    ) {

        return item;

    }


    const episodios = [];


    for (
        const episodio
        of item.episodios
    ) {

        try {

            const $ =
                await obtener(
                    episodio.link
                );


            let reproductor = null;


            $("iframe[src]").each(
                (_, iframe) => {

                    if (reproductor) return;


                    const src =
                        $(iframe)
                            .attr("src");


                    if (!src) return;


                    const iframeUrl =
                        unirUrl(
                            episodio.link,
                            src
                        );


                    if (
                        iframeUrl &&
                        iframeUrl.startsWith(BASE)
                    ) {

                        reproductor =
                            iframeUrl;

                    }

                }
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
// BUSCAR EN UNA SECCIÓN
// ======================================================

async function buscarSeccion(
    seccion,
    termino = ""
) {

    let url;


    if (termino) {

        url =
            BASE +
            "/?s=" +
            encodeURIComponent(termino);

    } else {

        url =
            BASE +
            "/" +
            seccion +
            "/";

    }


    console.log(
        "Buscando:",
        url
    );


    const $ =
        await obtener(url);


    const links =
        new Set();


    $("a[href]").each(
        (_, elemento) => {

            let href =
                $(elemento)
                    .attr("href");


            if (!href) return;


            href =
                unirUrl(
                    BASE,
                    href
                );


            if (!href) return;


            href =
                limpiarUrl(href);


            let permitido = false;


            if (seccion === "peliculas") {

                permitido =
                    href.startsWith(
                        BASE +
                        "/peliculas/"
                    );

            }


            if (seccion === "series") {

                permitido =
                    href.startsWith(
                        BASE +
                        "/series/"
                    );

            }


            if (
                seccion === "animes"
            ) {

                permitido =
                    href.startsWith(
                        BASE +
                        "/animes/"
                    ) ||
                    href.startsWith(
                        BASE +
                        "/anime/"
                    );

            }


            if (!permitido) {
                return;
            }


            // No incluir la propia sección

            if (
                href.replace(/\/$/, "") ===
                (
                    BASE +
                    "/" +
                    seccion +
                    "/"
                ).replace(/\/$/, "")
            ) {
                return;
            }


            // No paginación

            if (
                /\/page\/\d+\/?$/
                    .test(href)
            ) {
                return;
            }


            links.add(href);

        }
    );


    const lista =
        Array.from(links)
            .sort();


    console.log(
        `Encontrados en ${seccion}:`,
        lista.length
    );


    const resultados = [];


    // Evita sobrecargar Render

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
                `[${i + 1}/${limite}]`,
                item.nombre
            );


        } catch (error) {

            console.error(
                "Error:",
                lista[i],
                error.message
            );

        }

    }


    return resultados;
}


// ======================================================
// CATÁLOGO COMPLETO
// ======================================================

async function obtenerCatalogo() {

    const [peliculas, series, animes] =
        await Promise.all([

            buscarSeccion(
                "peliculas"
            ),

            buscarSeccion(
                "series"
            ),

            buscarSeccion(
                "animes"
            )

        ]);


    return [

        ...peliculas,

        ...series,

        ...animes

    ];
}


// ======================================================
// API - CATÁLOGO
// ======================================================

app.get(
    "/api/catalogo",
    async (req, res) => {

        try {

            const resultados =
                await obtenerCatalogo();


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
// API - SECCIÓN
// ======================================================

app.get(
    "/api/seccion/:tipo",
    async (req, res) => {

        try {

            let tipo =
                req.params.tipo
                    .toLowerCase();


            if (tipo === "anime") {
                tipo = "animes";
            }


            if (
                ![
                    "peliculas",
                    "series",
                    "animes"
                ].includes(tipo)
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Sección no válida"

                    });

            }


            const resultados =
                await buscarSeccion(
                    tipo
                );


            res.json({

                resultados

            });


        } catch (error) {

            console.error(error);


            res.status(500).json({

                error:
                    "No se pudo cargar la sección",

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
                ).trim();


            if (!termino) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Escribe algo para buscar"

                    });

            }


            const [
                peliculas,
                series,
                animes
            ] = await Promise.all([

                buscarSeccion(
                    "peliculas",
                    termino
                ),

                buscarSeccion(
                    "series",
                    termino
                ),

                buscarSeccion(
                    "animes",
                    termino
                )

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
// SPA
// ======================================================
//
// IMPORTANTE:
// No usamos app.get("*") porque Express 5
// produce el PathError que te apareció.
// ======================================================

app.use(
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
