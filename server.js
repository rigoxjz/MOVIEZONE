const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================================
// CONFIGURACIÓN
// ======================================================

const BASE = (
    process.env.SOURCE_URL ||
    "https://www.hackstore.fo"
).replace(/\/+$/, "");

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
    maxRedirects: 5
});


// ======================================================
// LÍMITES
// ======================================================

const LIMITE_ITEMS = 30;
const LIMITE_EPISODIOS = 100;


// ======================================================
// CACHE
// ======================================================

const cache = {
    peliculas: {
        datos: null,
        fecha: 0
    },

    series: {
        datos: null,
        fecha: 0
    },

    animes: {
        datos: null,
        fecha: 0
    }
};

const CACHE_MS = 10 * 60 * 1000;


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


async function obtenerHTML(url) {

    const respuesta =
        await session.get(url, {
            validateStatus: () => true
        });

    if (
        respuesta.status < 200 ||
        respuesta.status >= 400
    ) {

        throw new Error(
            `HTTP ${respuesta.status}`
        );
    }

    return respuesta.data || "";
}


async function obtener(url) {

    const html =
        await obtenerHTML(url);

    return cheerio.load(html);
}


// ======================================================
// DETECTAR TIPO
// ======================================================

function detectarTipo(
    url,
    nombre = "",
    seccion = ""
) {

    const texto =
        `${url} ${nombre} ${seccion}`
            .toLowerCase();

    if (
        seccion === "animes" ||
        texto.includes("/animes/") ||
        texto.includes("/anime/")
    ) {

        return "Anime";
    }

    if (
        seccion === "series" ||
        texto.includes("/series/")
    ) {

        return "Serie";
    }

    return "Película";
}


// ======================================================
// NOMBRE
// ======================================================

function obtenerNombre($) {

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
            nombre = og.trim();
        }
    }


    if (!nombre) {

        const title = $("title").first();

        if (title.length) {

            nombre =
                title.text()
                    .trim()
                    .replace(/\s+/g, " ");
        }
    }


    // Evitar títulos genéricos de la página
    if (
        nombre &&
        /descargar peliculas gratis/i.test(nombre)
    ) {

        nombre = null;
    }


    return nombre || "Sin título";
}


// ======================================================
// DESCRIPCIÓN
// ======================================================

function obtenerDescripcion($) {

    const og =
        $('meta[property="og:description"]')
            .attr("content");

    if (og) {
        return og.trim();
    }


    const description =
        $('meta[name="description"]')
            .attr("content");

    if (description) {
        return description.trim();
    }


    return "";
}


// ======================================================
// PORTADA
// ======================================================

function obtenerPortada(
    $,
    paginaUrl
) {

    let portada = null;


    // --------------------------------------------------
    // JSON-LD
    // --------------------------------------------------

    $('script[type="application/ld+json"]')
        .each((_, script) => {

            if (portada) {
                return;
            }

            try {

                const raw =
                    $(script).html();

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


                    if (
                        obj["@type"] ===
                        "ImageObject"
                    ) {

                        portada =
                            obj.contentUrl ||
                            obj.url;

                    }


                    if (!portada) {

                        if (
                            typeof obj.image ===
                            "string"
                        ) {

                            portada =
                                obj.image;

                        } else if (
                            obj.image &&
                            typeof obj.image ===
                            "object"
                        ) {

                            portada =
                                obj.image.url ||
                                obj.image.contentUrl;

                        }
                    }


                    if (!portada) {

                        portada =
                            obj.thumbnailUrl ||
                            obj.contentUrl ||
                            obj.url ||
                            null;
                    }


                    if (portada) {
                        break;
                    }
                }

            } catch {
                // JSON-LD inválido
            }
        });


    // --------------------------------------------------
    // OG IMAGE
    // --------------------------------------------------

    if (!portada) {

        portada =
            $('meta[property="og:image"]')
                .attr("content") ||
            null;
    }


    // --------------------------------------------------
    // TWITTER IMAGE
    // --------------------------------------------------

    if (!portada) {

        portada =
            $('meta[name="twitter:image"]')
                .attr("content") ||
            null;
    }


    // --------------------------------------------------
    // IMÁGENES
    // --------------------------------------------------

    if (!portada) {

        const posibles = [
            "img[data-src]",
            "img[data-lazy-src]",
            "img[src]"
        ];


        for (
            const selector of posibles
        ) {

            $(selector).each(
                (_, img) => {

                    if (portada) {
                        return;
                    }


                    const src =
                        $(img).attr(
                            "data-src"
                        ) ||
                        $(img).attr(
                            "data-lazy-src"
                        ) ||
                        $(img).attr(
                            "src"
                        );


                    if (!src) {
                        return;
                    }


                    if (
                        src.startsWith(
                            "data:image"
                        )
                    ) {
                        return;
                    }


                    portada = src;
                }
            );


            if (portada) {
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
// REPRODUCTOR
// ======================================================

function encontrarIframe(
    $,
    paginaUrl
) {

    let reproductor = null;


    $("iframe[src]").each(
        (_, iframe) => {

            if (reproductor) {
                return;
            }


            const src =
                $(iframe).attr("src");

            if (!src) {
                return;
            }


            const url =
                unirUrl(
                    paginaUrl,
                    src
                );


            if (url) {

                reproductor = url;
            }
        }
    );


    return reproductor;
}


// ======================================================
// EXTRAER REDIRECCIÓN DE PLAY.PHP
// ======================================================

function extraerRedirect(
    html,
    base
) {

    if (!html) {
        return null;
    }


    const patrones = [

        /window\.location\.href\s*=\s*['"]([^'"]+)/i,

        /window\.location\s*=\s*['"]([^'"]+)/i,

        /location\.href\s*=\s*['"]([^'"]+)/i,

        /location\s*=\s*['"]([^'"]+)/i
    ];


    for (
        const patron of patrones
    ) {

        const resultado =
            html.match(patron);

        if (
            resultado &&
            resultado[1]
        ) {

            return unirUrl(
                base,
                resultado[1]
            );
        }
    }


    return null;
}


// ======================================================
// OBTENER REPRODUCTOR COMPLETO
// ======================================================

async function obtenerReproductor(
    $,
    paginaUrl
) {

    let reproductor =
        encontrarIframe(
            $,
            paginaUrl
        );


    if (!reproductor) {
        return null;
    }


    // Si el iframe apunta a play.php,
    // seguimos la redirección que expone
    // la propia página.

    if (
        reproductor.includes(
            "/play.php"
        )
    ) {

        try {

            const html =
                await obtenerHTML(
                    reproductor
                );


            const siguiente =
                extraerRedirect(
                    html,
                    reproductor
                );


            if (siguiente) {
                return siguiente;
            }

        } catch {
            // Mantener iframe original
        }
    }


    return reproductor;
}


// ======================================================
// EXTRAER EPISODIOS
// ======================================================

function extraerEpisodios(
    $,
    paginaUrl
) {

    const episodios = [];

    const vistos = new Set();


    $("a[href]").each(
        (_, elemento) => {

            const href =
                $(elemento).attr("href");

            if (!href) {
                return;
            }


            const url =
                unirUrl(
                    paginaUrl,
                    href
                );

            if (!url) {
                return;
            }


            const urlLimpia =
                limpiarUrl(url);


            // En tu estructura los episodios
            // están bajo /episodio/

            if (
                !urlLimpia.includes(
                    "/episodio/"
                )
            ) {

                return;
            }


            if (
                vistos.has(
                    urlLimpia
                )
            ) {

                return;
            }


            vistos.add(
                urlLimpia
            );


            let texto =
                $(elemento)
                    .text()
                    .trim()
                    .replace(/\s+/g, " ");


            // Buscar 1x1, 1x2, etc.
            const match =
                (
                    texto +
                    " " +
                    urlLimpia
                ).match(
                    /(\d+)\s*x\s*(\d+)/i
                );


            let temporada = null;
            let numero = null;


            if (match) {

                temporada =
                    Number(match[1]);

                numero =
                    Number(match[2]);
            }


            if (!texto) {

                if (
                    temporada !== null &&
                    numero !== null
                ) {

                    texto =
                        `Episodio ${temporada}x${numero}`;

                } else {

                    texto =
                        `Episodio ${
                            episodios.length + 1
                        }`;
                }
            }


            // El HTML de algunas páginas
            // puede traer "Disponible" mezclado
            // con SVG/CSS. Limpiamos ese texto.

            texto =
                texto
                    .replace(
                        /disponible/gi,
                        ""
                    )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();


            if (!texto) {

                if (
                    temporada !== null &&
                    numero !== null
                ) {

                    texto =
                        `Episodio ${temporada}x${numero}`;

                } else {

                    texto =
                        `Episodio ${
                            episodios.length + 1
                        }`;
                }
            }


            episodios.push({

                nombre: texto,

                temporada,

                episodio: numero,

                link: urlLimpia,

                video: null

            });
        }
    );


    // Ordenar episodios
    episodios.sort(
        (a, b) => {

            const ta =
                a.temporada ?? 999;

            const tb =
                b.temporada ?? 999;

            if (ta !== tb) {
                return ta - tb;
            }


            const ea =
                a.episodio ?? 999;

            const eb =
                b.episodio ?? 999;

            return ea - eb;
        }
    );


    return episodios.slice(
        0,
        LIMITE_EPISODIOS
    );
}


// ======================================================
// PROCESAR EPISODIO
// ======================================================

async function procesarEpisodio(
    episodio
) {

    try {

        const $ =
            await obtener(
                episodio.link
            );


        const video =
            await obtenerReproductor(
                $,
                episodio.link
            );


        return {
            ...episodio,
            video
        };

    } catch (error) {

        console.error(
            "Error episodio:",
            episodio.link,
            error.message
        );


        return {
            ...episodio,
            video: null
        };
    }
}


// ======================================================
// PROCESAR PELÍCULA / SERIE / ANIME
// ======================================================

async function procesarItem(
    link,
    tipo
) {

    try {

        const $ =
            await obtener(link);


        const nombre =
            obtenerNombre($);


        const portada =
            obtenerPortada(
                $,
                link
            );


        const descripcion =
            obtenerDescripcion($);


        const resultado = {

            nombre,

            portada,

            descripcion,

            tipo,

            link,

            reproductor: null,

            episodios: []
        };


        // ------------------------------------------------
        // PELÍCULA
        // ------------------------------------------------

        if (
            tipo === "Película"
        ) {

            resultado.reproductor =
                await obtenerReproductor(
                    $,
                    link
                );

            return resultado;
        }


        // ------------------------------------------------
        // SERIE / ANIME
        // ------------------------------------------------

        const episodios =
            extraerEpisodios(
                $,
                link
            );


        for (
            const episodio of episodios
        ) {

            const procesado =
                await procesarEpisodio(
                    episodio
                );


            resultado.episodios.push(
                procesado
            );
        }


        return resultado;

    } catch (error) {

        console.error(
            "Error procesando:",
            link,
            error.message
        );


        return null;
    }
}


// ======================================================
// OBTENER LINKS DE UNA SECCIÓN
// ======================================================

async function obtenerLinksSeccion(
    seccion
) {

    const url =
        `${BASE}/${seccion}/`;


    const $ =
        await obtener(url);


    const links =
        new Set();


    $(
        "a[href]"
    ).each(
        (_, elemento) => {

            let href =
                $(elemento).attr(
                    "href"
                );


            if (!href) {
                return;
            }


            let link =
                unirUrl(
                    BASE,
                    href
                );


            if (!link) {
                return;
            }


            link =
                limpiarUrl(
                    link
                );


            // ------------------------------------------
            // Debe pertenecer a la sección
            // ------------------------------------------

            if (
                !link.startsWith(
                    `${BASE}/${seccion}/`
                )
            ) {

                return;
            }


            // ------------------------------------------
            // No incluir la propia sección
            // ------------------------------------------

            if (
                link.replace(
                    /\/$/,
                    ""
                ) ===
                url.replace(
                    /\/$/,
                    ""
                )
            ) {

                return;
            }


            // ------------------------------------------
            // No paginación
            // ------------------------------------------

            if (
                /\/page\/\d+\/?$/.test(
                    link
                )
            ) {

                return;
            }


            links.add(link);
        }
    );


    return Array.from(
        links
    ).slice(
        0,
        LIMITE_ITEMS
    );
}


// ======================================================
// SCRAPEAR SECCIÓN
// ======================================================

async function scrapearSeccion(
    seccion
) {

    const links =
        await obtenerLinksSeccion(
            seccion
        );


    let tipo;


    if (
        seccion === "peliculas"
    ) {

        tipo = "Película";

    } else if (
        seccion === "series"
    ) {

        tipo = "Serie";

    } else {

        tipo = "Anime";
    }


    const resultados = [];


    for (
        const link of links
    ) {

        const item =
            await procesarItem(
                link,
                tipo
            );


        if (item) {
            resultados.push(item);
        }
    }


    return resultados;
}


// ======================================================
// CACHE
// ======================================================

async function obtenerSeccionCache(
    seccion
) {

    const entrada =
        cache[seccion];


    if (
        entrada.datos &&
        Date.now() - entrada.fecha <
        CACHE_MS
    ) {

        return entrada.datos;
    }


    const datos =
        await scrapearSeccion(
            seccion
        );


    entrada.datos =
        datos;

    entrada.fecha =
        Date.now();


    return datos;
}


// ======================================================
// CATÁLOGO COMPLETO
// ======================================================

async function obtenerCatalogo() {

    const [
        peliculas,
        series,
        animes
    ] = await Promise.all([

        obtenerSeccionCache(
            "peliculas"
        ),

        obtenerSeccionCache(
            "series"
        ),

        obtenerSeccionCache(
            "animes"
        )
    ]);


    return {

        peliculas,

        series,

        animes,

        resultados: [
            ...peliculas,
            ...series,
            ...animes
        ]
    };
}


// ======================================================
// API: CATÁLOGO
// ======================================================

app.get(
    "/api/catalogo",
    async (req, res) => {

        try {

            const catalogo =
                await obtenerCatalogo();


            res.json(
                catalogo
            );

        } catch (error) {

            console.error(
                "CATÁLOGO:",
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
// API: PELÍCULAS
// ======================================================

app.get(
    "/api/peliculas",
    async (req, res) => {

        try {

            const datos =
                await obtenerSeccionCache(
                    "peliculas"
                );


            res.json({
                resultados: datos
            });

        } catch (error) {

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
// API: SERIES
// ======================================================

app.get(
    "/api/series",
    async (req, res) => {

        try {

            const datos =
                await obtenerSeccionCache(
                    "series"
                );


            res.json({
                resultados: datos
            });

        } catch (error) {

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
// API: ANIME
// ======================================================

app.get(
    "/api/animes",
    async (req, res) => {

        try {

            const datos =
                await obtenerSeccionCache(
                    "animes"
                );


            res.json({
                resultados: datos
            });

        } catch (error) {

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
// API: BÚSQUEDA
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


            const catalogo =
                await obtenerCatalogo();


            const resultados =
                catalogo.resultados.filter(
                    item => {

                        const texto =
                            [
                                item.nombre,
                                item.descripcion,
                                item.tipo
                            ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();


                        return texto.includes(
                            termino
                        );
                    }
                );


            res.json({
                resultados
            });

        } catch (error) {

            console.error(
                "BUSQUEDA:",
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
// RUTAS DE INTERFAZ
// ======================================================

app.get(
    [
        "/",
        "/peliculas",
        "/series",
        "/animes"
    ],
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
