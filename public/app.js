const moviesContainer =
    document.getElementById(
        "movies-container"
    );

const searchInput =
    document.getElementById(
        "search"
    );

const resultadoInfo =
    document.getElementById(
        "resultado-info"
    );

const sectionTitle =
    document.getElementById(
        "section-title"
    );

const player =
    document.getElementById(
        "player"
    );

const playerTitle =
    document.getElementById(
        "player-title"
    );

const infoTitle =
    document.getElementById(
        "info-title"
    );

const infoDescription =
    document.getElementById(
        "info-description"
    );

const infoTags =
    document.getElementById(
        "info-tags"
    );

const videoStatus =
    document.getElementById(
        "video-status"
    );

const episodesSection =
    document.getElementById(
        "episodes-section"
    );

const episodesList =
    document.getElementById(
        "episodes-list"
    );

const episodesCount =
    document.getElementById(
        "episodes-count"
    );


let catalogo = [];

let seccionActual =
    "inicio";

let seleccionActual = null;


// ======================================================
// DETERMINAR SECCIÓN
// ======================================================

function obtenerSeccion() {

    const ruta =
        window.location.pathname
            .toLowerCase();


    if (
        ruta.startsWith(
            "/peliculas"
        )
    ) {

        return "peliculas";

    }


    if (
        ruta.startsWith(
            "/series"
        )
    ) {

        return "series";

    }


    if (
        ruta.startsWith(
            "/animes"
        )
    ) {

        return "animes";

    }


    return "inicio";
}


// ======================================================
// TÍTULO
// ======================================================

function tituloSeccion(tipo) {

    if (tipo === "peliculas") {
        return "Películas";
    }

    if (tipo === "series") {
        return "Series";
    }

    if (tipo === "animes") {
        return "Anime";
    }

    return "Recomendaciones";
}


// ======================================================
// CARGAR CATÁLOGO
// ======================================================

async function cargarCatalogo(tipo) {

    seccionActual =
        tipo;


    sectionTitle.textContent =
        tituloSeccion(tipo);


    moviesContainer.innerHTML = `
        <div class="loading">
            Cargando ${tipo === "inicio"
                ? "recomendaciones"
                : tituloSeccion(tipo).toLowerCase()
            }...
        </div>
    `;


    try {

        let resultados = [];


        // ==================================================
        // INICIO
        // ==================================================

        if (tipo === "inicio") {

            /*
             * En inicio cargamos una pequeña
             * muestra de cada categoría.
             */

            const tipos = [
                "peliculas",
                "series",
                "animes"
            ];


            for (
                const categoria
                of tipos
            ) {

                try {

                    const respuesta =
                        await fetch(
                            `/api/catalogo?tipo=${categoria}`,
                            {
                                cache:
                                    "no-store"
                            }
                        );


                    if (!respuesta.ok) {
                        continue;
                    }


                    const datos =
                        await respuesta.json();


                    if (
                        Array.isArray(
                            datos.resultados
                        )
                    ) {

                        resultados.push(
                            ...datos.resultados
                                .slice(0, 6)
                        );

                    }

                } catch {}

            }

        } else {

            const respuesta =
                await fetch(
                    `/api/catalogo?tipo=${tipo}`,
                    {
                        cache:
                            "no-store"
                    }
                );


            if (!respuesta.ok) {

                throw new Error(
                    `HTTP ${respuesta.status}`
                );

            }


            const datos =
                await respuesta.json();


            resultados =
                Array.isArray(
                    datos.resultados
                )
                    ? datos.resultados
                    : [];

        }


        catalogo =
            resultados;


        mostrarCatalogo(
            resultados
        );


    } catch (error) {

        console.error(error);


        moviesContainer.innerHTML = `
            <div class="loading">
                No se pudo cargar el contenido.
                <br><br>
                <small>
                    ${escapeHtml(
                        error.message
                    )}
                </small>
            </div>
        `;

    }

}


// ======================================================
// MOSTRAR CATÁLOGO
// ======================================================

function mostrarCatalogo(lista) {

    moviesContainer.innerHTML = "";


    if (!lista.length) {

        moviesContainer.innerHTML = `
            <div class="loading">
                No se encontraron contenidos.
            </div>
        `;


        resultadoInfo.textContent =
            "0 resultados";


        return;

    }


    resultadoInfo.textContent =
        `${lista.length} resultados`;


    lista.forEach(
        item => {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "movie";


            const portada =
                item.portada ||
                crearPortadaAlternativa(
                    item.nombre
                );


            const nombre =
                item.nombre ||
                "Sin título";


            const tipo =
                item.tipo ||
                "Contenido";


            card.innerHTML = `

                <img
                    src="${escapeAttribute(
                        portada
                    )}"
                    alt="${escapeAttribute(
                        nombre
                    )}"
                    loading="lazy"
                >

                <div
                    class="movie-info-small"
                >

                    <h3>
                        ${escapeHtml(
                            nombre
                        )}
                    </h3>

                    <span>
                        ${escapeHtml(
                            tipo
                        )}
                    </span>

                </div>
            `;


            const imagen =
                card.querySelector(
                    "img"
                );


            imagen.addEventListener(
                "error",
                () => {

                    imagen.src =
                        crearPortadaAlternativa(
                            nombre
                        );

                },
                {
                    once: true
                }
            );


            card.addEventListener(
                "click",
                () => {

                    seleccionar(item);

                }
            );


            moviesContainer.appendChild(
                card
            );

        }
    );

}


// ======================================================
// PORTADA ALTERNATIVA
// ======================================================

function crearPortadaAlternativa(
    nombre
) {

    const texto =
        encodeURIComponent(
            String(
                nombre ||
                "MovieZone"
            ).substring(0, 35)
        );


    return (
        "https://placehold.co/600x900/11131a/ffffff" +
        `?text=${texto}`
    );

}


// ======================================================
// SELECCIONAR
// ======================================================

function seleccionar(item) {

    seleccionActual =
        item;


    const nombre =
        item.nombre ||
        "Sin título";


    playerTitle.textContent =
        nombre;


    infoTitle.textContent =
        nombre;


    infoDescription.textContent =
        item.descripcion ||
        "Sin descripción disponible.";


    infoTags.innerHTML = "";


    agregarTag(
        item.tipo ||
        "Contenido"
    );


    if (item.year) {

        agregarTag(
            item.year
        );

    }


    if (item.genero) {

        agregarTag(
            item.genero
        );

    }


    // ==================================================
    // REPRODUCTOR
    // ==================================================

    videoStatus.innerHTML = "";


    if (item.video) {

        reproducir(
            item.video
        );


        videoStatus.innerHTML = `
            <div
                class="tag"
                style="margin-top:15px;"
            >
                Reproductor disponible
            </div>
        `;

    } else {

        player.src =
            "about:blank";


        videoStatus.innerHTML = `
            <div class="no-video">
                Sin reproductor disponible
                por el momento.
            </div>
        `;

    }


    // ==================================================
    // EPISODIOS
    // ==================================================

    mostrarEpisodios(
        item
    );


    document
        .getElementById(
            "reproductor"
        )
        .scrollIntoView({
            behavior: "smooth"
        });

}


// ======================================================
// REPRODUCIR
// ======================================================

function reproducir(url) {

    if (!url) {

        player.src =
            "about:blank";

        return;

    }


    player.src =
        url;

}


// ======================================================
// EPISODIOS
// ======================================================

function mostrarEpisodios(item) {

    episodesList.innerHTML = "";


    const episodios =
        Array.isArray(
            item.episodios
        )
            ? item.episodios
            : [];


    if (!episodios.length) {

        episodesSection.style.display =
            "none";

        return;

    }


    episodesSection.style.display =
        "block";


    episodesCount.textContent =
        `${episodios.length} episodios`;


    episodios.forEach(
        (episodio, index) => {

            const boton =
                document.createElement(
                    "button"
                );


            boton.className =
                "episode";


            boton.innerHTML = `

                <strong>
                    ${escapeHtml(
                        episodio.nombre ||
                        `Episodio ${
                            index + 1
                        }`
                    )}
                </strong>

                <small>
                    ${
                        episodio.video
                            ? "Disponible"
                            : "Sin reproductor"
                    }
                </small>

            `;


            boton.addEventListener(
                "click",
                () => {

                    playerTitle.textContent =
                        `${item.nombre} - ${
                            episodio.nombre ||
                            `Episodio ${
                                index + 1
                            }`
                        }`;


                    if (
                        episodio.video
                    ) {

                        reproducir(
                            episodio.video
                        );


                        videoStatus.innerHTML = `
                            <div
                                class="tag"
                                style="margin-top:15px;"
                            >
                                Reproductor disponible
                            </div>
                        `;

                    } else {

                        player.src =
                            "about:blank";


                        videoStatus.innerHTML = `
                            <div class="no-video">
                                Sin reproductor disponible
                                por el momento.
                            </div>
                        `;

                    }


                    document
                        .getElementById(
                            "reproductor"
                        )
                        .scrollIntoView({
                            behavior:
                                "smooth"
                        });

                }
            );


            episodesList.appendChild(
                boton
            );

        }
    );

}


// ======================================================
// TAG
// ======================================================

function agregarTag(texto) {

    if (!texto) {
        return;
    }


    const tag =
        document.createElement(
            "span"
        );


    tag.className =
        "tag";


    tag.textContent =
        texto;


    infoTags.appendChild(
        tag
    );

}


// ======================================================
// BÚSQUEDA
// ======================================================

let timeoutBusqueda = null;


searchInput.addEventListener(
    "input",
    () => {

        clearTimeout(
            timeoutBusqueda
        );


        const texto =
            searchInput.value
                .trim();


        if (!texto) {

            mostrarCatalogo(
                catalogo
            );

            return;

        }


        timeoutBusqueda =
            setTimeout(
                () => {

                    buscar(
                        texto
                    );

                },
                400
            );

    }
);


// ======================================================
// BUSCAR EN SERVIDOR
// ======================================================

async function buscar(texto) {

    moviesContainer.innerHTML = `
        <div class="loading">
            Buscando...
        </div>
    `;


    try {

        const respuesta =
            await fetch(
                `/api/buscar?q=${
                    encodeURIComponent(
                        texto
                    )
                }`,
                {
                    cache:
                        "no-store"
                }
            );


        if (!respuesta.ok) {

            throw new Error(
                `HTTP ${respuesta.status}`
            );

        }


        const datos =
            await respuesta.json();


        const resultados =
            Array.isArray(
                datos.resultados
            )
                ? datos.resultados
                : [];


        resultadoInfo.textContent =
            `${resultados.length} resultados`;


        mostrarCatalogo(
            resultados
        );


    } catch (error) {

        console.error(error);


        moviesContainer.innerHTML = `
            <div class="loading">
                Error al buscar.
            </div>
        `;

    }

}


// ======================================================
// NAVEGACIÓN
// ======================================================

document
    .querySelectorAll(
        "nav a"
    )
    .forEach(
        enlace => {

            enlace.addEventListener(
                "click",
                event => {

                    event.preventDefault();


                    const destino =
                        enlace.getAttribute(
                            "href"
                        );


                    history.pushState(
                        {},
                        "",
                        destino
                    );


                    cargarRuta();

                }
            );

        }
    );


// ======================================================
// CARGAR RUTA
// ======================================================

function cargarRuta() {

    const tipo =
        obtenerSeccion();


    document
        .querySelectorAll(
            "nav a"
        )
        .forEach(
            enlace => {

                const ruta =
                    enlace.dataset.route;


                enlace.classList.toggle(
                    "active",
                    ruta === tipo
                );

            }
        );


    searchInput.value = "";


    cargarCatalogo(
        tipo
    );

}


// ======================================================
// HISTORIAL
// ======================================================

window.addEventListener(
    "popstate",
    () => {

        cargarRuta();

    }
);


// ======================================================
// SEGURIDAD
// ======================================================

function escapeHtml(texto) {

    return String(texto)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


function escapeAttribute(
    texto
) {

    return escapeHtml(
        texto
    );

}


// ======================================================
// INICIAR
// ======================================================

cargarRuta();
