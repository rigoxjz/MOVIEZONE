const peliculasContainer =
    document.getElementById("peliculas-container");

const seriesContainer =
    document.getElementById("series-container");

const animeContainer =
    document.getElementById("anime-container");

const busquedaContainer =
    document.getElementById("busqueda-container");

const busquedaSection =
    document.getElementById("busqueda-section");

const searchInput =
    document.getElementById("search");

const player =
    document.getElementById("player");

const playerTitle =
    document.getElementById("player-title");

const infoTitle =
    document.getElementById("info-title");

const infoDescription =
    document.getElementById("info-description");

const infoTags =
    document.getElementById("info-tags");

const episodiosSection =
    document.getElementById("episodios-section");

const episodiosLista =
    document.getElementById("episodios-lista");

const episodiosCount =
    document.getElementById("episodios-count");

const peliculasCount =
    document.getElementById("peliculas-count");

const seriesCount =
    document.getElementById("series-count");

const animeCount =
    document.getElementById("anime-count");

const busquedaCount =
    document.getElementById("busqueda-count");


let catalogo = [];

let busquedaTimer = null;


// ======================================================
// API
// ======================================================

async function obtenerAPI(url) {

    const respuesta =
        await fetch(url, {
            cache: "no-store"
        });


    if (!respuesta.ok) {

        throw new Error(
            `HTTP ${respuesta.status}`
        );

    }


    return respuesta.json();
}


// ======================================================
// CARGAR CATÁLOGO
// ======================================================

async function cargarCatalogo() {

    peliculasContainer.innerHTML =
        loading("Cargando películas...");

    seriesContainer.innerHTML =
        loading("Cargando series...");

    animeContainer.innerHTML =
        loading("Cargando anime...");


    try {

        const datos =
            await obtenerAPI(
                "/api/catalogo"
            );


        catalogo =
            Array.isArray(datos.resultados)
                ? datos.resultados
                : [];


        mostrarSecciones(
            catalogo
        );


    } catch (error) {

        console.error(error);


        peliculasContainer.innerHTML =
            errorHTML(error);

        seriesContainer.innerHTML =
            errorHTML(error);

        animeContainer.innerHTML =
            errorHTML(error);

    }

}


// ======================================================
// SEPARAR CONTENIDOS
// ======================================================

function mostrarSecciones(lista) {

    const peliculas =
        lista.filter(
            item => item.tipo === "Película"
        );


    const series =
        lista.filter(
            item => item.tipo === "Serie"
        );


    const anime =
        lista.filter(
            item => item.tipo === "Anime"
        );


    peliculasCount.textContent =
        `${peliculas.length} títulos`;


    seriesCount.textContent =
        `${series.length} títulos`;


    animeCount.textContent =
        `${anime.length} títulos`;


    mostrarCards(
        peliculas,
        peliculasContainer
    );


    mostrarCards(
        series,
        seriesContainer
    );


    mostrarCards(
        anime,
        animeContainer
    );

}


// ======================================================
// CARDS
// ======================================================

function mostrarCards(lista, container) {

    container.innerHTML = "";


    if (!lista.length) {

        container.innerHTML = `

            <div class="loading">

                No hay contenido disponible.

            </div>

        `;

        return;
    }


    lista.forEach(item => {

        const card =
            document.createElement("article");


        card.className =
            "movie";


        const portada =
            item.portada ||
            placeholder();


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

            <div class="movie-info-small">

                <h3>
                    ${escapeHtml(nombre)}
                </h3>

                <span>
                    ${escapeHtml(tipo)}
                </span>

            </div>

        `;


        const imagen =
            card.querySelector("img");


        imagen.addEventListener(
            "error",
            () => {

                imagen.src =
                    placeholder();

            }
        );


        card.addEventListener(
            "click",
            () => seleccionar(item)
        );


        container.appendChild(card);

    });

}


// ======================================================
// SELECCIONAR
// ======================================================

function seleccionar(item) {

    if (!item) return;


    playerTitle.textContent =
        item.nombre ||
        "Reproductor";


    infoTitle.textContent =
        item.nombre ||
        "Sin título";


    infoDescription.textContent =
        item.descripcion ||
        "Sin descripción disponible.";


    mostrarTags(item);


    mostrarEpisodios(item);


    /*
     * Si existe reproductor propio,
     * se carga en el iframe.
     */

    if (item.reproductor) {

        reproducir(
            item.reproductor
        );

    } else {

        reproducir(null);

    }


    document
        .getElementById("reproductor")
        .scrollIntoView({
            behavior: "smooth"
        });

}


// ======================================================
// REPRODUCTOR
// ======================================================

function reproducir(url) {

    if (!url) {

        player.src =
            "about:blank";

        return;
    }


    player.src = url;

}


// ======================================================
// EPISODIOS
// ======================================================

function mostrarEpisodios(item) {

    episodiosLista.innerHTML = "";


    const episodios =
        Array.isArray(item.episodios)
            ? item.episodios
            : [];


    if (
        episodios.length === 0 ||
        (
            item.tipo !== "Serie" &&
            item.tipo !== "Anime"
        )
    ) {

        episodiosSection.style.display =
            "none";

        return;

    }


    episodiosSection.style.display =
        "block";


    episodiosCount.textContent =
        `${episodios.length} episodios`;


    episodios.forEach(
        (episodio, index) => {

            const boton =
                document.createElement("button");


            boton.className =
                "episode";


            boton.innerHTML = `

                <strong>
                    ${escapeHtml(
                        episodio.nombre ||
                        `Episodio ${index + 1}`
                    )}
                </strong>

                <small>
                    ${episodio.video
                        ? "Disponible"
                        : "Reproductor no disponible"}
                </small>

            `;


            boton.addEventListener(
                "click",
                () => {

                    if (!episodio.video) {

                        alert(
                            "Este episodio no tiene un reproductor disponible."
                        );

                        return;

                    }


                    reproducir(
                        episodio.video
                    );


                    playerTitle.textContent =
                        `${item.nombre} - ${
                            episodio.nombre ||
                            `Episodio ${index + 1}`
                        }`;


                    document
                        .getElementById("reproductor")
                        .scrollIntoView({
                            behavior: "smooth"
                        });

                }
            );


            episodiosLista.appendChild(
                boton
            );

        }
    );

}


// ======================================================
// TAGS
// ======================================================

function mostrarTags(item) {

    infoTags.innerHTML = "";


    if (item.tipo) {
        agregarTag(item.tipo);
    }


    if (item.genero) {
        agregarTag(item.genero);
    }


    if (item.year) {
        agregarTag(item.year);
    }


    if (
        Array.isArray(item.episodios) &&
        item.episodios.length
    ) {

        agregarTag(
            `${item.episodios.length} episodios`
        );

    }

}


// ======================================================
// TAG
// ======================================================

function agregarTag(texto) {

    const tag =
        document.createElement("span");


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

searchInput.addEventListener(
    "input",
    () => {

        const texto =
            searchInput.value
                .trim();


        clearTimeout(
            busquedaTimer
        );


        if (!texto) {

            busquedaSection.style.display =
                "none";


            document
                .getElementById("peliculas")
                .style.display = "";


            document
                .getElementById("series")
                .style.display = "";


            document
                .getElementById("anime")
                .style.display = "";


            return;

        }


        busquedaTimer =
            setTimeout(
                () => ejecutarBusqueda(texto),
                400
            );

    }
);


// ======================================================
// EJECUTAR BÚSQUEDA
// ======================================================

async function ejecutarBusqueda(texto) {

    busquedaSection.style.display =
        "block";


    busquedaContainer.innerHTML =
        loading(
            `Buscando "${texto}"...`
        );


    /*
     * Ocultar las secciones del catálogo
     * mientras se muestran resultados.
     */

    document
        .getElementById("peliculas")
        .style.display = "none";


    document
        .getElementById("series")
        .style.display = "none";


    document
        .getElementById("anime")
        .style.display = "none";


    try {

        const datos =
            await obtenerAPI(
                `/api/buscar?q=${encodeURIComponent(texto)}`
            );


        const resultados =
            Array.isArray(datos.resultados)
                ? datos.resultados
                : [];


        busquedaCount.textContent =
            `${resultados.length} resultados`;


        mostrarCards(
            resultados,
            busquedaContainer
        );


    } catch (error) {

        console.error(error);


        busquedaContainer.innerHTML =
            errorHTML(error);

    }

}


// ======================================================
// ESCAPAR HTML
// ======================================================

function escapeHtml(texto) {

    return String(texto)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function escapeAttribute(texto) {

    return escapeHtml(texto);

}


// ======================================================
// PLACEHOLDER
// ======================================================

function placeholder() {

    return (
        "data:image/svg+xml," +
        encodeURIComponent(`

            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="300"
                height="450"
                viewBox="0 0 300 450"
            >

                <rect
                    width="300"
                    height="450"
                    fill="#171922"
                />

                <text
                    x="150"
                    y="225"
                    fill="#777"
                    text-anchor="middle"
                    font-size="18"
                    font-family="Arial"
                >
                    Sin portada
                </text>

            </svg>

        `)
    );

}


// ======================================================
// LOADING
// ======================================================

function loading(texto) {

    return `

        <div class="loading">

            ${escapeHtml(texto)}

        </div>

    `;

}


// ======================================================
// ERROR
// ======================================================

function errorHTML(error) {

    return `

        <div class="error">

            No se pudo cargar el contenido.

            <br><br>

            <small>
                ${escapeHtml(
                    error.message || "Error desconocido"
                )}
            </small>

        </div>

    `;

}


// ======================================================
// INICIAR
// ======================================================

cargarCatalogo();