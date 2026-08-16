const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const BASE = (
    process.env.SOURCE_URL ||
    "https://www.hackstore.fo"
).replace(/\/+$/, "");

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


async function obtener(url) {

    const respuesta = await session.get(url);

    return cheerio.load(
        respuesta.data
    );
}


// ======================================================
// DETECTAR TIPO
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
        texto.includes("serie")
    ) {
        return "Serie";
    }

    return "Película";
}


// ======================================================
// EXTRAER PORTADA
// ======================================================

function extraerPortada(pagina, link) {

    let portada = null;

    // ----------------------------------------------
    // JSON-LD
    // ----------------------------------------------

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
                    data["@graph"] || [data];

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

                if (!portada) {

                    if (
                        typeof obj.image === "string"
                    ) {

                        portada = obj.image;

                    } else if (
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


    // ----------------------------------------------
    // OG IMAGE
    // ----------------------------------------------

    if (!portada) {

        portada =
            pagina(
                'meta[property="og:image"]'
            ).attr("content") || null;

    }


    // ----------------------------------------------
    // TWITTER IMAGE
    // ----------------------------------------------

    if (!portada) {

        portada =
            pagina(
                'meta[name="twitter:image"]'
            ).attr("content") || null;

    }


    // ----------------------------------------------
    // IMÁGENES DEL CONTENIDO
    // ----------------------------------------------

    if (!portada) {

        const posibles = [
            ".poster img",
            ".post img",
            ".movie img",
            ".film-poster img",
            ".thumb img",
            ".thumbnail img",
            "article img",
            ".entry-content img"
        ];

        for (const selector of posibles) {

            const img =
                pagina(selector).first();

            if (!img.length) continue;

            portada =
                img.attr("data-src") ||
                img.attr("data-lazy-src") ||
                img.attr("src");

            if (portada) break;

        }

    }


    // ----------------------------------------------
    // URL ABSOLUTA
    // ----------------------------------------------

    if (portada) {

        portada =
            unirUrl(
                link,
                portada
            );

    }

    return portada || null;
}


// ======================================================
// EXTRAER NOMBRE
// ======================================================

function extraerNombre(pagina) {

    let nombre = null;

    const h1 =
        pagina("h1").first();

    if (h1.length) {

        nombre =
            h1.text()
                .replace(/\s+/g, " ")
                .trim();

    }

    if (!nombre) {

        const og =
            pagina(
                'meta[property="og:title"]'
            ).attr("content");

        if (og) {

            nombre =
                og
                    .replace(/\s+/g, " ")
                    .trim();

        }

    }

    if (!nombre) {

        const title =
            pagina("title").first().text();

        if (title) {

            nombre =
                title
                    .replace(/\s+/g, " ")
                    .trim();

        }

    }

    return nombre;
}


// ======================================================
// EXTRAER DESCRIPCIÓN
// ======================================================

function extraerDescripcion(pagina) {

    return (
        pagina(
            'meta[property="og:description"]'
        ).attr("content") ||

        pagina(
            'meta[name="description"]'
        ).attr("content") ||

        ""
    ).trim();
}


// ======================================================
// BUSCAR REPRODUCTOR
// ======================================================

function extraerReproductor(pagina, paginaBase) {

    let reproductor = null;


    // ----------------------------------------------
    // IFRAME
    // ----------------------------------------------

    pagina("iframe[src]").each(
        (_, iframe) => {

            if (reproductor) return;

            const src =
                pagina(iframe)
                    .attr("src");

            if (!src) return;

            const url =
                unirUrl(
                    paginaBase,
                    src
                );

            if (!url) return;


            // Reproductor propio
            if (
                url.startsWith(BASE)
            ) {

                reproductor = url;

            }

        }
    );


    // ----------------------------------------------
    // EMBED
    // ----------------------------------------------

    if (!reproductor) {

        pagina("embed[src]").each(
            (_, elemento) => {

                if (reproductor) return;

                const src =
                    pagina(elemento)
                        .attr("src");

                if (!src) return;

                const url =
                    unirUrl(
                        paginaBase,
                        src
                    );

                if (
                    url &&
                    url.startsWith(BASE)
                ) {

                    reproductor = url;

                }

            }
        );

    }


    // ----------------------------------------------
    // VIDEO
    // ----------------------------------------------

    if (!reproductor) {

        pagina("video[src]").each(
            (_, video) => {

                if (reproductor) return;

                const src =
                    pagina(video)
                        .attr("src");

                if (!src) return;

                const url =
                    unirUrl(
                        paginaBase,
                        src
                    );

                if (url) {

                    reproductor = url;

                }

            }
        );

    }


    // ----------------------------------------------
    // ENLACES A PLAYER
    // ----------------------------------------------

    if (!reproductor) {

        pagina("a[href]").each(
            (_, elemento) => {

                if (reproductor) return;

                const href =
                    pagina(elemento)
                        .attr("href");

                if (!href) return;

                const texto =
                    pagina(elemento)
                        .text()
                        .trim()
                        .toLowerCase();

                const url =
                    unirUrl(
                        paginaBase,
                        href
                    );

                if (!url) return;

                if (
                    /play|player|reproduc|watch|video/i
                        .test(texto + " " + url)
                ) {

                    if (
                        url.startsWith(BASE)
                    ) {

                        reproductor = url;

                    }

                }

            }
        );

    }

    return reproductor;
}


// ======================================================
// DETECTAR EPISODIOS
// ======================================================

function extraerEpisodios(
    pagina,
    paginaBase
) {

    const episodios = [];

    const vistos = new Set();


    pagina("a[href]").each(
        (_, elemento) => {

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


            /*
             * Lo importante:
             *
             * /episodio/acaramelados-2026-1x1/
             *
             * /episodio/acaramelados-2026-1x2/
             */

            const esEpisodio =
                /\/episodio\//i.test(url);


            /*
             * También soportamos enlaces
             * cuyo texto contiene episodio.
             */

            const texto =
                pagina(elemento)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();


            const pareceEpisodio =
                /episodio|episode|cap[ií]tulo/i
                    .test(texto);


            if (
                !esEpisodio &&
                !pareceEpisodio
            ) {

                return;

            }


            if (vistos.has(url)) {
                return;
            }


            vistos.add(url);


            /*
             * Intentar obtener el número
             * directamente de la URL.
             *
             * Ejemplo:
             *
             * 1x1
             * 1x2
             * 2x5
             */

            const match =
                url.match(
                    /(\d+)x(\d+)/i
                );


            let nombre =
                texto;


            if (
                !nombre ||
                nombre.length < 2 ||
                /Disponible/i.test(nombre)
            ) {

                if (match) {

                    nombre =
                        `Episodio ${match[2]}`;

                } else {

                    nombre =
                        `Episodio ${
                            episodios.length + 1
                        }`;

                }

            }


            /*
             * Limpiar basura de SVG/CSS.
             */

            nombre =
                nombre
                    .replace(
                        /\.text\s*\{[^}]*\}/gi,
                        " "
                    )
                    .replace(
                        /font-size\s*:[^;]+;?/gi,
                        " "
                    )
                    .replace(
                        /font-weight\s*:[^;]+;?/gi,
                        " "
                    )
                    .replace(
                        /fill\s*:[^;]+;?/gi,
                        " "
                    )
                    .replace(
                        /dominant-baseline\s*:[^;]+;?/gi,
                        " "
                    )
                    .replace(
                        /text-anchor\s*:[^;]+;?/gi,
                        " "
                    )
                    .replace(
                        /\*+/g,
                        " "
                    )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();


            /*
             * Si quedó demasiado texto extraño,
             * usamos el número de episodio.
             */

            if (
                match &&
                (
                    nombre.length > 80 ||
                    /font-size|dominant-baseline|text-anchor/i
                        .test(nombre)
                )
            ) {

                nombre =
                    `Episodio ${match[2]}`;

            }


            episodios.push({

                nombre,

                link: url,

                video: null

            });

        }
    );


    /*
     * Ordenar por temporada/episodio.
     */

    episodios.sort(
        (a, b) => {

            const ma =
                a.link.match(
                    /(\d+)x(\d+)/i
                );

            const mb =
                b.link.match(
                    /(\d+)x(\d+)/i
                );


            if (!ma || !mb) {
                return 0;
            }


            const temporadaA =
                Number(ma[1]);

            const episodioA =
                Number(ma[2]);


            const temporadaB =
                Number(mb[1]);

            const episodioB =
                Number(mb[2]);


            if (
                temporadaA !==
                temporadaB
            ) {

                return
                    temporadaA -
                    temporadaB;

            }


            return
                episodioA -
                episodioB;

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

            const pagina =
                await obtener(
                    episodio.link
                );


            const video =
                extraerReproductor(
                    pagina,
                    episodio.link
                );


            episodios.push({

                nombre:
                    episodio.nombre,

                link:
                    episodio.link,

                video:
                    video || null

            });

        } catch (error) {

            console.error(
                "Error episodio:",
                episodio.link,
                error.message
            );


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
// PROCESAR PÁGINA
// ======================================================

async function procesarPagina(link) {

    const pagina =
        await obtener(link);


    const nombre =
        extraerNombre(pagina);


    const portada =
        extraerPortada(
            pagina,
            link
        );


    const descripcion =
        extraerDescripcion(pagina);


    const tipo =
        detectarTipo(
            link,
            nombre || ""
        );


    const reproductor =
        extraerReproductor(
            pagina,
            link
        );


    let episodios = [];


    if (
        tipo === "Serie" ||
        tipo === "Anime"
    ) {

        episodios =
            extraerEpisodios(
                pagina,
                link
            );

    }


    return {

        nombre:
            nombre || "Sin título",

        portada,

        descripcion,

        tipo,

        year: null,

        genero: null,

        link,

        reproductor,

        video:
            reproductor,

        episodios

    };
}


// ======================================================
// DESCUBRIR CONTENIDO
// ======================================================

async function buscar(termino = "") {

    let url;


    if (termino.trim()) {

        url =
            BASE +
            "/?s=" +
            encodeURIComponent(
                termino
            );

    } else {

        /*
         * Para catálogo inicial
         * consultamos las tres secciones.
         */

        const secciones = [
            "/peliculas/",
            "/series/",
            "/anime/"
        ];


        const todos =
            new Map();


        for (
            const seccion
            of secciones
        ) {

            try {

                const pagina =
                    await obtener(
                        BASE + seccion
                    );


                pagina("a[href]").each(
                    (_, elemento) => {

                        const href =
                            pagina(elemento)
                                .attr("href");

                        if (!href) return;


                        const link =
                            unirUrl(
                                BASE,
                                href
                            );

                        if (!link) return;


                        const permitido =
                            link.startsWith(
                                BASE + "/peliculas/"
                            ) ||
                            link.startsWith(
                                BASE + "/series/"
                            ) ||
                            link.startsWith(
                                BASE + "/anime/"
                            );


                        if (!permitido) {
                            return;
                        }


                        if (
                            /\/page\/\d+\/?$/
                                .test(link)
                        ) {
                            return;
                        }


                        todos.set(
                            limpiarUrl(link),
                            true
                        );

                    }
                );

            } catch (error) {

                console.error(
                    "Error sección:",
                    seccion,
                    error.message
                );

            }

        }


        return procesarLista(
            Array.from(
                todos.keys()
            )
        );

    }


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


            const link =
                unirUrl(
                    BASE,
                    href
                );

            if (!link) return;


            const permitido =
                link.startsWith(
                    BASE + "/peliculas/"
                ) ||
                link.startsWith(
                    BASE + "/series/"
                ) ||
                link.startsWith(
                    BASE + "/anime/"
                );


            if (!permitido) {
                return;
            }


            if (
                /\/page\/\d+\/?$/
                    .test(link)
            ) {
                return;
            }


            links.add(
                limpiarUrl(link)
            );

        }
    );


    return procesarLista(
        Array.from(links)
    );
}


// ======================================================
// PROCESAR LISTA
// ======================================================

async function procesarLista(lista) {

    const resultados = [];


    /*
     * No eliminamos una película
     * solamente porque no tenga portada.
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


            /*
             * Series y anime:
             * cargar episodios.
             */

            if (
                item.tipo === "Serie" ||
                item.tipo === "Anime"
            ) {

                item =
                    await procesarEpisodios(
                        item
                    );

            }


            /*
             * IMPORTANTE:
             *
             * Aunque portada sea null,
             * conservamos el resultado.
             */

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
// CATÁLOGO INICIAL
// ======================================================

app.get(
    "/api/catalogo",
    async (req, res) => {

        try {

            const resultados =
                await buscar("");


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
