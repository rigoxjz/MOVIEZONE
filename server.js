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

        const p = new URL(urlStr);

        let pathname = p.pathname;

        if (!pathname.endsWith("/")) {
            pathname += "/";
        }

        return (
            `${p.protocol}//${p.host}${pathname}`
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
        await session.get(url, {
            validateStatus: () => true
        });

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
// TÍTULOS GENÉRICOS
// ======================================================

function esTituloGenerico(texto) {

    if (!texto) {
        return true;
    }


    const t =
        String(texto)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");


    if (t.length < 2) {
        return true;
    }


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

        "ver películas gratis",

        "misvideos",

        "moviezone"

    ];


    return genericos.some(
        palabra =>
            t.includes(
                palabra
            )
    );

}


// ======================================================
// EXTRAER TÍTULO
// ======================================================

function extraerTitulo(
    pagina,
    link
) {

    let nombre = null;


    // --------------------------------------------------
    // 1. H1
    // --------------------------------------------------

    pagina("h1").each(
        (_, elemento) => {

            if (nombre) return;


            const texto =
                pagina(elemento)
                    .text()
                    .trim()
                    .replace(/\s+/g, " ");


            if (
                !esTituloGenerico(
                    texto
                )
            ) {

                nombre = texto;

            }

        }
    );


    // --------------------------------------------------
    // 2. OG TITLE
    // --------------------------------------------------

    if (!nombre) {

        const ogTitle =
            pagina(
                'meta[property="og:title"]'
            ).attr("content");


        if (
            ogTitle &&
            !esTituloGenerico(
                ogTitle
            )
        ) {

            nombre =
                ogTitle
                    .trim()
                    .replace(
                        /\s+/g,
                        " "
                    );

        }

    }


    // --------------------------------------------------
    // 3. META TITLE
    // --------------------------------------------------

    if (!nombre) {

        const metaTitle =
            pagina(
                'meta[name="title"]'
            ).attr("content");


        if (
            metaTitle &&
            !esTituloGenerico(
                metaTitle
            )
        ) {

            nombre =
                metaTitle
                    .trim()
                    .replace(
                        /\s+/g,
                        " "
                    );

        }

    }


    // --------------------------------------------------
    // 4. TITLE HTML
    // --------------------------------------------------

    if (!nombre) {

        const htmlTitle =
            pagina("title")
                .first()
                .text()
                .trim()
                .replace(
                    /\s+/g,
                    " "
                );


        if (
            htmlTitle &&
            !esTituloGenerico(
                htmlTitle
            )
        ) {

            nombre =
                htmlTitle;

        }

    }


    // --------------------------------------------------
    // 5. OBTENER DEL SLUG
    // --------------------------------------------------

    if (!nombre) {

        try {

            const url =
                new URL(link);

            const partes =
                url.pathname
                    .split("/")
                    .filter(Boolean);


            if (partes.length) {

                let slug =
                    partes[
                        partes.length - 1
                    ];


                slug =
                    slug
                        .replace(
                            /-\d{4}$/,
                            ""
                        )
                        .replace(
                            /[-_]+/g,
                            " "
                        );


                if (slug) {

                    nombre =
                        slug
                            .replace(
                                /\b\w/g,
                                letra =>
                                    letra.toUpperCase()
                            )
                            .trim();

                }

            }

        } catch {}

    }


    // --------------------------------------------------
    // LIMPIEZA
    // --------------------------------------------------

    if (nombre) {

        nombre =
            nombre
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
// EXTRAER PORTADA
// ======================================================

function extraerPortada(
    pagina,
    link
) {

    let portada = null;


    // --------------------------------------------------
    // 1. JSON-LD
    // --------------------------------------------------

    pagina(
        'script[type="application/ld+json"]'
    ).each(
        (_, script) => {

            if (portada) return;


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

                }

                else if (
                    data &&
                    typeof data === "object"
                ) {

                    objetos =
                        data["@graph"] ||
                        [data];

                }


                for (
                    const obj
                    of objetos
                ) {

                    if (
                        !obj ||
                        typeof obj !==
                            "object"
                    ) {
                        continue;
                    }


                    // ImageObject

                    if (
                        obj["@type"] ===
                        "ImageObject"
                    ) {

                        portada =
                            obj.contentUrl ||
                            obj.url ||
                            null;

                    }


                    // image como string

                    if (
                        !portada &&
                        typeof obj.image ===
                            "string"
                    ) {

                        portada =
                            obj.image;

                    }


                    // image como objeto

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


                    // thumbnail

                    if (!portada) {

                        portada =
                            obj.thumbnailUrl ||
                            null;

                    }


                    if (portada) {
                        break;
                    }

                }

            } catch {}

        }
    );


    // --------------------------------------------------
    // 2. OG IMAGE
    // --------------------------------------------------

    if (!portada) {

        const ogImage =
            pagina(
                'meta[property="og:image"]'
            ).attr("content");


        if (ogImage) {

            portada =
                ogImage;

        }

    }


    // --------------------------------------------------
    // 3. TWITTER IMAGE
    // --------------------------------------------------

    if (!portada) {

        const twitterImage =
            pagina(
                'meta[name="twitter:image"]'
            ).attr("content");


        if (twitterImage) {

            portada =
                twitterImage;

        }

    }


    // --------------------------------------------------
    // 4. META IMAGE
    // --------------------------------------------------

    if (!portada) {

        const metaImage =
            pagina(
                'meta[name="image"]'
            ).attr("content");


        if (metaImage) {

            portada =
                metaImage;

        }

    }


    // --------------------------------------------------
    // 5. IMÁGENES DE LA PÁGINA
    // --------------------------------------------------

    if (!portada) {

        pagina("img").each(
            (_, img) => {

                if (portada) return;


                const elemento =
                    pagina(img);


                const posibles = [

                    elemento.attr("src"),

                    elemento.attr(
                        "data-src"
                    ),

                    elemento.attr(
                        "data-lazy-src"
                    ),

                    elemento.attr(
                        "data-original"
                    ),

                    elemento.attr(
                        "data-lazyload"
                    )

                ];


                for (
                    const imagen
                    of posibles
                ) {

                    if (!imagen) {
                        continue;
                    }


                    const texto =
                        imagen.toLowerCase();


                    // Ignorar basura

                    if (
                        texto.includes(
                            "logo"
                        ) ||
                        texto.includes(
                            "avatar"
                        ) ||
                        texto.includes(
                            "icon"
                        ) ||
                        texto.includes(
                            "banner"
                        ) ||
                        texto.includes(
                            "placeholder"
                        ) ||
                        texto.includes(
                            "loading"
                        )
                    ) {

                        continue;

                    }


                    portada =
                        imagen;

                    break;

                }

            }
        );

    }


    // --------------------------------------------------
    // URL ABSOLUTA
    // --------------------------------------------------

    if (portada) {

        portada =
            unirUrl(
                link,
                portada
            );

    }


    return portada;

}


// ======================================================
// EXTRAER DESCRIPCIÓN
// ======================================================

function extraerDescripcion(
    pagina
) {

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


    for (
        const descripcion
        of posibles
    ) {

        if (
            descripcion &&
            descripcion.trim().length > 10
        ) {

            return descripcion
                .trim()
                .replace(
                    /\s+/g,
                    " "
                );

        }

    }


    return "";

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


            // Episodios

            const pareceEpisodio =
                /episodio|episode|capitulo|capítulo|\bep\.?\s*\d+|\b\d+x\d+\b/i
                    .test(
                        contenido
                    );


            if (
                !pareceEpisodio
            ) {

                return;

            }


            if (
                vistos.has(url)
            ) {

                return;

            }


            // No agregar links a la
            // propia página

            if (
                url === paginaBase
            ) {

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

async function procesarPagina(
    link
) {

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


    let year = null;
    let genero = null;


    // ==================================================
    // JSON-LD PARA AÑO Y GÉNERO
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

                }

                else if (
                    data &&
                    typeof data ===
                        "object"
                ) {

                    objetos =
                        data["@graph"] ||
                        [data];

                }


                for (
                    const obj
                    of objetos
                ) {

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
                            ).substring(
                                0,
                                4
                            );

                    }


                    if (
                        !year &&
                        obj.datePublished
                    ) {

                        year =
                            String(
                                obj.datePublished
                            ).substring(
                                0,
                                4
                            );

                    }


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

    let reproductor = null;


    pagina("iframe[src]").each(
        (_, iframe) => {

            if (reproductor) {
                return;
            }


            const src =
                pagina(iframe)
                    .attr("src");


            if (!src) {
                return;
            }


            const iframeUrl =
                unirUrl(
                    link,
                    src
                );


            if (!iframeUrl) {
                return;
            }


            if (
                iframeUrl.startsWith(
                    BASE
                )
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
            pagina,
            link
        );


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
        const episodio
        of item.episodios
    ) {

        try {

            const pagina =
                await obtener(
                    episodio.link
                );


            let reproductor =
                null;


            pagina(
                "iframe[src]"
            ).each(
                (_, iframe) => {

                    if (
                        reproductor
                    ) {
                        return;
                    }


                    const src =
                        pagina(iframe)
                            .attr("src");


                    if (!src) {
                        return;
                    }


                    const iframeUrl =
                        unirUrl(
                            episodio.link,
                            src
                        );


                    if (
                        iframeUrl &&
                        iframeUrl.startsWith(
                            BASE
                        )
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
// BUSCAR
// ======================================================

async function buscar(
    termino,
    seccion = null
) {

    let url;


    // --------------------------------------------------
    // BÚSQUEDA
    // --------------------------------------------------

    if (termino) {

        url =
            BASE +
            "/?s=" +
            encodeURIComponent(
                termino
            );

    }

    // --------------------------------------------------
    // CATÁLOGO POR SECCIÓN
    // --------------------------------------------------

    else {

        if (
            seccion === "series"
        ) {

            url =
                BASE +
                "/series/";

        }

        else if (
            seccion === "animes"
        ) {

            url =
                BASE +
                "/animes/";

        }

        else {

            url =
                BASE +
                "/peliculas/";

        }

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


            if (!href) {
                return;
            }


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


            if (!href) {
                return;
            }


            // ------------------------------------------------
            // PERMITIR LAS TRES SECCIONES
            // ------------------------------------------------

            const permitido =

                href.startsWith(
                    BASE +
                    "/peliculas/"
                )

                ||

                href.startsWith(
                    BASE +
                    "/series/"
                )

                ||

                href.startsWith(
                    BASE +
                    "/animes/"
                );


            if (!permitido) {
                return;
            }


            // ------------------------------------------------
            // EVITAR PÁGINAS PRINCIPALES
            // ------------------------------------------------

            if (

                href ===
                limpiarUrl(
                    BASE +
                    "/peliculas/"
                )

                ||

                href ===
                limpiarUrl(
                    BASE +
                    "/series/"
                )

                ||

                href ===
                limpiarUrl(
                    BASE +
                    "/animes/"
                )

            ) {

                return;

            }


            // ------------------------------------------------
            // EVITAR PAGINACIÓN
            // ------------------------------------------------

            if (
                /\/page\/\d+\/?$/
                    .test(href)
            ) {

                return;

            }


            // ------------------------------------------------
            // SI ESTAMOS EN UNA SECCIÓN,
            // RESPETARLA
            // ------------------------------------------------

            if (
                !termino &&
                seccion ===
                    "peliculas" &&
                !href.startsWith(
                    BASE +
                    "/peliculas/"
                )
            ) {

                return;

            }


            if (
                !termino &&
                seccion ===
                    "series" &&
                !href.startsWith(
                    BASE +
                    "/series/"
                )
            ) {

                return;

            }


            if (
                !termino &&
                seccion ===
                    "animes" &&
                !href.startsWith(
                    BASE +
                    "/animes/"
                )
            ) {

                return;

            }


            links.add(href);

        }
    );


    const lista =
        Array.from(links)
            .sort();


    const resultados = [];


    // --------------------------------------------------
    // LÍMITE
    // --------------------------------------------------

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


            resultados.push(
                item
            );


            console.log(
                `[${i + 1}/${limite}] ${
                    item.nombre ||
                    lista[i]
                }`
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
                    req.query.q ||
                    ""
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
// CATÁLOGO PELÍCULAS
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
// CATÁLOGO SERIES
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
// CATÁLOGO ANIME
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
// RUTAS DE LA INTERFAZ
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
