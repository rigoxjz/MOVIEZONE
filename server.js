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
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

    "Accept-Language":
        "es-MX,es;q=0.9,en;q=0.8"
};

const session = axios.create({
    headers: HEADERS,
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: status =>
        status >= 200 && status < 400
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

        const u =
            new URL(urlStr);

        let pathname =
            u.pathname;

        if (!pathname.endsWith("/")) {
            pathname += "/";
        }

        return (
            u.protocol +
            "//" +
            u.host +
            pathname
        );

    } catch {

        return urlStr;

    }

}


async function obtenerHTML(url) {

    const respuesta =
        await session.get(url);

    return respuesta.data || "";

}


async function obtener(url) {

    const html =
        await obtenerHTML(url);

    return cheerio.load(html);

}


// ======================================================
// NORMALIZAR TEXTO
// ======================================================

function limpiarTexto(texto) {

    if (!texto) {
        return null;
    }

    return String(texto)
        .replace(/\s+/g, " ")
        .trim();

}


// ======================================================
// DETECTAR TIPO
// ======================================================

function detectarTipo(url, nombre = "") {

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
        texto.includes("/serie/") ||
        texto.includes("serie")
    ) {

        return "Serie";

    }

    return "Película";

}


// ======================================================
// EXTRAER TÍTULO
// ======================================================

function extraerTitulo($pagina) {

    let nombre = null;


    // --------------------------------------------------
    // 1. H1
    // --------------------------------------------------

    const h1 =
        $pagina("h1").first();

    if (h1.length) {

        nombre =
            limpiarTexto(
                h1.text()
            );

    }


    // --------------------------------------------------
    // 2. OG TITLE
    // --------------------------------------------------

    if (!nombre) {

        const ogTitle =
            $pagina(
                'meta[property="og:title"]'
            ).attr("content");

        if (ogTitle) {

            nombre =
                limpiarTexto(
                    ogTitle
                );

        }

    }


    // --------------------------------------------------
    // 3. TITLE
    // --------------------------------------------------

    if (!nombre) {

        const title =
            $pagina("title").first().text();

        if (title) {

            nombre =
                limpiarTexto(title);

        }

    }


    // --------------------------------------------------
    // LIMPIAR TÍTULOS GENÉRICOS
    // --------------------------------------------------

    if (nombre) {

        const genericos = [

            "descargar peliculas gratis por mega",
            "descargar películas gratis por mega",
            "peliculas gratis",
            "películas gratis",
            "peliculas online",
            "películas online",
            "series online",
            "anime online"

        ];

        const minus =
            nombre.toLowerCase();

        for (const generico of genericos) {

            if (
                minus === generico ||
                minus.startsWith(
                    generico
                )
            ) {

                nombre = null;
                break;

            }

        }

    }


    return nombre;

}


// ======================================================
// EXTRAER PORTADA
// ======================================================

function extraerPortada(
    $pagina,
    paginaUrl
) {

    let portada = null;


    // ==================================================
    // 1. JSON-LD
    // ==================================================

    $pagina(
        'script[type="application/ld+json"]'
    ).each((_, script) => {

        if (portada) {
            return;
        }

        try {

            const raw =
                $pagina(script).html();

            if (!raw) {
                return;
            }

            const data =
                JSON.parse(raw);

            let objetos = [];


            if (Array.isArray(data)) {

                objetos = data;

            } else if (
                data &&
                typeof data === "object"
            ) {

                if (
                    Array.isArray(
                        data["@graph"]
                    )
                ) {

                    objetos =
                        data["@graph"];

                } else {

                    objetos = [data];

                }

            }


            for (
                const obj of objetos
            ) {

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

                    portada =
                        obj.image ||
                        obj.thumbnailUrl ||
                        obj.contentUrl ||
                        obj.url ||
                        null;

                }


                if (portada) {
                    break;
                }

            }

        } catch {}

    });


    // ==================================================
    // 2. OG IMAGE
    // ==================================================

    if (!portada) {

        portada =
            $pagina(
                'meta[property="og:image"]'
            ).attr("content") ||
            null;

    }


    // ==================================================
    // 3. TWITTER IMAGE
    // ==================================================

    if (!portada) {

        portada =
            $pagina(
                'meta[name="twitter:image"]'
            ).attr("content") ||
            null;

    }


    // ==================================================
    // 4. LINK IMAGE
    // ==================================================

    if (!portada) {

        portada =
            $pagina(
                'link[rel="image_src"]'
            ).attr("href") ||
            null;

    }


    // ==================================================
    // 5. IMÁGENES DE LA PÁGINA
    // ==================================================

    if (!portada) {

        $pagina("img").each((_, img) => {

            if (portada) {
                return;
            }

            const src =
                $pagina(img).attr("src") ||
                $pagina(img).attr("data-src") ||
                $pagina(img).attr("data-lazy-src");

            if (!src) {
                return;
            }

            const url =
                unirUrl(
                    paginaUrl,
                    src
                );

            if (!url) {
                return;
            }

            const texto =
                (
                    ($pagina(img).attr("alt") || "") +
                    " " +
                    ($pagina(img).attr("class") || "")
                ).toLowerCase();

            if (
                texto.includes("logo") ||
                texto.includes("avatar") ||
                texto.includes("icon")
            ) {
                return;
            }

            portada = url;

        });

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
// EXTRAER DESCRIPCIÓN
// ======================================================

function extraerDescripcion(
    $pagina
) {

    let descripcion = "";


    const og =
        $pagina(
            'meta[property="og:description"]'
        ).attr("content");


    if (og) {

        descripcion =
            limpiarTexto(og);

    }


    if (!descripcion) {

        const meta =
            $pagina(
                'meta[name="description"]'
            ).attr("content");

        if (meta) {

            descripcion =
                limpiarTexto(meta);

        }

    }


    return descripcion || "";

}


// ======================================================
// EXTRAER AÑO / GÉNERO
// ======================================================

function extraerMetadata(
    $pagina
) {

    let year = null;
    let genero = null;


    $pagina(
        'script[type="application/ld+json"]'
    ).each((_, script) => {

        try {

            const raw =
                $pagina(script).html();

            if (!raw) {
                return;
            }

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


            for (
                const obj of objetos
            ) {

                if (
                    !obj ||
                    typeof obj !== "object"
                ) {
                    continue;
                }


                if (!year) {

                    const fecha =
                        obj.dateCreated ||
                        obj.datePublished ||
                        obj.releaseDate;

                    if (fecha) {

                        const match =
                            String(fecha)
                                .match(/\d{4}/);

                        if (match) {
                            year = match[0];
                        }

                    }

                }


                if (!genero && obj.genre) {

                    genero =
                        Array.isArray(obj.genre)
                            ? obj.genre.join(", ")
                            : String(obj.genre);

                }

            }

        } catch {}

    });


    return {
        year,
        genero
    };

}


// ======================================================
// DETECTAR REPRODUCTOR
// ======================================================

async function detectarReproductor(
    url,
    $pagina
) {

    const candidatos = [];


    function agregar(urlEncontrada) {

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

    }


    // ==================================================
    // 1. IFRAME
    // ==================================================

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


    // ==================================================
    // 2. EMBED
    // ==================================================

    $pagina("embed").each((_, el) => {

        agregar(
            $pagina(el).attr("src")
        );

    });


    // ==================================================
    // 3. VIDEO
    // ==================================================

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


    // ==================================================
    // 4. ATRIBUTOS DE PLAYER
    // ==================================================

    $pagina("[data-player]").each(
        (_, el) => {

            agregar(
                $pagina(el)
                    .attr("data-player")
            );

        }
    );


    $pagina("[data-video]").each(
        (_, el) => {

            agregar(
                $pagina(el)
                    .attr("data-video")
            );

        }
    );


    $pagina("[data-iframe]").each(
        (_, el) => {

            agregar(
                $pagina(el)
                    .attr("data-iframe")
            );

        }
    );


    // ==================================================
    // 5. URLS DENTRO DEL HTML
    // ==================================================

    const html =
        $pagina.html() || "";

    const regex =
        /https?:\/\/[^\s"'<>\\]+/gi;

    const urls =
        html.match(regex) || [];


    for (
        const encontrada of urls
    ) {

        let limpia =
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
    // 6. PRIORIZAR
    // ==================================================

    const prioridad = [

        "play.php",
        "/embed/",
        "/player/",
        "/embed-",
        "iframe",
        ".m3u8",
        ".mp4"

    ];


    candidatos.sort((a, b) => {

        const pa =
            prioridad.findIndex(
                x =>
                    a.toLowerCase()
                        .includes(x)
            );

        const pb =
            prioridad.findIndex(
                x =>
                    b.toLowerCase()
                        .includes(x)
            );

        return (
            (pa === -1 ? 999 : pa) -
            (pb === -1 ? 999 : pb)
        );

    });


    // ==================================================
    // 7. PROBAR CANDIDATOS
    // ==================================================

    for (
        const candidato of candidatos
    ) {

        try {

            const lower =
                candidato.toLowerCase();


            // ------------------------------------------
            // M3U8 / MP4 DIRECTO
            // ------------------------------------------

            if (
                lower.includes(".m3u8") ||
                lower.includes(".mp4")
            ) {

                return candidato;

            }


            // ------------------------------------------
            // PLAY.PHP
            // ------------------------------------------

            if (
                lower.includes("play.php")
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


                // URL dentro de play.php
                const urlsPlayer =
                    htmlPlayer.match(
                        regex
                    ) || [];


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


                    const low =
                        limpia.toLowerCase();


                    if (
                        low.includes(".m3u8") ||
                        low.includes(".mp4") ||
                        low.includes("/embed/") ||
                        low.includes("/player/")
                    ) {

                        return limpia;

                    }

                }

            }


            // ------------------------------------------
            // EMBED / PLAYER
            // ------------------------------------------

            if (
                lower.includes("/embed/") ||
                lower.includes("/player/") ||
                lower.includes("embed-")
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
// EXTRAER EPISODIOS
// ======================================================

function extraerEpisodios(
    $pagina,
    paginaBase
) {

    const episodios = [];

    const vistos =
        new Set();


    $pagina("a[href]").each(
        (_, elemento) => {

            const texto =
                limpiarTexto(
                    $pagina(elemento).text()
                ) || "";


            const href =
                $pagina(elemento)
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


            const pareceEpisodio =
                /episodio|episode|capitulo|capítulo|\bep\.?\s*\d+|\d+x\d+/i
                    .test(contenido);


            if (!pareceEpisodio) {
                return;
            }


            // Evitar enlaces basura
            if (
                url === paginaBase
            ) {
                return;
            }


            if (
                vistos.has(url)
            ) {
                return;
            }


            vistos.add(url);


            let nombre =
                texto ||
                null;


            // ------------------------------------------
            // Limpiar textos como "Disponible"
            // ------------------------------------------

            nombre =
                nombre
                    ?.replace(
                        /\bDisponible\b/gi,
                        ""
                    )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();


            // ------------------------------------------
            // Si el texto no sirve, usar URL
            // ------------------------------------------

            if (
                !nombre ||
                nombre.length < 2
            ) {

                const match =
                    url.match(
                        /(\d+x\d+)/i
                    );

                if (match) {

                    nombre =
                        match[1];

                } else {

                    nombre =
                        `Episodio ${
                            episodios.length + 1
                        }`;

                }

            }


            episodios.push({

                nombre,

                link: url,

                video: null

            });

        }
    );


    // ==================================================
    // ORDENAR POR TEMPORADA / EPISODIO
    // ==================================================

    episodios.sort((a, b) => {

        function numero(ep) {

            const match =
                ep.nombre.match(
                    /(\d+)x(\d+)|episodio\s*(\d+)/i
                );

            if (!match) {
                return 999999;
            }

            if (
                match[1] &&
                match[2]
            ) {

                return (
                    parseInt(match[1]) * 10000 +
                    parseInt(match[2])
                );

            }

            return parseInt(
                match[3]
            );

        }

        return numero(a) - numero(b);

    });


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
        const episodio of item.episodios
    ) {

        try {

            console.log(
                "   Episodio:",
                episodio.nombre
            );


            const pagina =
                await obtener(
                    episodio.link
                );


            const video =
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
                    video

            });


        } catch (error) {

            console.log(
                "   Error episodio:",
                episodio.link
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

    console.log(
        "Procesando:",
        link
    );


    const pagina =
        await obtener(link);


    const nombre =
        extraerTitulo(
            pagina
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


    const metadata =
        extraerMetadata(
            pagina
        );


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
            nombre ||
            "Sin título",

        portada:
            portada,

        descripcion:
            descripcion,

        year:
            metadata.year,

        genero:
            metadata.genero,

        tipo,

        link,

        reproductor,

        episodios

    };

}


// ======================================================
// BUSCAR EN UNA SECCIÓN
// ======================================================

async function buscarSeccion(
    seccion
) {

    const url =
        BASE +
        "/" +
        seccion +
        "/";


    console.log(
        "Buscando sección:",
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


            const permitido =
                href.startsWith(
                    BASE +
                    "/" +
                    seccion +
                    "/"
                );


            if (!permitido) {
                return;
            }


            // Evitar la propia sección
            if (
                href.replace(/\/$/, "") ===
                url.replace(/\/$/, "")
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


            links.add(href);

        }
    );


    return Array.from(links)
        .sort();

}


// ======================================================
// CATÁLOGO
// ======================================================

async function cargarCatalogo(
    seccion = "peliculas",
    limite = 5
) {

    const lista =
        await buscarSeccion(
            seccion
        );


    console.log(
        `Encontrados ${lista.length} enlaces en /${seccion}/`
    );


    const resultados = [];


    const cantidad =
        Math.min(
            lista.length,
            limite
        );


    for (
        let i = 0;
        i < cantidad;
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


            // ------------------------------------------
            // NO ELIMINAR SI NO TIENE PORTADA
            // ------------------------------------------

            // Si no tiene portada sigue apareciendo.
            // El frontend mostrará un placeholder.


            resultados.push(
                item
            );


            console.log(
                `[${i + 1}/${cantidad}]`,
                item.nombre,
                "|",
                item.tipo,
                "| reproductor:",
                item.reproductor
                    ? "SI"
                    : "NO",
                "| portada:",
                item.portada
                    ? "SI"
                    : "NO"
            );


        } catch (error) {

            console.error(
                "Error procesando:",
                lista[i],
                error.message
            );

        }

    }


    return {

        resultados,

        total:
            lista.length,

        siguiente:
            cantidad < lista.length
                ? cantidad
                : null

    };

}


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


            const pagina =
                req.query.pagina
                    ? parseInt(
                        req.query.pagina
                    )
                    : 1;


            const limite = 5;


            const resultados =
                [];


            const secciones = [
                "peliculas",
                "series",
                "animes"
            ];


            for (
                const seccion
                of secciones
            ) {

                const lista =
                    await buscarSeccion(
                        seccion
                    );


                const coincidencias =
                    lista.filter(
                        url =>
                            url
                                .toLowerCase()
                                .includes(
                                    termino.toLowerCase()
                                )
                    );


                for (
                    const link
                    of coincidencias
                ) {

                    try {

                        const item =
                            await procesarPagina(
                                link
                            );


                        if (
                            item.tipo === "Serie" ||
                            item.tipo === "Anime"
                        ) {

                            await procesarEpisodios(
                                item
                            );

                        }


                        resultados.push(
                            item
                        );


                    } catch {}

                }

            }


            res.json({

                resultados:
                    resultados.slice(
                        0,
                        limite
                    ),

                total:
                    resultados.length,

                pagina,

                siguiente:
                    resultados.length > limite
                        ? pagina + 1
                        : null

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
// API - CATÁLOGO POR SECCIÓN
// ======================================================

app.get(
    "/api/catalogo/:seccion",
    async (req, res) => {

        try {

            const seccion =
                String(
                    req.params.seccion
                ).toLowerCase();


            const permitidas = [
                "peliculas",
                "series",
                "animes"
            ];


            if (
                !permitidas.includes(
                    seccion
                )
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Sección no válida"

                    });

            }


            const limite =
                Math.min(
                    Math.max(
                        parseInt(
                            req.query.limite
                        ) || 5,
                        1
                    ),
                    10
                );


            const resultado =
                await cargarCatalogo(
                    seccion,
                    limite
                );


            res.json(
                resultado
            );


        } catch (error) {

            console.error(
                "Error catálogo:",
                error
            );


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
// RUTAS DIRECTAS DE SECCIÓN
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
// SPA PARA EXPRESS 5
// ======================================================
//
// IMPORTANTE:
// NO usar app.get("*") porque Express 5 /
// path-to-regexp produce:
//
// Missing parameter name at index 1: *
// ======================================================

app.use(
    (req, res, next) => {

        if (
            req.method !== "GET"
        ) {

            return next();

        }


        if (
            req.path.startsWith(
                "/api/"
            )
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

    }
);


// ======================================================
// SERVIDOR
// ======================================================

app.listen(
    PORT,
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "Servidor iniciado"
        );

        console.log(
            "Puerto:",
            PORT
        );

        console.log(
            "Fuente:",
            BASE
        );

        console.log(
            "======================================"
        );

    }
);
