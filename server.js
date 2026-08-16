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

        return new URL(
            relativa,
            base
        ).toString();

    } catch {

        return null;

    }
}


function limpiarUrl(urlStr) {

    try {

        const p =
            new URL(urlStr);

        let pathname =
            p.pathname;

        if (!pathname.endsWith("/")) {
            pathname += "/";
        }

        return (
            p.protocol +
            "//" +
            p.host +
            pathname
        );

    } catch {

        return urlStr;

    }
}


async function obtener(url) {

    const respuesta =
        await session.get(url);

    return cheerio.load(
        respuesta.data
    );
}


async function obtenerHTML(url) {

    const respuesta =
        await session.get(
            url,
            {
                validateStatus:
                    () => true
            }
        );

    return respuesta.data || "";

}


// ======================================================
// DETECTAR TIPO
// ======================================================

function detectarTipo(
    url,
    nombre = ""
) {

    const texto =
        `${url} ${nombre}`
            .toLowerCase();


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
// DETECTAR REPRODUCTOR
// ======================================================

async function detectarReproductor(
    url,
    pagina
) {

    const candidatos = [];

    const agregar = (
        urlEncontrada
    ) => {

        if (!urlEncontrada) {
            return;
        }


        try {

            const absoluta =
                new URL(
                    urlEncontrada,
                    url
                ).toString();


            if (
                !candidatos.includes(
                    absoluta
                )
            ) {

                candidatos.push(
                    absoluta
                );

            }

        } catch {}

    };


    // ==================================================
    // IFRAME
    // ==================================================

    pagina("iframe").each(
        (_, elemento) => {

            agregar(
                pagina(elemento)
                    .attr("src")
            );

            agregar(
                pagina(elemento)
                    .attr("data-src")
            );

            agregar(
                pagina(elemento)
                    .attr("data-url")
            );

            agregar(
                pagina(elemento)
                    .attr("data-embed")
            );

        }
    );


    // ==================================================
    // EMBED
    // ==================================================

    pagina("embed").each(
        (_, elemento) => {

            agregar(
                pagina(elemento)
                    .attr("src")
            );

        }
    );


    // ==================================================
    // VIDEO
    // ==================================================

    pagina("video").each(
        (_, elemento) => {

            agregar(
                pagina(elemento)
                    .attr("src")
            );

            agregar(
                pagina(elemento)
                    .attr("data-src")
            );

        }
    );


    // ==================================================
    // SOURCE
    // ==================================================

    pagina("source").each(
        (_, elemento) => {

            agregar(
                pagina(elemento)
                    .attr("src")
            );

            agregar(
                pagina(elemento)
                    .attr("data-src")
            );

        }
    );


    // ==================================================
    // ATRIBUTOS DE REPRODUCTOR
    // ==================================================

    pagina("[data-player]").each(
        (_, elemento) => {

            agregar(
                pagina(elemento)
                    .attr("data-player")
            );

        }
    );


    pagina("[data-video]").each(
        (_, elemento) => {

            agregar(
                pagina(elemento)
                    .attr("data-video")
            );

        }
    );


    pagina("[data-iframe]").each(
        (_, elemento) => {

            agregar(
                pagina(elemento)
                    .attr("data-iframe")
            );

        }
    );


    // ==================================================
    // BUSCAR URLs DENTRO DEL HTML
    // ==================================================

    const html =
        pagina.html() || "";


    const regex =
        /https?:\/\/[^\s"'<>\\]+/gi;


    const urls =
        html.match(regex) || [];


    for (
        const encontrada of urls
    ) {

        const limpia =
            encontrada
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


        agregar(limpia);

    }


    // ==================================================
    // PRIORIZAR REPRODUCTORES
    // ==================================================

    const prioridad = [

        "play.php",
        "/embed/",
        "/player/",
        "/embed-",
        ".m3u8",
        ".mp4"

    ];


    candidatos.sort(
        (a, b) => {

            const pa =
                prioridad.findIndex(
                    x =>
                        a
                            .toLowerCase()
                            .includes(x)
                );


            const pb =
                prioridad.findIndex(
                    x =>
                        b
                            .toLowerCase()
                            .includes(x)
                );


            return (
                (pa === -1 ? 999 : pa) -
                (pb === -1 ? 999 : pb)
            );

        }
    );


    // ==================================================
    // COMPROBAR CANDIDATOS
    // ==================================================

    for (
        const candidato of candidatos
    ) {

        try {

            // ------------------------------------------
            // M3U8 / MP4
            // ------------------------------------------

            if (
                candidato
                    .toLowerCase()
                    .includes(".m3u8") ||

                candidato
                    .toLowerCase()
                    .includes(".mp4")
            ) {

                return candidato;

            }


            // ------------------------------------------
            // PLAY.PHP
            // ------------------------------------------

            if (
                candidato
                    .toLowerCase()
                    .includes("play.php")
            ) {

                const htmlPlayer =
                    await obtenerHTML(
                        candidato
                    );


                // window.location.href

                let match =
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

                match =
                    htmlPlayer.match(
                        /location\.href\s*=\s*["']([^"']+)/i
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


                // window.location

                match =
                    htmlPlayer.match(
                        /window\.location\s*=\s*["']([^"']+)/i
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


                // Buscar otra URL dentro del HTML

                const urlsPlayer =
                    htmlPlayer.match(
                        regex
                    ) || [];


                for (
                    const encontrada of
                    urlsPlayer
                ) {

                    const limpia =
                        encontrada
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
                        limpia
                            .toLowerCase()
                            .includes(".m3u8") ||

                        limpia
                            .toLowerCase()
                            .includes(".mp4") ||

                        limpia
                            .toLowerCase()
                            .includes("/embed/") ||

                        limpia
                            .toLowerCase()
                            .includes("/player/")
                    ) {

                        return limpia;

                    }

                }

            }


            // ------------------------------------------
            // EMBED / PLAYER
            // ------------------------------------------

            if (

                candidato
                    .toLowerCase()
                    .includes("/embed/") ||

                candidato
                    .toLowerCase()
                    .includes("/player/") ||

                candidato
                    .toLowerCase()
                    .includes("embed-")
            ) {

                return candidato;

            }

        } catch (error) {

            console.log(
                "No se pudo comprobar:",
                candidato
            );

        }

    }


    return null;

}


// ======================================================
// EXTRAER EPISODIOS
// ======================================================

function extraerEpisodios(
    pagina,
    paginaBase
) {

    const episodios = [];

    const vistos =
        new Set();


    pagina("a[href]").each(
        (_, elemento) => {

            const texto =
                pagina(elemento)
                    .text()
                    .trim()
                    .replace(
                        /\s+/g,
                        " "
                    );


            const href =
                pagina(elemento)
                    .attr("href");


            if (!href) {
                return;
            }


            const url =
                unirUrl(
                    paginaBase,
                    href
                );


            if (!url) {
                return;
            }


            const contenido =
                `${texto} ${url}`
                    .toLowerCase();


            // ------------------------------------------
            // Episodio
            // ------------------------------------------

            const pareceEpisodio =
                /episodio|episode|capitulo|capítulo|\bep\.?\s*\d+|\d+x\d+/i
                    .test(
                        contenido
                    );


            if (!pareceEpisodio) {
                return;
            }


            // ------------------------------------------
            // Evitar duplicados
            // ------------------------------------------

            if (
                vistos.has(url)
            ) {

                return;

            }


            vistos.add(url);


            // ------------------------------------------
            // Limpiar nombre
            // ------------------------------------------

            let nombre =
                texto ||
                `Episodio ${
                    episodios.length + 1
                }`;


            nombre =
                nombre
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();


            episodios.push({

                nombre,

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

async function procesarEpisodios(
    item
) {

    if (
        !Array.isArray(
            item.episodios
        ) ||
        !item.episodios.length
    ) {

        return item;

    }


    const episodios = [];


    for (
        const episodio of
        item.episodios
    ) {

        try {

            console.log(
                "Procesando episodio:",
                episodio.nombre
            );


            const pagina =
                await obtener(
                    episodio.link
                );


            const reproductor =
                await detectarReproductor(
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

async function procesarPagina(
    link
) {

    const pagina =
        await obtener(link);


    let nombre = null;
    let portada = null;
    let descripcion = "";
    let year = null;
    let genero = null;


    // ==================================================
    // NOMBRE
    // ==================================================

    const h1 =
        pagina("h1").first();


    if (h1.length) {

        nombre =
            h1.text()
                .trim()
                .replace(
                    /\s+/g,
                    " "
                );

    }


    if (!nombre) {

        const ogTitle =
            pagina(
                'meta[property="og:title"]'
            ).attr(
                "content"
            );


        if (
            ogTitle &&
            !ogTitle
                .toLowerCase()
                .includes(
                    "descargar peliculas gratis"
                )
        ) {

            nombre =
                ogTitle
                    .trim();

        }

    }


    // ==================================================
    // DESCRIPCIÓN
    // ==================================================

    const ogDescription =
        pagina(
            'meta[property="og:description"]'
        ).attr(
            "content"
        );


    if (
        ogDescription
    ) {

        descripcion =
            ogDescription
                .trim();

    }


    // ==================================================
    // JSON-LD
    // ==================================================

    pagina(
        'script[type="application/ld+json"]'
    ).each(
        (_, script) => {

            try {

                const raw =
                    pagina(script).html();


                if (!raw) {
                    return;
                }


                const data =
                    JSON.parse(raw);


                let objetos = [];


                if (
                    Array.isArray(data)
                ) {

                    objetos = data;

                } else if (
                    data &&
                    typeof data ===
                        "object"
                ) {

                    objetos =
                        data["@graph"] ||
                        [data];

                }


                for (
                    const obj of objetos
                ) {

                    if (
                        !obj ||
                        typeof obj !==
                            "object"
                    ) {

                        continue;

                    }


                    // ------------------------------
                    // PORTADA
                    // ------------------------------

                    if (!portada) {

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
                                obj.image ||
                                obj.thumbnailUrl ||
                                null;

                        }

                    }


                    // ------------------------------
                    // AÑO
                    // ------------------------------

                    if (
                        !year &&
                        obj.dateCreated
                    ) {

                        year =
                            String(
                                obj.dateCreated
                            ).substring(
                                0,
                                4
                            );

                    }


                    // ------------------------------
                    // GÉNERO
                    // ------------------------------

                    if (
                        !genero &&
                        obj.genre
                    ) {

                        genero =
                            Array.isArray(
                                obj.genre
                            )
                                ? obj.genre.join(
                                    ", "
                                )
                                : obj.genre;

                    }

                }

            } catch {}

        }
    );


    // ==================================================
    // OG IMAGE
    // ==================================================

    if (!portada) {

        const og =
            pagina(
                'meta[property="og:image"]'
            ).attr(
                "content"
            );


        if (og) {

            portada = og;

        }

    }


    // ==================================================
    // IMÁGENES ALTERNATIVAS
    // ==================================================

    if (!portada) {

        const imagenes = [

            'meta[name="twitter:image"]',

            'meta[property="twitter:image"]',

            'link[rel="image_src"]',

            'img[src]'

        ];


        for (
            const selector of
            imagenes
        ) {

            if (portada) {
                break;
            }


            const elemento =
                pagina(
                    selector
                ).first();


            if (!elemento.length) {
                continue;
            }


            portada =
                elemento.attr(
                    "content"
                ) ||
                elemento.attr(
                    "href"
                ) ||
                elemento.attr(
                    "src"
                ) ||
                null;

        }

    }


    // ==================================================
    // CONVERTIR PORTADA
    // ==================================================

    if (portada) {

        portada =
            unirUrl(
                link,
                portada
            );

    }


    // ==================================================
    // TIPO
    // ==================================================

    const tipo =
        detectarTipo(
            link,
            nombre || ""
        );


    // ==================================================
    // REPRODUCTOR
    // ==================================================

    const reproductor =
        await detectarReproductor(
            link,
            pagina
        );


    // ==================================================
    // EPISODIOS
    // ==================================================

    const episodios =
        extraerEpisodios(
            pagina,
            link
        );


    return {

        nombre:
            nombre ||
            "Sin título",

        portada:

            portada ||
            null,

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
// BUSCAR
// ======================================================

async function buscar(
    termino
) {

    let url;


    // --------------------------------------------------
    // Búsqueda normal
    // --------------------------------------------------

    if (termino) {

        url =
            BASE +
            "/?s=" +
            encodeURIComponent(
                termino
            );

    } else {

        /*
         * Para catálogo inicial usamos
         * las tres secciones.
         */

        const secciones = [

            "/peliculas/",
            "/series/",
            "/animes/"

        ];


        const todos =
            new Set();


        for (
            const seccion of
            secciones
        ) {

            try {

                const pagina =
                    await obtener(
                        BASE + seccion
                    );


                pagina(
                    "a[href]"
                ).each(
                    (_, elemento) => {

                        let href =
                            pagina(elemento)
                                .attr(
                                    "href"
                                );


                        if (!href) {
                            return;
                        }


                        href =
                            unirUrl(
                                BASE,
                                href
                            );


                        if (!href) {
                            return;
                        }


                        href =
                            limpiarUrl(
                                href
                            );


                        const permitido =

                            href.startsWith(
                                BASE +
                                "/peliculas/"
                            ) ||

                            href.startsWith(
                                BASE +
                                "/series/"
                            ) ||

                            href.startsWith(
                                BASE +
                                "/anime/"
                            ) ||

                            href.startsWith(
                                BASE +
                                "/animes/"
                            );


                        if (
                            !permitido
                        ) {

                            return;

                        }


                        if (
                            /\/page\/\d+\/?$/
                                .test(
                                    href
                                )
                        ) {

                            return;

                        }


                        if (
                            href ===
                            limpiarUrl(
                                BASE +
                                "/peliculas/"
                            )
                        ) {

                            return;

                        }


                        if (
                            href ===
                            limpiarUrl(
                                BASE +
                                "/series/"
                            )
                        ) {

                            return;

                        }


                        if (
                            href ===
                            limpiarUrl(
                                BASE +
                                "/animes/"
                            )
                        ) {

                            return;

                        }


                        todos.add(
                            href
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


        url = null;


        return procesarLista(
            Array.from(todos)
        );

    }


    // --------------------------------------------------
    // Página de búsqueda
    // --------------------------------------------------

    const pagina =
        await obtener(url);


    const links =
        new Set();


    pagina("a[href]").each(
        (_, elemento) => {

            let href =
                pagina(elemento)
                    .attr("href");


            if (!href) {
                return;
            }


            href =
                unirUrl(
                    BASE,
                    href
                );


            if (!href) {
                return;
            }


            href =
                limpiarUrl(
                    href
                );


            const permitido =

                href.startsWith(
                    BASE +
                    "/peliculas/"
                ) ||

                href.startsWith(
                    BASE +
                    "/series/"
                ) ||

                href.startsWith(
                    BASE +
                    "/anime/"
                ) ||

                href.startsWith(
                    BASE +
                    "/animes/"
                );


            if (!permitido) {
                return;
            }


            if (
                /\/page\/\d+\/?$/
                    .test(
                        href
                    )
            ) {

                return;

            }


            links.add(
                href
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

async function procesarLista(
    lista
) {

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

            console.log(
                `[${i + 1}/${limite}]`,
                lista[i]
            );


            let item =
                await procesarPagina(
                    lista[i]
                );


            /*
             * Series y anime:
             * procesar sus episodios.
             */

            if (
                item.tipo ===
                    "Serie" ||

                item.tipo ===
                    "Anime"
            ) {

                item =
                    await procesarEpisodios(
                        item
                    );

            }


            /*
             * Si no tiene reproductor
             * y tampoco episodios con
             * reproductor, se conserva
             * igualmente para mostrarlo.
             */

            resultados.push(
                item
            );


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
// CATÁLOGO
// ======================================================

app.get(
    "/api/catalogo",
    async (req, res) => {

        try {

            const resultados =
                await buscar(
                    ""
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
// SECCIÓN ESPECÍFICA
// ======================================================

app.get(
    "/api/seccion/:tipo",
    async (req, res) => {

        try {

            let tipo =
                String(
                    req.params.tipo
                )
                    .toLowerCase()
                    .replace(
                        /^\/|\/$/g,
                        ""
                    );


            const secciones = {

                peliculas:
                    "/peliculas/",

                series:
                    "/series/",

                anime:
                    "/animes/",

                animes:
                    "/animes/"

            };


            if (
                !secciones[tipo]
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Sección no válida"

                    });

            }


            const pagina =
                await obtener(
                    BASE +
                    secciones[tipo]
                );


            const links =
                new Set();


            pagina("a[href]").each(
                (_, elemento) => {

                    let href =
                        pagina(elemento)
                            .attr(
                                "href"
                            );


                    if (!href) {
                        return;
                    }


                    href =
                        unirUrl(
                            BASE,
                            href
                        );


                    if (!href) {
                        return;
                    }


                    href =
                        limpiarUrl(
                            href
                        );


                    if (
                        !href.startsWith(
                            BASE +
                            secciones[tipo]
                        )
                    ) {

                        return;

                    }


                    if (
                        href ===
                        limpiarUrl(
                            BASE +
                            secciones[tipo]
                        )
                    ) {

                        return;

                    }


                    if (
                        /\/page\/\d+\/?$/
                            .test(
                                href
                            )
                    ) {

                        return;

                    }


                    links.add(
                        href
                    );

                }
            );


            const resultados =
                await procesarLista(
                    Array.from(links)
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
                        "No se pudo cargar la sección",

                    detalle:
                        error.message

                });

        }

    }
);


// ======================================================
// ARCHIVOS FRONTEND
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
// RUTAS DE SECCIONES
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
// RUTA PRINCIPAL
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
