const moviesContainer =
    document.getElementById(
        "movies-container"
    );

const peliculasContainer =
    document.getElementById(
        "peliculas-container"
    );

const seriesContainer =
    document.getElementById(
        "series-container"
    );

const animesContainer =
    document.getElementById(
        "animes-container"
    );


const searchInput =
    document.getElementById(
        "search"
    );


const resultadoInfo =
    document.getElementById(
        "resultado-info"
    );


const peliculasInfo =
    document.getElementById(
        "peliculas-info"
    );


const seriesInfo =
    document.getElementById(
        "series-info"
    );


const animesInfo =
    document.getElementById(
        "animes-info"
    );


const playerWrapper =
    document.getElementById(
        "player-wrapper"
    );


const playerTitle =
    document.getElementById(
        "player-title"
    );


const playerMessage =
    document.getElementById(
        "player-message"
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


const heroTitle =
    document.getElementById(
        "hero-title"
    );


const heroDescription =
    document.getElementById(
        "hero-description"
    );


let catalogo = [];

let peliculas = [];

let series = [];

let animes = [];

let seleccionActual = null;


// ======================================================
// IMAGEN DE RESPALDO
// ======================================================

const PLACEHOLDER =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg"
             width="300"
             height="450"
             viewBox="0 0 300 450">

            <rect width="300"
                  height="450"
                  fill="#171922"/>

            <text
                x="150"
                y="210"
                fill="#777"
                font-size="18"
                text-anchor="middle"
                font-family="Arial">
                SIN PORTADA
            </text>

            <text
                x="150"
                y="240"
                fill="#555"
                font-size="12"
                text-anchor="middle"
                font-family="Arial">
                MovieZone
            </text>

        </svg>
    `);


// ======================================================
// CARGAR CATÁLOGO
// ======================================================

async function cargarCatalogo() {

    try {

        mostrarCarga(
            moviesContainer,
            "Cargando recomendaciones..."
        );


        const respuesta =
            await fetch(
                "/api/catalogo",
                {
                    cache: "no-store"
                }
            );


        if (!respuesta.ok) {

            throw new Error(
                `HTTP ${respuesta.status}`
            );
        }


        const data =
            await respuesta.json();


        peliculas =
            Array.isArray(
                data.peliculas
            )
                ? data.peliculas
                : [];


        series =
            Array.isArray(
                data.series
            )
                ? data.series
                : [];


        animes =
            Array.isArray(
                data.animes
            )
                ? data.animes
                : [];


        catalogo = [

            ...peliculas,

            ...series,

            ...animes

        ];


        mostrarCatalogo(
            catalogo.slice(0, 18),
            moviesContainer
        );


        mostrarCatalogo(
            peliculas,
            peliculasContainer
        );


        mostrarCatalogo(
            series,
            seriesContainer
        );


        mostrarCatalogo(
            animes,
            animesContainer
        );


        resultadoInfo.textContent =
            `${catalogo.length} disponibles`;


        peliculasInfo.textContent =
            `${peliculas.length} disponibles`;


        seriesInfo.textContent =
            `${series.length} disponibles`;


        animesInfo.textContent =
            `${animes.length} disponibles`;


    } catch (error) {

        console.error(
            error
        );


        mostrarError(
            moviesContainer,
            error
        );

        mostrarError(
            peliculasContainer,
            error
        );

        mostrarError(
            seriesContainer,
            error
        );

        mostrarError(
            animesContainer,
            error
        );
    }
}


// ======================================================
// MOSTRAR CATÁLOGO
// ======================================================

function mostrarCatalogo(
    lista,
    container
) {

    container.innerHTML = "";


    if (
        !Array.isArray(lista) ||
        !lista.length
    ) {

        container.innerHTML = `

            <div class="empty">

                No hay contenido
                disponible por el momento.

            </div>

        `;

        return;
    }


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
                PLACEHOLDER;


            const nombre =
                item.nombre ||
                "Sin título";


            const tipo =
                item.tipo ||
                "Contenido";


            card.innerHTML = `

                <img
                    src="${escapeAttribute(portada)}"
                    alt="${escapeAttribute(nombre)}"
                    loading="lazy"
                >

                <div
                    class="movie-info-small"
                >

                    <h3>
                        ${escapeHtml(nombre)}
                    </h3>

                    <span>
                        ${escapeHtml(tipo)}
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

                    if (
                        imagen.src !==
                        PLACEHOLDER
                    ) {

                        imagen.src =
                            PLACEHOLDER;
                    }
                }
            );


            card.addEventListener(
                "click",
                () => {

                    seleccionar(
                        item
                    );
                }
            );


            container.appendChild(
                card
            );
        }
    );
}


// ======================================================
// SELECCIONAR
// ======================================================

function seleccionar(
    item
) {

    seleccionActual =
        item;


    const nombre =
        item.nombre ||
        "Sin título";


    heroTitle.textContent =
        nombre;


    heroDescription.textContent =
        item.descripcion ||
        "Información disponible en el catálogo.";


    playerTitle.textContent =
        nombre;


    infoTitle.textContent =
        nombre;


    infoDescription.textContent =
        item.descripcion ||
        "Sin descripción disponible.";


    // --------------------------------------------------
    // TAGS
    // --------------------------------------------------

    infoTags.innerHTML = "";


    if (item.tipo) {

        agregarTag(
            item.tipo
        );
    }


    if (
        item.episodios &&
        item.episodios.length
    ) {

        agregarTag(
            `${item.episodios.length} episodios`
        );
    }


    // --------------------------------------------------
    // REPRODUCTOR
    // --------------------------------------------------

    if (
        item.reproductor
    ) {

        reproducir(
            item.reproductor
        );

    } else if (
        item.video
    ) {

        reproducir(
            item.video
        );

    } else {

        mostrarSinReproductor();
    }


    // --------------------------------------------------
    // EPISODIOS
    // --------------------------------------------------

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
// REPRODUCTOR
// ======================================================

function reproducir(
    url
) {

    if (!url) {

        mostrarSinReproductor();

        return;
    }


    playerWrapper.innerHTML = "";


    const iframe =
        document.createElement(
            "iframe"
        );


    iframe.id =
        "player";


    iframe.src =
        url;


    iframe.title =
        "Reproductor";


    iframe.allow =
        "autoplay; fullscreen; picture-in-picture";


    iframe.allowFullscreen =
        true;


    playerWrapper.appendChild(
        iframe
    );
}


// ======================================================
// SIN REPRODUCTOR
// ======================================================

function mostrarSinReproductor() {

    playerWrapper.innerHTML = `

        <div
            class="player-message"
        >

            <div>

                <strong>
                    Sin reproductor disponible
                    por el momento
                </strong>

                <br><br>

                Este contenido todavía
                no tiene un reproductor
                disponible.

            </div>

        </div>

    `;
}


// ======================================================
// EPISODIOS
// ======================================================

function mostrarEpisodios(
    item
) {

    const anterior =
        document.getElementById(
            "episodios"
        );


    if (anterior) {

        anterior.remove();
    }


    if (
        !Array.isArray(
            item.episodios
        ) ||
        !item.episodios.length
    ) {

        return;
    }


    const section =
        document.createElement(
            "section"
        );


    section.id =
        "episodios";


    section.className =
        "episodes-section";


    section.innerHTML = `

        <div
            class="section-title"
        >

            <h2>
                Episodios
            </h2>

            <span>
                ${item.episodios.length}
                disponibles
            </span>

        </div>


        <div
            class="episodes-list"
        ></div>

    `;


    document
        .querySelector(
            ".movie-info"
        )
        .after(
            section
        );


    const lista =
        section.querySelector(
            ".episodes-list"
        );


    item.episodios.forEach(
        (episodio, index) => {

            const boton =
                document.createElement(
                    "button"
                );


            const nombre =
                episodio.nombre ||
                `Episodio ${
                    index + 1
                }`;


            boton.textContent =
                nombre;


            boton.className =
                "episode-button";


            if (
                !episodio.video
            ) {

                boton.classList.add(
                    "disabled"
                );


                boton.title =
                    "Sin reproductor disponible";

            }


            boton.addEventListener(
                "click",
                () => {

                    if (
                        !episodio.video
                    ) {

                        return;
                    }


                    reproducir(
                        episodio.video
                    );


                    playerTitle.textContent =
                        `${item.nombre} - ${nombre}`;


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


            lista.appendChild(
                boton
            );
        }
    );
}


// ======================================================
// TAG
// ======================================================

function agregarTag(
    texto
) {

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

let temporizadorBusqueda =
    null;


searchInput.addEventListener(
    "input",
    () => {

        const texto =
            searchInput.value
                .trim();


        clearTimeout(
            temporizadorBusqueda
        );


        if (!texto) {

            mostrarCatalogo(
                catalogo.slice(
                    0,
                    18
                ),
                moviesContainer
            );


            resultadoInfo.textContent =
                `${catalogo.length} disponibles`;


            return;
        }


        temporizadorBusqueda =
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
// BÚSQUEDA API
// ======================================================

async function buscar(
    texto
) {

    try {

        moviesContainer.innerHTML = `

            <div class="loading">

                Buscando
                <strong>
                    ${escapeHtml(texto)}
                </strong>...

            </div>

        `;


        const respuesta =
            await fetch(
                `/api/buscar?q=${
                    encodeURIComponent(texto)
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


        const data =
            await respuesta.json();


        const resultados =
            Array.isArray(
                data.resultados
            )
                ? data.resultados
                : [];


        mostrarCatalogo(
            resultados,
            moviesContainer
        );


        resultadoInfo.textContent =
            `${resultados.length} resultados`;


    } catch (error) {

        console.error(
            error
        );


        mostrarError(
            moviesContainer,
            error
        );
    }
}


// ======================================================
// NAVEGACIÓN
// ======================================================

document
    .querySelectorAll(
        "nav a[data-section]"
    )
    .forEach(
        enlace => {

            enlace.addEventListener(
                "click",
                event => {

                    const seccion =
                        enlace.dataset
                            .section;


                    if (
                        seccion ===
                        "inicio"
                    ) {

                        return;
                    }


                    event.preventDefault();


                    const destino =
                        document.getElementById(
                            `seccion-${seccion}`
                        );


                    if (destino) {

                        destino.scrollIntoView({
                            behavior:
                                "smooth"
                        });
                    }
                }
            );
        }
    );


// ======================================================
// ERRORES
// ======================================================

function mostrarCarga(
    container,
    texto
) {

    container.innerHTML = `

        <div class="loading">
            ${escapeHtml(texto)}
        </div>

    `;
}


function mostrarError(
    container,
    error
) {

    container.innerHTML = `

        <div class="empty">

            No se pudo cargar
            el contenido.

            <br><br>

            <small>
                ${escapeHtml(
                    error.message
                )}
            </small>

        </div>

    `;
}


// ======================================================
// SEGURIDAD
// ======================================================

function escapeHtml(
    texto
) {

    return String(
        texto ?? ""
    )
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

cargarCatalogo();
