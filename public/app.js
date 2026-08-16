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

const heroTitle =
    document.getElementById(
        "hero-title"
    );

const heroDescription =
    document.getElementById(
        "hero-description"
    );

const hero =
    document.querySelector(
        ".hero"
    );

let seleccionActual = null;

let seccionActual =
    "peliculas";

let paginaActual = 1;

let cargando = false;


// ======================================================
// CARGAR SECCIÓN
// ======================================================

async function cargarSeccion(
    seccion,
    pagina = 1,
    reemplazar = true
) {

    if (cargando) return;

    cargando = true;


    if (reemplazar) {

        moviesContainer.innerHTML = `
            <div class="loading">
                Cargando ${textoSeccion(seccion)}...
            </div>
        `;

    }


    try {

        const respuesta =
            await fetch(
                `/api/catalogo?seccion=${encodeURIComponent(seccion)}&pagina=${pagina}`,
                {
                    cache: "no-store"
                }
            );


        if (!respuesta.ok) {

            throw new Error(
                `HTTP ${respuesta.status}`
            );

        }


        const datos =
            await respuesta.json();


        if (reemplazar) {

            moviesContainer.innerHTML = "";

        }


        mostrarCatalogo(
            datos.resultados || [],
            !reemplazar
        );


        paginaActual =
            datos.siguientePagina ||
            pagina + 1;


        resultadoInfo.textContent =
            `${datos.cantidad || 0} disponibles`;


        actualizarBotonMas(
            datos.hayMas
        );


    } catch (error) {

        console.error(
            error
        );


        if (reemplazar) {

            moviesContainer.innerHTML = `
                <div class="loading">
                    No se pudo cargar la sección.
                    <br><br>
                    <small>
                        ${escapeHtml(error.message)}
                    </small>
                </div>
            `;

        }

    } finally {

        cargando = false;

    }

}


// ======================================================
// TEXTO SECCIÓN
// ======================================================

function textoSeccion(
    seccion
) {

    if (seccion === "series") {
        return "series";
    }

    if (seccion === "anime") {
        return "anime";
    }

    return "películas";
}


// ======================================================
// MOSTRAR CATÁLOGO
// ======================================================

function mostrarCatalogo(
    lista,
    agregar = false
) {

    if (!agregar) {

        moviesContainer.innerHTML =
            "";

    }


    if (!lista.length && !agregar) {

        moviesContainer.innerHTML = `
            <div class="loading">
                No se encontraron resultados.
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
                "https://via.placeholder.com/300x450/11131a/ffffff?text=Sin+portada";


            const nombre =
                item.nombre ||
                "Sin título";


            const tipo =
                item.tipo ||
                "Película";


            const tieneVideo =
                Boolean(
                    item.reproductor
                ) ||
                (
                    Array.isArray(
                        item.episodios
                    ) &&
                    item.episodios.some(
                        e => e.video
                    )
                );


            card.innerHTML = `

                <div class="poster-wrap">

                    <img
                        src="${escapeAttribute(portada)}"
                        alt="${escapeAttribute(nombre)}"
                        loading="lazy"
                    >

                    <span class="type-badge">
                        ${escapeHtml(tipo)}
                    </span>

                    ${
                        tieneVideo
                            ? `<span class="available">
                                Disponible
                              </span>`
                            : `<span class="unavailable">
                                Sin reproductor
                              </span>`
                    }

                </div>

                <div class="movie-info-small">

                    <h3>
                        ${escapeHtml(nombre)}
                    </h3>

                    <span>
                        ${
                            item.episodios &&
                            item.episodios.length
                                ? `${item.episodios.length} episodios`
                                : tipo
                        }
                    </span>

                </div>

            `;


            const img =
                card.querySelector(
                    "img"
                );


            img.addEventListener(
                "error",
                () => {

                    img.src =
                        "https://via.placeholder.com/300x450/11131a/ffffff?text=Sin+portada";

                }
            );


            card.addEventListener(
                "click",
                () => seleccionar(item)
            );


            moviesContainer.appendChild(
                card
            );

        }
    );

}


// ======================================================
// BOTÓN SIGUIENTE
// ======================================================

function actualizarBotonMas(
    hayMas
) {

    let boton =
        document.getElementById(
            "cargar-mas"
        );


    if (!boton) {

        boton =
            document.createElement(
                "button"
            );

        boton.id =
            "cargar-mas";

        boton.textContent =
            "Cargar 5 más";

        boton.style.cssText = `
            display:block;
            margin:30px auto 0;
            padding:13px 25px;
            border:1px solid #30333f;
            border-radius:8px;
            background:#171922;
            color:white;
            cursor:pointer;
            font-weight:bold;
        `;


        boton.addEventListener(
            "click",
            () => {

                cargarSeccion(
                    seccionActual,
                    paginaActual,
                    true
                );

            }
        );


        moviesContainer.parentElement.appendChild(
            boton
        );

    }


    boton.style.display =
        hayMas
            ? "block"
            : "none";

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


    playerTitle.textContent =
        nombre;


    infoTitle.textContent =
        nombre;


    heroDescription.textContent =
        item.descripcion ||
        "Consulta la información disponible de este contenido.";


    infoDescription.textContent =
        item.descripcion ||
        "Sin descripción disponible.";


    infoTags.innerHTML =
        "";


    agregarTag(
        item.tipo ||
        "Contenido"
    );


    if (item.year) {
        agregarTag(item.year);
    }


    if (item.genero) {
        agregarTag(item.genero);
    }


    /*
     * Película
     */

    if (
        item.reproductor
    ) {

        reproducir(
            item.reproductor
        );

    } else {

        mostrarSinReproductor();

    }


    /*
     * Series / Anime
     */

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

function reproducir(
    url
) {

    if (!url) {

        mostrarSinReproductor();

        return;

    }


    player.src =
        url;


    player.style.display =
        "block";


    const aviso =
        document.getElementById(
            "sin-reproductor"
        );


    if (aviso) {
        aviso.remove();
    }

}


// ======================================================
// SIN REPRODUCTOR
// ======================================================

function mostrarSinReproductor() {

    player.src =
        "about:blank";


    player.style.display =
        "none";


    let aviso =
        document.getElementById(
            "sin-reproductor"
        );


    if (!aviso) {

        aviso =
            document.createElement(
                "div"
            );

        aviso.id =
            "sin-reproductor";

        aviso.style.cssText = `
            min-height:300px;
            display:flex;
            align-items:center;
            justify-content:center;
            text-align:center;
            color:#aaa;
            background:#050505;
            font-size:16px;
            padding:30px;
        `;


        player.parentElement.appendChild(
            aviso
        );

    }


    aviso.innerHTML = `
        <div>
            <div style="font-size:35px;margin-bottom:12px;">
                ▶
            </div>

            Sin reproductor disponible
            <br>
            <small>
                por el momento
            </small>
        </div>
    `;

}


// ======================================================
// EPISODIOS
// ======================================================

function mostrarEpisodios(
    item
) {

    const existente =
        document.getElementById(
            "episodios"
        );


    if (existente) {
        existente.remove();
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


    section.style.marginTop =
        "25px";


    section.innerHTML = `

        <div class="section-title">

            <h2>
                Episodios
            </h2>

            <span>
                ${item.episodios.length}
                disponibles
            </span>

        </div>

        <div
            id="episodios-lista"
            class="episodes-grid"
        ></div>

    `;


    document
        .querySelector(
            ".movie-info"
        )
        .after(section);


    const lista =
        section.querySelector(
            "#episodios-lista"
        );


    item.episodios.forEach(
        (episodio, index) => {

            const boton =
                document.createElement(
                    "button"
                );


            const nombre =
                episodio.nombre ||
                `Episodio ${index + 1}`;


            boton.innerHTML = `

                <strong>
                    ${escapeHtml(nombre)}
                </strong>

                <span>
                    ${
                        episodio.video
                            ? "Disponible"
                            : "Sin reproductor"
                    }
                </span>

            `;


            boton.className =
                episodio.video
                    ? "episode available-episode"
                    : "episode unavailable-episode";


            boton.addEventListener(
                "click",
                () => {

                    if (!episodio.video) {

                        mostrarSinReproductor();

                        playerTitle.textContent =
                            `${item.nombre} - ${nombre}`;

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
// TAGS
// ======================================================

function agregarTag(
    texto
) {

    if (!texto) return;


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

let temporizadorBusqueda;


searchInput.addEventListener(
    "input",
    () => {

        clearTimeout(
            temporizadorBusqueda
        );


        const texto =
            searchInput.value
                .trim();


        if (!texto) {

            cargarSeccion(
                seccionActual,
                1,
                true
            );

            return;

        }


        temporizadorBusqueda =
            setTimeout(
                () => buscar(texto),
                500
            );

    }
);


// ======================================================
// BUSCAR
// ======================================================

async function buscar(
    texto
) {

    moviesContainer.innerHTML = `
        <div class="loading">
            Buscando...
        </div>
    `;


    try {

        const respuesta =
            await fetch(
                `/api/buscar?q=${encodeURIComponent(texto)}`,
                {
                    cache: "no-store"
                }
            );


        const datos =
            await respuesta.json();


        moviesContainer.innerHTML =
            "";


        mostrarCatalogo(
            datos.resultados || []
        );


        resultadoInfo.textContent =
            `${datos.cantidad || 0} resultados`;


    } catch (error) {

        console.error(
            error
        );


        moviesContainer.innerHTML = `
            <div class="loading">
                Error realizando la búsqueda.
            </div>
        `;

    }

}


// ======================================================
// MENÚ
// ======================================================

document
    .querySelectorAll(
        "[data-seccion]"
    )
    .forEach(
        enlace => {

            enlace.addEventListener(
                "click",
                event => {

                    event.preventDefault();


                    const seccion =
                        enlace.dataset.seccion;


                    seccionActual =
                        seccion;


                    paginaActual =
                        1;


                    searchInput.value =
                        "";


                    cargarSeccion(
                        seccion,
                        1,
                        true
                    );


                    document
                        .getElementById(
                            "peliculas"
                        )
                        .scrollIntoView({
                            behavior:
                                "smooth"
                        });

                }
            );

        }
    );


// ======================================================
// SEGURIDAD
// ======================================================

function escapeHtml(
    texto
) {

    return String(
        texto
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
// INICIO
// ======================================================

cargarSeccion(
    "peliculas",
    1,
    true
);
