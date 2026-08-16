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


async function obtener(url) {
    const respuesta = await session.get(url);

    return cheerio.load(
        respuesta.data
    );
}


// ======================================================
// TIPO
// ======================================================

function detectarTipo(url) {

    const texto =
        String(url).toLowerCase();

    if (texto.includes("/animes/")) {
        return "Anime";
    }

    if (texto.includes("/anime/")) {
        return "Anime";
    }

    if (texto.includes("/series/")) {
        return "Serie";
    }

    return "Película";
}


// ======================================================
// LIMPIAR TÍTULO
// ======================================================

function limpiarTitulo(titulo) {

    if (!titulo) {
        return null;
    }

    let texto =
        String(titulo)
            .replace(/\s+/g, " ")
            .trim();


    const titulosGenericos = [
        "descargar peliculas gratis por mega, google drive y más en 1 link",
        "descargar peliculas gratis por mega, google drive y mas en 1 link",
        "peliculas gratis",
        "películas gratis"
    ];


    const minus =
        texto.toLowerCase();


    if (
        titulosGenericos.some(
            x => minus === x
        )
    ) {
        return null;
    }


    texto =
        texto
            .replace(
                /\s*[-|]\s*(pel[ií]culas|series|anime).*$/i,
                ""
            )
            .trim();


    return texto || null;
}


// ======================================================
// NOMBRE
// ======================================================

function extraerNombre(pagina, link) {

    let nombre = null;


    // 1. H1

    const h1 =
        pagina("h1").first();

    if (h1.length) {

        nombre =
            limpiarTitulo(
                h1.text()
            );

    }


    // 2. Título de contenido

    if (!nombre) {

        const selectores = [
            ".entry-title",
            ".post-title",
            ".movie-title",
            ".film-title",
            ".title"
        ];


        for (
            const selector
            of selectores
        ) {

            const elemento =
                pagina(selector)
                    .first();

            if (!elemento.length) {
                continue;
            }


            const texto =
                limpiarTitulo(
                    elemento.text()
                );


            if (texto) {

                nombre = texto;
                break;

            }

        }

    }


    // 3. JSON-LD

    if (!nombre) {

        pagina(
            'script[type="application/ld+json"]'
        ).each((_, script) => {

            if (nombre) return;

            try {

                const raw =
                    pagina(script).html();

                if (!raw) return;

                const data =
                    JSON.parse(raw);

                const objetos =
                    Array.isArray(data)
                        ? data
                        : data["@graph"]
                            ? data["@graph"]
                            : [data];


                for (
                    const obj
                    of objetos
                ) {

                    if (!obj) continue;


                    const posible =
                        limpiarTitulo(
                            obj.name ||
                            obj.headline
                        );


                    if (posible) {

                        nombre =
                            posible;

                        break;

                    }

                }

            } catch {}

        });

    }


    // 4. OG title

    if (!nombre) {

        nombre =
            limpiarTitulo(
                pagina(
                    'meta[property="og:title"]'
                ).attr("content")
            );

    }


    // 5. TITLE

    if (!nombre) {

        nombre =
            limpiarTitulo(
                pagina("title").first().text()
            );

    }


    // 6. Slug como último recurso

    if (!nombre) {

        try {

            const u =
                new URL(link);

            const partes =
                u.pathname
                    .split("/")
                    .filter(Boolean);

            const slug =
                partes[partes.length - 1];


            if (slug) {

                nombre =
                    slug
                        .replace(
                            /[-_]+/g,
                            " "
                        )
                        .replace(
                            /\b\w/g,
                            c => c.toUpperCase()
                        );

            }

        } catch {}

    }


    return nombre || "Sin título";
}


// ======================================================
// DESCRIPCIÓN
// ======================================================

function extraerDescripcion(pagina) {

    const descripcion =
        pagina(
            'meta[property="og:description"]'
        ).attr("content") ||

        pagina(
            'meta[name="description"]'
        ).attr("content") ||

        "";


    return descripcion
        .replace(/\s+/g, " ")
        .trim();
}


// ======================================================
// PORTADA
// ======================================================

function extraerPortada(pagina, link) {

    let portada = null;


    // ==================================================
    // JSON-LD
    // ==================================================

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


            const objetos =
                Array.isArray(data)
                    ? data
                    : data["@graph"]
                        ? data["@graph"]
                        : [data];


            for (
                const obj
                of objetos
            ) {

                if (!obj) continue;


                let imagen =
                    obj.image ||
                    obj.thumbnailUrl ||
                    obj.contentUrl;


                if (
                    imagen &&
                    typeof imagen === "object"
                ) {

                    imagen =
                        imagen.url ||
                        imagen.contentUrl;

                }


                if (imagen) {

                    portada =
                        imagen;

                    break;

                }

            }

        } catch {}

    });


    // ==================================================
    // OG IMAGE
    // ==================================================

    if (!portada) {

        portada =
            pagina(
                'meta[property="og:image"]'
            ).attr("content");

    }


    // ==================================================
    // TWITTER IMAGE
    // ==================================================

    if (!portada) {

        portada =
            pagina(
                'meta[name="twitter:image"]'
            ).attr("content");

    }


    // ==================================================
    // IMÁGENES DEL POST
    // ==================================================

    if (!portada) {

        const selectores = [
            ".poster img",
            ".post-thumbnail img",
            ".entry-thumbnail img",
            ".movie-poster img",
            ".film-poster img",
            ".thumbnail img",
            ".thumb img",
            ".post img",
            "article img",
            ".entry-content img"
        ];


        for (
            const selector
            of selectores
        ) {

            const img =
                pagina(selector).first();

            if (!img.length) {
                continue;
            }


            portada =
                img.attr("data-src") ||
                img.attr("data-lazy-src") ||
                img.attr("data-original") ||
                img.attr("src");


            if (portada) {
                break;
            }

        }

    }


    if (!portada) {
        return null;
    }


    return unirUrl(
        link,
        portada
    );
}


// ======================================================
// REPRODUCTOR
// ======================================================

function extraerReproductor(
    pagina,
    paginaBase
) {

    let reproductor = null;


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


            /*
             * Mantiene el comportamiento
             * del reproductor propio.
             */

            if (
                url.startsWith(BASE)
            ) {

                reproductor = url;

            }

        }
    );


    return reproductor;
}


// ======================================================
// EPISODIOS
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
             * Formato principal:
             *
             * /episodio/serie-1x1/
             */

            const esEpisodio =
                /\/episodio\//i.test(url);


            /*
             * Formato alternativo
             */

            const texto =
                pagina(elemento)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();


            const esAlternativo =
                /episodio|episode|cap[ií]tulo/i
                    .test(texto);


            if (
                !esEpisodio &&
                !esAlternativo
            ) {

                return;

            }


            if (
                !url.startsWith(BASE)
            ) {

                return;

            }


            if (vistos.has(url)) {
                return;
            }


            vistos.add(url);


            /*
             * Detectar temporada/episodio.
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


            /*
             * El texto de algunos sitios
             * contiene SVG/CSS.
             */

            nombre =
                nombre
                    .replace(
                        /\.text\s*\{[\s\S]*?\}/gi,
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


            if (
                !nombre ||
                nombre.length > 70 ||
                /disponible/i.test(nombre)
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


            episodios.push({

                nombre,

                link: url,

                video: null

            });

        }
    );


    // ==================================================
    // ORDENAR
    // ==================================================

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

                return (
                    temporadaA -
                    temporadaB
                );

            }


            return (
                episodioA -
                episodioB
            );

        }
    );


    return episodios;
}


// ======================================================
// PROCESAR EPISODIO
// ======================================================

async function procesarEpisodio(
    episodio
) {

    try {

        const pagina =
            await obtener(
                episodio.link
            );


        const reproductor =
            extraerReproductor(
                pagina,
                episodio.link
            );


        return {

            nombre:
                episodio.nombre,

            link:
                episodio.link,

            video:
                reproductor

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
// PROCESAR CONTENIDO
// ======================================================

async function procesarPagina(
    link
) {

    const pagina =
        await obtener(link);


    const tipo =
        detectarTipo(link);


    const nombre =
        extraerNombre(
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

        const encontrados =
            extraerEpisodios(
                pagina,
                link
            );


        /*
         * Limitar episodios por petición
         * para evitar sobrecargar Render.
         */

        const limite =
            Math.min(
                encontrados.length,
                100
            );


        for (
            let i = 0;
            i < limite;
            i++
        ) {

            episodios.push(
                await procesarEpisodio(
                    encontrados[i]
                )
            );

        }

    }


    return {

        nombre,

        portada,

        descripcion,

        tipo,

        link,

        reproductor,

        video:
            reproductor,

        episodios

    };
}


// ======================================================
// DESCUBRIR SECCIÓN
// ======================================================

async function descubrirSeccion(
    tipo
) {

    let ruta;


    if (tipo === "series") {

        ruta = "/series/";

    } else if (tipo === "animes") {

        ruta = "/animes/";

    } else {

        ruta = "/peliculas/";

    }


    const pagina =
        await obtener(
            BASE + ruta
        );


    const links =
        new Set();


    pagina("a[href]").each(
        (_, elemento) => {

            const href =
                pagina(elemento)
                    .attr("href");

            if (!href) return;


            const url =
                unirUrl(
                    BASE,
                    href
                );

            if (!url) return;


            let permitido = false;


            if (tipo === "peliculas") {

                permitido =
                    url.startsWith(
                        BASE + "/peliculas/"
                    );

            }


            if (tipo === "series") {

                permitido =
                    url.startsWith(
                        BASE + "/series/"
                    );

            }


            if (tipo === "animes") {

                permitido =
                    url.startsWith(
                        BASE + "/animes/"
                    ) ||
                    url.startsWith(
                        BASE + "/anime/"
                    );

            }


            if (!permitido) {
                return;
            }


            if (
                /\/page\/\d+\/?$/
                    .test(url)
            ) {
                return;
            }


            const limpia =
                limpiarUrl(url);


            if (
                limpia ===
                limpiarUrl(
                    BASE + ruta
                )
            ) {
                return;
            }


            links.add(limpia);

        }
    );


    return Array.from(
        links
    );
}


// ======================================================
// CATÁLOGO
// ======================================================

async function catalogo(
    tipo
) {

    const links =
        await descubrirSeccion(
            tipo
        );


    const resultados = [];


    /*
     * Primeros 30 para mantener
     * un tiempo razonable en Render.
     */

    const limite =
        Math.min(
            links.length,
            30
        );


    for (
        let i = 0;
        i < limite;
        i++
    ) {

        try {

            const item =
                await procesarPagina(
                    links[i]
                );


            /*
             * No descartamos contenido
             * sin portada ni reproductor.
             */

            resultados.push(item);

        } catch (error) {

            console.error(
                "Error:",
                links[i],
                error.message
            );

        }

    }


    return resultados;
}


// ======================================================
// BÚSQUEDA
// ======================================================

async function buscar(
    termino
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

            const href =
                pagina(elemento)
                    .attr("href");

            if (!href) return;


            const url =
                unirUrl(
                    BASE,
                    href
                );

            if (!url) return;


            const permitido =
                url.startsWith(
                    BASE + "/peliculas/"
                ) ||
                url.startsWith(
                    BASE + "/series/"
                ) ||
                url.startsWith(
                    BASE + "/animes/"
                ) ||
                url.startsWith(
                    BASE + "/anime/"
                );


            if (!permitido) {
                return;
            }


            if (
                /\/page\/\d+\/?$/
                    .test(url)
            ) {
                return;
            }


            links.add(
                limpiarUrl(url)
            );

        }
    );


    const lista =
        Array.from(
            links
        );


    const resultados = [];


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

            const item =
                await procesarPagina(
                    lista[i]
                );


            resultados.push(item);

        } catch (error) {

            console.error(
                "Error búsqueda:",
                lista[i],
                error.message
            );

        }

    }


    return resultados;
}


// ======================================================
// API - CATÁLOGO
// ======================================================

app.get(
    "/api/catalogo",
    async (req, res) => {

        try {

            const tipo =
                String(
                    req.query.tipo ||
                    "peliculas"
                ).toLowerCase();


            const permitidos = [
                "peliculas",
                "series",
                "animes"
            ];


            if (
                !permitidos.includes(tipo)
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Tipo no válido"

                    });

            }


            const resultados =
                await catalogo(
                    tipo
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
// API - BÚSQUEDA
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
