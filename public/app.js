const moviesContainer =
    document.getElementById("movies-container");

const searchInput =
    document.getElementById("search");

const resultadoInfo =
    document.getElementById("resultado-info");

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

const heroTitle =
    document.getElementById("hero-title");

const heroDescription =
    document.getElementById("hero-description");


let catalogo = [];

let paginaPeliculas = 1;
let paginaSeries = 1;
let paginaAnimes = 1;

let cargando = false;

let siguientePeliculas = true;
let siguienteSeries = true;
let siguienteAnimes = true;


// ======================================================
// CARGAR CATEGORÍA
// ======================================================

async function cargarCategoria(
    categoria,
    pagina = 1
) {

    if (cargando) return;

    cargando = true;


    try {

        const respuesta =
            await fetch(
                `/api/${categoria}?pagina=${pagina}`,
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


        if (
            !Array.isArray(
                data.resultados
            )
        ) {

            throw new Error(
                "Respuesta inválida"
            );
        }


        if (pagina === 1) {

            catalogo = [];
        }


        catalogo.push(
            ...data.resultados
        );


        mostrarCatalogo(
            catalogo
        );


        if (categoria === "peliculas") {

            paginaPeliculas =
                data.siguiente;

            siguientePeliculas =
                !!data.siguiente;
        }


        if (categoria === "series") {

            paginaSeries =
                data.siguiente;

            siguienteSeries =
                !!data.siguiente;
        }


        if (categoria === "animes") {

            paginaAnimes =
                data.siguiente;

            siguienteAnimes =
                !!data.siguiente;
        }


    } catch (error) {

        console.error(error);


        if (pagina === 1) {

            moviesContainer.innerHTML = `
                <div class="loading">
                    No se pudo cargar el contenido.
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
// CARGAR INICIO
// ======================================================

async function cargarInicio() {

    moviesContainer.innerHTML = `
        <div class="loading">
            Cargando recomendaciones...
        </div>
    `;


    catalogo = [];


    try {

        const peticiones =
            await Promise.all([

                fetch(
                    "/api/peliculas?pagina=1"
                ),

                fetch(
                    "/api/series?pagina=1"
                ),

                fetch(
                    "/api/animes?pagina=1"
                )
            ]);


        const datos =
            await Promise.all(
                peticiones.map(
                    r => r.json()
                )
            );


        catalogo = [

            ...(datos[0].resultados || []),

            ...(datos[1].resultados || []),

            ...(datos[2].resultados || [])

        ];


        mostrarCatalogo(
            catalogo
        );


    } catch (error) {

        console.error(error);


        moviesContainer.innerHTML = `
            <div class="loading">
                No se pudieron cargar las recomendaciones.
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
                No se encontraron resultados.
            </div>
        `;

        resultadoInfo.textContent =
            "0 resultados";

        return;
    }


    resultadoInfo.textContent =
        `${lista.length} resultados`;


    lista.forEach(item => {

        const card =
            document.createElement(
                "article"
            );


        card.className = "movie";


        const portada =
            item.portada ||
            "https://via.placeholder.com/300x450?text=Sin+portada";


        const nombre =
            item.nombre ||
            "Sin título";


        const tipo =
            item.tipo ||
            "Contenido";


        const episodios =
            Array.isArray(
                item.episodios
            )
                ? item.episodios.length
                : 0;


        let extra = "";


        if (
            (tipo === "Serie" ||
             tipo === "Anime") &&
            episodios > 0
        ) {

            extra =
                ` · ${episodios} episodios`;
        }


        card.innerHTML = `

            <img
                src="${escapeAttribute(portada)}"
                alt="${escapeAttribute(nombre)}"
                loading="lazy"
                onerror="
                    this.src='https://via.placeholder.com/300x450?text=Sin+portada'
                "
            >

            <div class="movie-info-small">

                <h3>
                    ${escapeHtml(nombre)}
                </h3>

                <span>
                    ${escapeHtml(tipo)}
                    ${escapeHtml(extra)}
                </span>

            </div>
        `;


        card.addEventListener(
            "click",
            () => seleccionar(item)
        );


        moviesContainer.appendChild(
            card
        );

    });
}


// ======================================================
// SELECCIONAR
// ======================================================

function seleccionar(item) {

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
        item.descripcion || "";


    infoDescription.textContent =
        item.descripcion ||
        "Sin descripción disponible.";


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


    // ==================================================
    // REPRODUCTOR
    // ==================================================

    if (item.reproductor) {

        reproducir(
            item.reproductor
        );

    } else {

        player.src =
            "about:blank";


        playerTitle.textContent =
            `${nombre} — Sin reproductor disponible por el momento`;
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
// REPRODUCTOR
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
                episodios
            </span>

        </div>

        <div
            id="episodios-lista"
            style="
                display:grid;
                gap:10px;
            "
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


            boton.textContent =
                episodio.nombre ||
                `Episodio ${index + 1}`;


            boton.style.cssText = `
                background:#171922;
                color:white;
                border:1px solid #292c38;
                padding:14px;
                border-radius:7px;
                text-align:left;
                cursor:pointer;
            `;


            if (!episodio.video) {

                boton.textContent +=
                    " — Sin reproductor disponible";
            }


            boton.addEventListener(
                "click",
                () => {

                    if (
                        !episodio.video
                    ) {

                        player.src =
                            "about:blank";


                        playerTitle.textContent =
                            `${item.nombre} - ${episodio.nombre} — Sin reproductor disponible por el momento`;

                        return;
                    }


                    reproducir(
                        episodio.video
                    );


                    playerTitle.textContent =
                        `${item.nombre} - ${
                            episodio.nombre ||
                            "Episodio " +
                            (index + 1)
                        }`;


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

function agregarTag(texto) {

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

let timerBusqueda = null;


searchInput.addEventListener(
    "input",
    () => {

        clearTimeout(
            timerBusqueda
        );


        const texto =
            searchInput.value
                .trim();


        if (!texto) {

            cargarInicio();

            return;
        }


        timerBusqueda =
            setTimeout(
                () => buscar(texto),
                500
            );
    }
);


// ======================================================
// BUSCAR
// ======================================================

async function buscar(texto) {

    moviesContainer.innerHTML = `
        <div class="loading">
            Buscando "${escapeHtml(texto)}"...
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


        const data =
            await respuesta.json();


        if (!respuesta.ok) {

            throw new Error(
                data.error ||
                "Error en búsqueda"
            );
        }


        catalogo =
            data.resultados || [];


        mostrarCatalogo(
            catalogo
        );


    } catch (error) {

        console.error(error);


        moviesContainer.innerHTML = `
            <div class="loading">
                Error al buscar.
                <br><br>
                ${escapeHtml(error.message)}
            </div>
        `;
    }
}


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


function escapeAttribute(texto) {

    return escapeHtml(
        texto
    );
}


// ======================================================
// INICIAR
// ======================================================

cargarInicio();
