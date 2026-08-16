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
// CONFIGURACIÓN
// ======================================================

const SECCIONES = {
    peliculas: "/peliculas/",
    series: "/series/",
    anime: "/animes/"
};

const CACHE_TTL = 5 * 60 * 1000;

const cache = {};


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

    const respuesta = await session.get(url, {
        validateStatus: () => true
    });

    return respuesta.data || "";
}


// ======================================================
// TIPO
// ======================================================

function detectarTipo(seccion, url, nombre = "") {

    const texto =
        `${seccion} ${url} ${nombre}`.toLowerCase();

    if (
        texto.includes("anime") ||
        texto.includes("/animes/")
    ) {
        return "Anime";
    }

    if (
        texto.includes("serie") ||
        texto.includes("/series/")
    ) {
        return "Serie";
    }

    return "Película";
}


// ======================================================
// PORTADA
// ======================================================

function extraerPortada($, link) {

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
                        obj["@type"] === "ImageObject"
                    ) {

                        portada =
                            obj.contentUrl ||
                            obj.url ||
                            null;

                    }


                    if (!portada) {

                        const image = obj.image;

                        if (typeof image === "string") {
                            portada = image;
                        }

                        if (
                            image &&
                            typeof image === "object"
                        ) {

                            portada =
                                image.url ||
                                image.contentUrl ||
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

            } catch {
                // JSON-LD inválido
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
            null;

    }


    // ==================================================
    // TWITTER IMAGE
    // ==================================================

    if (!portada) {

        portada =
            $('meta[name="twitter:image"]')
                .attr("content") ||
            null;

    }


    // ==================================================
    // LINK IMAGE
    // ==================================================

    if (!portada) {

        portada =
            $('link[rel="image_src"]')
                .attr("href") ||
            null;

    }


    // ==================================================
    // IMÁGENES DE LA PÁGINA
    // ==================================================

    if (!portada) {

        $("img").each((_, img) => {

            if (portada) return;

            const $img = $(img);

            const posibles = [
                $img.attr("src"),
                $img.attr("data-src"),
                $img.attr("data-lazy-src"),
                $img.attr("data-original")
            ];

            for (const imagen of posibles) {

                if (
                    imagen &&
                    !imagen.startsWith("data:")
                ) {

                    portada = imagen;
                    break;

                }

            }

        });

    }


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
// DESCRIPCIÓN
// ======================================================

function extraerDescripcion($) {

    let descripcion =
        $('meta[property="og:description"]')
            .attr("content");

    if (descripcion) {
        return descripcion.trim();
    }


    descripcion =
        $('meta[name="description"]')
            .attr("content");

    if (descripcion) {
        return descripcion.trim();
    }


    return "";
}


// ======================================================
// NOMBRE
// ======================================================

function extraerNombre($) {

    let nombre =
        $("h1")
            .first()
            .text()
            .trim()
            .replace(/\s+/g, " ");

    if (nombre) {

        // Evita algunos títulos genéricos
        if (
            !/descargar peliculas gratis/i.test(nombre)
        ) {
            return nombre;
        }

    }


    const ogTitle =
        $('meta[property="og:title"]')
            .attr("content");

    if (ogTitle) {

        const limpio =
            ogTitle
                .trim()
                .replace(/\s+/g, " ");

        if (
            !/descargar peliculas gratis/i.test(limpio)
        ) {
            return limpio;
        }

    }


    const title =
        $("title")
            .first()
            .text()
            .trim()
            .replace(/\s+/g, " ");

    if (
        title &&
        !/descargar peliculas gratis/i.test(title)
    ) {
        return title;
    }


    return "Sin título";
}


// ======================================================
// REPRODUCTOR
// ======================================================

function extraerReproductor($, link) {

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


            /*
             * Mantiene el comportamiento
             * que ya tenías funcionando.
             */

            if (
                iframeUrl.startsWith(BASE)
            ) {

                reproductor =
                    iframeUrl;

            }

        }
    );


    return reproductor;
}


// ======================================================
// EPISODIOS
// ======================================================

function extraerEpisodios($, paginaBase) {

    const episodios = [];

    const vistos = new Set();


    $("a[href]").each(
        (_, elemento) => {

            const texto =
                $(elemento)
                    .text()
                    .trim()
                    .replace(/\s+/g, " ");


            const href =
                $(elemento).attr("href");

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
             * Formatos:
             *
             * Episodio 1
             * Episode 1
             * Capítulo 1
             * 1x1
             */

            const pareceEpisodio =
                /episodio|episode|capitulo|capítulo|\b\d+\s*x\s*\d+\b|\bep\.?\s*\d+/i
                    .test(contenido);


            if (!pareceEpisodio) {
                return;
            }


            /*
             * Evitar enlaces externos
             */

            if (
                !url.startsWith(BASE)
            ) {
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
             * Limpieza de textos basura
             * que pueden venir de SVG/CSS.
             */

            nombre =
                nombre
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();


            if (
                nombre.length > 100
            ) {

                const match =
                    nombre.match(
                        /(\d+\s*x\s*\d+|episodio\s*\d+|episode\s*\d+)/i
                    );

                if (match) {
                    nombre = match[1];
                }

            }


            episodios.push({

                nombre,

                link: url,

                video: null

            });

        }
    );


    /*
     * Orden numérico
     */

    episodios.sort((a, b) => {

        const obtenerNumero = texto => {

            const m =
                texto.match(
                    /(\d+)\s*x\s*(\d+)|(?:episodio|episode|capitulo|capítulo|ep\.?)\s*(\d+)/i
                );

            if (!m) return 999999;

            if (m[2]) {
                return (
                    parseInt(m[1]) * 1000 +
                    parseInt(m[2])
                );
            }

            return parseInt(m[3]);

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

        const pagina =
            await obtener(
                episodio.link
            );


        const video =
            extraerReproductor(
                pagina,
                episodio.link
            );


        return {

            nombre:
                episodio.nombre,

            link:
                episodio.link,

            video

        };

    } catch {

        return {

            nombre:
                episodio.nombre,

            link:
                episodio.link,

            video: null

        };

    }

}


// ======================================================
// PROCESAR FICHA
// ======================================================

async function procesarPagina(
    link,
    seccion
) {

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
        extraerDescripcion(
            pagina
        );


    const tipo =
        detectarTipo(
            seccion,
            link,
            nombre
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

        nombre,

        portada,

        descripcion,

        tipo,

        link,

        reproductor,

        episodios

    };
}


// ======================================================
// OBTENER LISTA DE UNA SECCIÓN
// ======================================================

async function obtenerListaSeccion(
    seccion,
    paginaNumero = 1
) {

    const ruta =
        SECCIONES[seccion];

    if (!ruta) {
        throw new Error(
            "Sección no válida"
        );
    }


    let url =
        BASE + ruta;


    if (paginaNumero > 1) {

        url =
            BASE +
            ruta +
            "page/" +
            paginaNumero +
            "/";

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


            href =
                unirUrl(
                    BASE,
                    href
                );

            if (!href) return;


            href =
                limpiarUrl(
                    href
                );


            /*
             * Categoría correspondiente
             */

            const prefijo =
                BASE + ruta;


            if (
                !href.startsWith(
                    prefijo
                )
            ) {
                return;
            }


            /*
             * No agregar la página principal
             */

            if (
                href.replace(/\/$/, "") ===
                prefijo.replace(/\/$/, "")
            ) {
                return;
            }


            /*
             * No agregar paginación
             */

            if (
                /\/page\/\d+\/?$/.test(
                    href
                )
            ) {
                return;
            }


            links.add(href);

        }
    );


    return Array.from(
        links
    ).sort();

}


// ======================================================
// CATÁLOGO POR LOTES
// ======================================================

async function cargarCatalogo(
    seccion,
    paginaNumero = 1,
    limite = 5
) {

    const clave =
        `${seccion}-${paginaNumero}-${limite}`;


    /*
     * CACHE
     */

    if (
        cache[clave] &&
        Date.now() - cache[clave].fecha <
            CACHE_TTL
    ) {

        return cache[clave].datos;

    }


    const lista =
        await obtenerListaSeccion(
            seccion,
            paginaNumero
        );


    /*
     * Solo 5 por petición
     */

    const seleccion =
        lista.slice(
            0,
            limite
        );


    const resultados = [];


    for (
        let i = 0;
        i < seleccion.length;
        i++
    ) {

        const link =
            seleccion[i];


        console.log(
            `[${i + 1}/${seleccion.length}] ${link}`
        );


        try {

            let item =
                await procesarPagina(
                    link,
                    seccion
                );


            /*
             * Series y anime:
             * procesar sus episodios.
             */

            if (
                (
                    item.tipo === "Serie" ||
                    item.tipo === "Anime"
                ) &&
                item.episodios.length
            ) {

                const episodios = [];


                for (
                    const episodio
                    of item.episodios
                ) {

                    const procesado =
                        await procesarEpisodio(
                            episodio
                        );

                    episodios.push(
                        procesado
                    );

                }


                item.episodios =
                    episodios;

            }


            resultados.push(
                item
            );


        } catch (error) {

            console.error(
                "Error:",
                link,
                error.message
            );

        }

    }


    const datos = {

        resultados,

        pagina:
            paginaNumero,

        siguientePagina:
            paginaNumero + 1,

        cantidad:
            resultados.length,

        hayMas:
            lista.length > limite,

        seccion

    };


    cache[clave] = {

        fecha:
            Date.now(),

        datos

    };


    return datos;
}


// ======================================================
// BÚSQUEDA
// ======================================================

async function buscar(
    termino,
    limite = 5
) {

    const url =
        BASE +
        "/?s=" +
        encodeURIComponent(
            termino
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


            href =
                unirUrl(
                    BASE,
                    href
                );

            if (!href) return;


            href =
                limpiarUrl(
                    href
                );


            const permitido =
                href.startsWith(
                    BASE + "/peliculas/"
                ) ||
                href.startsWith(
                    BASE + "/series/"
                ) ||
                href.startsWith(
                    BASE + "/animes/"
                );


            if (!permitido) {
                return;
            }


            if (
                /\/page\/\d+\/?$/.test(
                    href
                )
            ) {
                return;
            }


            links.add(href);

        }
    );


    const lista =
        Array.from(
            links
        ).sort();


    const seleccion =
        lista.slice(
            0,
            limite
        );


    const resultados = [];


    for (
        const link
        of seleccion
    ) {

        try {

            const seccion =
                link.includes("/series/")
                    ? "series"
                    : link.includes("/animes/")
                        ? "anime"
                        : "peliculas";


            const item =
                await procesarPagina(
                    link,
                    seccion
                );


            resultados.push(
                item
            );

        } catch {}

    }


    return {

        resultados,

        cantidad:
            resultados.length

    };

}


// ======================================================
// API CATÁLOGO
// ======================================================

app.get(
    "/api/catalogo",
    async (req, res) => {

        try {

            const seccion =
                String(
                    req.query.seccion ||
                    "peliculas"
                ).toLowerCase();


            const pagina =
                Math.max(
                    1,
                    parseInt(
                        req.query.pagina ||
                        "1"
                    )
                );


            const datos =
                await cargarCatalogo(
                    seccion,
                    pagina,
                    5
                );


            res.json(
                datos
            );


        } catch (error) {

            console.error(
                error
            );


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
                    req.query.q ||
                    ""
                ).trim();


            if (!termino) {

                return res.status(400).json({

                    error:
                        "Escribe algo para buscar"

                });

            }


            const datos =
                await buscar(
                    termino,
                    5
                );


            res.json(
                datos
            );


        } catch (error) {

            console.error(
                error
            );


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

app.get(
    /^\/(?!api\/).*/,
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
