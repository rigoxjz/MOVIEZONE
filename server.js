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

function limpiarUrl(url) {
    try {
        const u = new URL(url);
        let pathname = u.pathname;

        if (!pathname.endsWith("/")) {
            pathname += "/";
        }

        return `${u.protocol}//${u.host}${pathname}`;
    } catch {
        return url;
    }
}

async function obtenerHTML(url) {
    const respuesta = await session.get(url);
    return respuesta.data || "";
}

async function obtenerPagina(url) {
    const html = await obtenerHTML(url);
    return cheerio.load(html);
}


// ======================================================
// TIPO DE CONTENIDO
// ======================================================

function detectarTipo(url, nombre = "") {
    const texto = `${url} ${nombre}`.toLowerCase();

    if (
        texto.includes("/anime/") ||
        texto.includes("/episodio/") &&
        texto.includes("anime")
    ) {
        return "Anime";
    }

    if (
        texto.includes("/series/") ||
        texto.includes("/serie/")
    ) {
        return "Serie";
    }

    return "Película";
}


// ======================================================
// PORTADA
// ======================================================

function extraerPortada($, paginaBase) {
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
                    portada =
                        obj.image ||
                        obj.thumbnailUrl ||
                        null;
                }

                if (portada) break;
            }

        } catch {}
    });

    if (!portada) {

        portada =
            $('meta[property="og:image"]')
                .attr("content") ||
            $('meta[name="twitter:image"]')
                .attr("content") ||
            null;
    }

    if (!portada) {

        const imagen =
            $("img[src]").first().attr("src");

        if (imagen) {
            portada = imagen;
        }
    }

    if (portada) {
        portada = unirUrl(
            paginaBase,
            portada
        );
    }

    return portada;
}


// ======================================================
// REPRODUCTOR
// ======================================================

function extraerReproductor($, paginaBase) {

    let reproductor = null;

    $("iframe[src]").each((_, iframe) => {

        if (reproductor) return;

        const src =
            $(iframe).attr("src");

        if (!src) return;

        const url =
            unirUrl(
                paginaBase,
                src
            );

        if (!url) return;

        /*
         * Se toma el iframe que aparece
         * en la página de tu fuente.
         */
        if (
            url.startsWith(BASE)
        ) {
            reproductor = url;
        }

    });

    return reproductor;
}


// ======================================================
// INFORMACIÓN DE UNA FICHA
// ======================================================

async function procesarFicha(link) {

    const $ =
        await obtenerPagina(link);

    let nombre = null;

    const h1 =
        $("h1").first();

    if (h1.length) {

        nombre =
            h1.text()
                .trim()
                .replace(/\s+/g, " ");
    }

    if (!nombre) {

        nombre =
            $('meta[property="og:title"]')
                .attr("content") ||
            $("title").text().trim() ||
            null;
    }

    const descripcion =
        $('meta[property="og:description"]')
            .attr("content") ||
        "";

    const portada =
        extraerPortada(
            $,
            link
        );

    const tipo =
        detectarTipo(
            link,
            nombre || ""
        );

    const reproductor =
        extraerReproductor(
            $,
            link
        );

    return {
        nombre,
        portada,
        descripcion,
        tipo,
        link,
        reproductor,
        episodios: []
    };
}


// ======================================================
// EPISODIOS DE UNA SERIE / ANIME
// ======================================================

function extraerEpisodios($, paginaBase) {

    const episodios = [];
    const vistos = new Set();

    $("a[href]").each((_, elemento) => {

        const href =
            $(elemento).attr("href");

        if (!href) return;

        const url =
            unirUrl(
                paginaBase,
                href
            );

        if (!url) return;

        /*
         * Esta es la parte importante:
         *
         * las fichas de episodios están en:
         *
         * /episodio/...
         */
        if (!url.includes("/episodio/")) {
            return;
        }

        const limpio =
            limpiarUrl(url);

        if (vistos.has(limpio)) {
            return;
        }

        vistos.add(limpio);

        let nombre =
            $(elemento)
                .text()
                .trim()
                .replace(/\s+/g, " ");

        if (!nombre) {

            const slug =
                new URL(limpio)
                    .pathname
                    .split("/")
                    .filter(Boolean)
                    .pop();

            nombre =
                slug || "Episodio";
        }

        episodios.push({
            nombre,
            link: limpio,
            video: null
        });
    });

    /*
     * Orden natural:
     * 1x1
     * 1x2
     * 1x10
     */
    episodios.sort((a, b) => {

        const ax =
            a.link.match(
                /(\d+)x(\d+)/i
            );

        const bx =
            b.link.match(
                /(\d+)x(\d+)/i
            );

        if (!ax || !bx) {
            return a.nombre.localeCompare(
                b.nombre,
                "es",
                {
                    numeric: true
                }
            );
        }

        const aTemporada =
            Number(ax[1]);

        const aEpisodio =
            Number(ax[2]);

        const bTemporada =
            Number(bx[1]);

        const bEpisodio =
            Number(bx[2]);

        if (
            aTemporada !==
            bTemporada
        ) {
            return (
                aTemporada -
                bTemporada
            );
        }

        return (
            aEpisodio -
            bEpisodio
        );
    });

    return episodios;
}


// ======================================================
// PROCESAR EPISODIOS
// ======================================================

async function procesarEpisodios(item) {

    if (
        !Array.isArray(
            item.episodios
        ) ||
        !item.episodios.length
    ) {
        return item;
    }

    const procesados = [];

    for (
        const episodio of item.episodios
    ) {

        try {

            const $ =
                await obtenerPagina(
                    episodio.link
                );

            const video =
                extraerReproductor(
                    $,
                    episodio.link
                );

            /*
             * Solo conservamos episodios
             * que realmente tengan reproductor.
             */
            if (video) {

                procesados.push({
                    nombre:
                        episodio.nombre,
                    link:
                        episodio.link,
                    video
                });
            }

        } catch (error) {

            console.error(
                "Error episodio:",
                episodio.link,
                error.message
            );
        }
    }

    item.episodios =
        procesados;

    return item;
}


// ======================================================
// OBTENER LISTA DE UNA CATEGORÍA
// ======================================================

async function obtenerListado(ruta) {

    const url =
        `${BASE}${ruta}`;

    const $ =
        await obtenerPagina(url);

    const links =
        new Set();

    $("a[href]").each((_, elemento) => {

        let href =
            $(elemento).attr("href");

        if (!href) return;

        const link =
            unirUrl(
                BASE,
                href
            );

        if (!link) return;

        if (!link.startsWith(BASE)) {
            return;
        }

        const pathname =
            new URL(link).pathname;

        /*
         * Solo elementos directos
         * de la categoría.
         */
        if (ruta === "/peliculas/") {

            if (
                !pathname.startsWith(
                    "/peliculas/"
                )
            ) {
                return;
            }

            if (
                pathname ===
                "/peliculas/"
            ) {
                return;
            }

        }

        if (ruta === "/series/") {

            if (
                !pathname.startsWith(
                    "/series/"
                )
            ) {
                return;
            }

            if (
                pathname ===
                "/series/"
            ) {
                return;
            }

        }

        if (ruta === "/anime/") {

            if (
                !pathname.startsWith(
                    "/anime/"
                )
            ) {
                return;
            }

            if (
                pathname ===
                "/anime/"
            ) {
                return;
            }
        }

        if (
            /\/page\/\d+\/?$/.test(
                pathname
            )
        ) {
            return;
        }

        links.add(
            limpiarUrl(link)
        );
    });

    return Array.from(links);
}


// ======================================================
// CATÁLOGO
// ======================================================

async function obtenerCatalogo() {

    const todasLasFichas =
        new Set();

    const categorias = [
        "/peliculas/",
        "/series/",
        "/anime/"
    ];

    for (
        const categoria of categorias
    ) {

        try {

            const links =
                await obtenerListado(
                    categoria
                );

            for (const link of links) {
                todasLasFichas.add(link);
            }

        } catch (error) {

            console.error(
                `Error en ${categoria}:`,
                error.message
            );
        }
    }

    const resultados = [];

    /*
     * Límite para no saturar Render
     */
    const lista =
        Array.from(
            todasLasFichas
        ).slice(0, 30);

    for (
        const link of lista
    ) {

        try {

            let item =
                await procesarFicha(
                    link
                );

            if (
                item.tipo === "Serie" ||
                item.tipo === "Anime"
            ) {

                const $ =
                    await obtenerPagina(
                        link
                    );

                item.episodios =
                    extraerEpisodios(
                        $,
                        link
                    );

                item =
                    await procesarEpisodios(
                        item
                    );

                /*
                 * No mostrar series/anime
                 * que no tengan episodios reproducibles.
                 */
                if (
                    !item.episodios.length
                ) {
                    continue;
                }

            } else {

                /*
                 * Películas sin reproductor
                 * quedan fuera.
                 */
                if (
                    !item.reproductor
                ) {
                    continue;
                }
            }

            resultados.push(item);

        } catch (error) {

            console.error(
                "Error procesando:",
                link,
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

    if (!termino) {
        return obtenerCatalogo();
    }

    const url =
        `${BASE}/?s=${encodeURIComponent(
            termino
        )}`;

    const $ =
        await obtenerPagina(url);

    const links =
        new Set();

    $("a[href]").each((_, elemento) => {

        const href =
            $(elemento).attr("href");

        if (!href) return;

        const urlCompleta =
            unirUrl(
                BASE,
                href
            );

        if (!urlCompleta) return;

        if (!urlCompleta.startsWith(BASE)) {
            return;
        }

        const pathname =
            new URL(
                urlCompleta
            ).pathname;

        if (
            pathname.startsWith("/peliculas/") ||
            pathname.startsWith("/series/") ||
            pathname.startsWith("/anime/")
        ) {

            if (
                !/\/page\/\d+\/?$/.test(
                    pathname
                )
            ) {

                if (
                    !pathname.endsWith(
                        "/peliculas/"
                    ) &&
                    !pathname.endsWith(
                        "/series/"
                    ) &&
                    !pathname.endsWith(
                        "/anime/"
                    )
                ) {
                    links.add(
                        limpiarUrl(
                            urlCompleta
                        )
                    );
                }
            }
        }
    });

    const resultados = [];

    for (
        const link of Array.from(
            links
        ).slice(0, 30)
    ) {

        try {

            let item =
                await procesarFicha(
                    link
                );

            if (
                item.tipo === "Serie" ||
                item.tipo === "Anime"
            ) {

                const $ =
                    await obtenerPagina(
                        link
                    );

                item.episodios =
                    extraerEpisodios(
                        $,
                        link
                    );

                item =
                    await procesarEpisodios(
                        item
                    );

                if (
                    !item.episodios.length
                ) {
                    continue;
                }

            } else {

                if (
                    !item.reproductor
                ) {
                    continue;
                }
            }

            resultados.push(item);

        } catch (error) {

            console.error(
                "Error búsqueda:",
                link,
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
                await obtenerCatalogo();

            res.json({
                resultados
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "No se pudo cargar el catálogo"
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

                return res.json({
                    resultados:
                        await obtenerCatalogo()
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
