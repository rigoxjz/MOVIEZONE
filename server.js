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
// CATEGORÍAS
// ======================================================

const CATEGORIAS = {
    peliculas: "/peliculas/",
    series: "/series/",
    animes: "/animes/"
};


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
// EXTRAER PORTADA
// ======================================================

function extraerPortada($, paginaUrl) {

    let portada = null;

    // ----------------------------------------------
    // JSON-LD
    // ----------------------------------------------

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
                            obj.url;

                    }

                    if (!portada) {

                        portada =
                            obj.image ||
                            obj.thumbnailUrl ||
                            null;

                    }

                    if (portada) break;
                }

            } catch {}
        }
    );


    // ----------------------------------------------
    // OG IMAGE
    // ----------------------------------------------

    if (!portada) {

        portada =
            $('meta[property="og:image"]')
                .attr("content") ||
            null;
    }


    // ----------------------------------------------
    // META IMAGE
    // ----------------------------------------------

    if (!portada) {

        portada =
            $('meta[name="twitter:image"]')
                .attr("content") ||
            null;
    }


    // ----------------------------------------------
    // PRIMERA IMAGEN GRANDE
    // ----------------------------------------------

    if (!portada) {

        $("img").each((_, img) => {

            if (portada) return;

            const src =
                $(img).attr("src") ||
                $(img).attr("data-src") ||
                $(img).attr("data-lazy-src");

            if (!src) return;

            const ancho =
                parseInt(
                    $(img).attr("width") || "0"
                );

            if (ancho >= 150 || !ancho) {

                portada = src;

            }
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
// EXTRAER INFORMACIÓN DE UNA PÁGINA
// ======================================================

async function procesarPagina(link) {

    const pagina = await obtener(link);

    let nombre = null;
    let descripcion = "";
    let year = null;
    let genero = null;


    // ==================================================
    // NOMBRE
    // ==================================================

    const h1 = pagina("h1").first();

    if (h1.length) {

        nombre =
            h1.text()
                .trim()
                .replace(/\s+/g, " ");
    }


    if (!nombre) {

        nombre =
            pagina(
                'meta[property="og:title"]'
            ).attr("content") || null;
    }


    // Evitar título genérico
    if (
        nombre &&
        (
            nombre.toLowerCase().includes(
                "descargar peliculas gratis"
            ) ||
            nombre.toLowerCase().includes(
                "descargar películas gratis"
            )
        )
    ) {

        const title =
            pagina("title")
                .text()
                .trim();

        if (
            title &&
            !title.toLowerCase().includes(
                "descargar peliculas gratis"
            ) &&
            !title.toLowerCase().includes(
                "descargar películas gratis"
            )
        ) {

            nombre = title;
        }
    }


    // ==================================================
    // DESCRIPCIÓN
    // ==================================================

    descripcion =
        pagina(
            'meta[property="og:description"]'
        ).attr("content") || "";


    if (!descripcion) {

        descripcion =
            pagina(
                'meta[name="description"]'
            ).attr("content") || "";
    }


    // ==================================================
    // PORTADA
    // ==================================================

    const portada =
        extraerPortada(
            pagina,
            link
        );


    // ==================================================
    // JSON-LD
    // ==================================================

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
                        data["@graph"] ||
                        [data]
                    );

            for (const obj of objetos) {

                if (
                    !obj ||
                    typeof obj !== "object"
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

            if (reproductor) return;

            const src =
                pagina(iframe)
                    .attr("src");

            if (!src) return;

            const iframeUrl =
                unirUrl(
                    link,
                    src
                );

            if (!iframeUrl) return;

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

        portada,

        descripcion:
            descripcion ||
            "Sin descripción disponible.",

        year,

        genero,

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
                `${texto} ${url}`;


            const pareceEpisodio =
                /episodio|episode|capitulo|capítulo|\bep\.?\s*\d+|\d+x\d+/i
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
        const episodio of item.episodios
    ) {

        try {

            const pagina =
                await obtener(
                    episodio.link
                );


            let reproductor = null;


            pagina("iframe[src]").each(
                (_, iframe) => {

                    if (reproductor) return;


                    const src =
                        pagina(iframe)
                            .attr("src");

                    if (!src) return;


                    const iframeUrl =
                        unirUrl(
                            episodio.link,
                            src
                        );


                    if (!iframeUrl) return;


                    if (
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
// BUSCAR POR CATEGORÍA
// ======================================================

async function buscarCategoria(
    categoria,
    paginaNumero = 1,
    limite = 5
) {

    const ruta =
        CATEGORIAS[categoria];

    if (!ruta) {
        throw new Error(
            "Categoría no válida"
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


    console.log(
        `Buscando ${categoria}, página ${paginaNumero}`
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
                limpiarUrl(href);


            const prefijo =
                BASE + ruta;


            if (
                !href.startsWith(prefijo)
            ) {
                return;
            }


            if (
                href ===
                limpiarUrl(
                    BASE + ruta
                )
            ) {
                return;
            }


            if (
                /\/page\/\d+\/?$/.test(href)
            ) {
                return;
            }


            links.add(href);

        }
    );


    const lista =
        Array.from(links);


    const resultados = [];


    // máximo 5
    const seleccion =
        lista.slice(0, limite);


    for (
        let i = 0;
        i < seleccion.length;
        i++
    ) {

        try {

            console.log(
                `[${i + 1}/${seleccion.length}] ${seleccion[i]}`
            );


            let item =
                await procesarPagina(
                    seleccion[i]
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
                "Error:",
                seleccion[i],
                error.message
            );
        }
    }


    return {

        resultados,

        pagina:
            paginaNumero,

        siguiente:
            resultados.length === limite
                ? paginaNumero + 1
                : null
    };
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
        encodeURIComponent(termino);


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
                limpiarUrl(href);


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
                /\/page\/\d+\/?$/.test(href)
            ) {
                return;
            }


            links.add(href);

        }
    );


    const lista =
        Array.from(links)
            .slice(0, limite);


    const resultados = [];


    for (
        let i = 0;
        i < lista.length;
        i++
    ) {

        try {

            console.log(
                `[BUSQUEDA ${i + 1}/${lista.length}]`,
                lista[i]
            );


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
                "Error:",
                error.message
            );
        }
    }


    return {
        resultados
    };
}


// ======================================================
// API - PELÍCULAS
// ======================================================

app.get(
    "/api/peliculas",
    async (req, res) => {

        try {

            const pagina =
                parseInt(
                    req.query.pagina || "1"
                );


            const data =
                await buscarCategoria(
                    "peliculas",
                    pagina,
                    5
                );


            res.json(data);


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

            const pagina =
                parseInt(
                    req.query.pagina || "1"
                );


            const data =
                await buscarCategoria(
                    "series",
                    pagina,
                    5
                );


            res.json(data);


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

            const pagina =
                parseInt(
                    req.query.pagina || "1"
                );


            const data =
                await buscarCategoria(
                    "animes",
                    pagina,
                    5
                );


            res.json(data);


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
                ).trim();


            if (!termino) {

                return res.status(400).json({

                    error:
                        "Escribe algo para buscar"
                });
            }


            const data =
                await buscar(
                    termino,
                    5
                );


            res.json(data);


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
// FALLBACK EXPRESS 5
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
