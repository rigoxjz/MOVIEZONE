(function () {
    "use strict";

    function initMovieZoneMobile() {

        if (document.getElementById("mz-mobile-bottom-nav")) {
            return;
        }

        /*
         * IMPORTANTE:
         * app.js ya tiene los listeners de navegación.
         * Por eso aquí hacemos click directamente sobre
         * los <a> originales, NO sobre los <li>.
         */

        const nav = document.createElement("div");

        nav.id = "mz-mobile-bottom-nav";

        nav.innerHTML = `
            <div class="mz-mobile-search">
                <form id="mz-mobile-search-form">
                    <ion-icon name="search-outline"></ion-icon>

                    <input
                        type="text"
                        id="mz-mobile-search-input"
                        placeholder="Buscar películas, series o anime..."
                        autocomplete="off"
                    >

                    <button type="submit">
                        Buscar
                    </button>
                </form>
            </div>

            <div class="mz-mobile-navigation">

                <button
                    type="button"
                    class="mz-mobile-nav-item active"
                    data-target="home"
                >
                    <ion-icon name="home-outline"></ion-icon>
                    <span>Inicio</span>
                </button>

                <button
                    type="button"
                    class="mz-mobile-nav-item"
                    data-target="movies"
                >
                    <ion-icon name="film-outline"></ion-icon>
                    <span>Películas</span>
                </button>

                <button
                    type="button"
                    class="mz-mobile-nav-item"
                    data-target="series"
                >
                    <ion-icon name="tv-outline"></ion-icon>
                    <span>Series</span>
                </button>

                <button
                    type="button"
                    class="mz-mobile-nav-item"
                    data-target="anime"
                >
                    <ion-icon name="sparkles-outline"></ion-icon>
                    <span>Anime</span>
                </button>

                <button
                    type="button"
                    class="mz-mobile-nav-item"
                    data-target="favorites"
                >
                    <ion-icon name="heart-outline"></ion-icon>
                    <span>Favoritos</span>
                </button>

            </div>
        `;

        document.body.appendChild(nav);


        /* =====================================================
           ESTILOS
           ===================================================== */

        const style = document.createElement("style");

        style.id = "mz-mobile-bottom-style";

        style.textContent = `

            #mz-mobile-bottom-nav {
                display: none;
            }

            @media (max-width: 768px) {

                /*
                 * Ocultar solamente la navegación superior.
                 * NO ocultamos el contenido.
                 */

                .netflix-navbar .nav-links {
                    display: none !important;
                }

                /*
                 * El buscador original desaparece del navbar.
                 * Usaremos el buscador inferior.
                 */

                .netflix-navbar .search-container {
                    display: none !important;
                }

                /*
                 * Navbar superior más limpia.
                 */

                .netflix-navbar {
                    height: 56px !important;
                }

                /*
                 * Barra móvil inferior completa
                 */

                #mz-mobile-bottom-nav {

                    display: block;

                    position: fixed;

                    left: 0;
                    right: 0;
                    bottom: 0;

                    z-index: 99999;

                    background:
                        rgba(10, 8, 15, 0.97);

                    backdrop-filter: blur(18px);
                    -webkit-backdrop-filter: blur(18px);

                    border-top:
                        1px solid rgba(255,255,255,.10);

                    box-shadow:
                        0 -8px 30px rgba(0,0,0,.35);

                    padding-bottom:
                        env(safe-area-inset-bottom);

                }

                /*
                 * Buscador
                 */

                .mz-mobile-search {

                    padding:
                        8px 10px 6px;

                }

                #mz-mobile-search-form {

                    height: 42px;

                    display: flex;
                    align-items: center;

                    background:
                        rgba(255,255,255,.08);

                    border:
                        1px solid rgba(255,255,255,.10);

                    border-radius: 12px;

                    overflow: hidden;

                }

                #mz-mobile-search-form ion-icon {

                    margin-left: 12px;

                    font-size: 18px;

                    color: #aaa;

                    flex-shrink: 0;

                }

                #mz-mobile-search-input {

                    flex: 1;

                    min-width: 0;

                    height: 100%;

                    border: none;

                    outline: none;

                    background: transparent;

                    color: white;

                    font-size: 13px;

                    padding:
                        0 10px;

                }

                #mz-mobile-search-input::placeholder {

                    color:
                        rgba(255,255,255,.48);

                }

                #mz-mobile-search-form button {

                    height: 34px;

                    margin-right: 4px;

                    padding:
                        0 13px;

                    border: none;

                    border-radius: 9px;

                    background:
                        #e50914;

                    color: white;

                    font-size: 12px;

                    font-weight: 700;

                    cursor: pointer;

                }

                /*
                 * Navegación inferior
                 */

                .mz-mobile-navigation {

                    height: 58px;

                    display: grid;

                    grid-template-columns:
                        repeat(5, 1fr);

                    align-items: center;

                }

                .mz-mobile-nav-item {

                    height: 58px;

                    display: flex;

                    flex-direction: column;

                    align-items: center;

                    justify-content: center;

                    gap: 3px;

                    border: none;

                    background: transparent;

                    color:
                        rgba(255,255,255,.55);

                    font-size: 10px;

                    font-weight: 600;

                    cursor: pointer;

                    -webkit-tap-highlight-color:
                        transparent;

                }

                .mz-mobile-nav-item ion-icon {

                    font-size: 20px;

                }

                .mz-mobile-nav-item.active {

                    color: #ffffff;

                }

                .mz-mobile-nav-item.active ion-icon {

                    color: #e50914;

                }

                /*
                 * Espacio inferior para que la barra no tape
                 * las últimas tarjetas.
                 */

                body {

                    padding-bottom:
                        120px !important;

                }

                /*
                 * El grid no debe quedar debajo de la barra.
                 */

                #grid-view {

                    padding-bottom:
                        30px;

                }

            }

            @media (max-width: 380px) {

                #mz-mobile-search-input {

                    font-size: 12px;

                }

                #mz-mobile-search-form button {

                    padding:
                        0 10px;

                    font-size: 11px;

                }

                .mz-mobile-nav-item {

                    font-size: 9px;

                }

                .mz-mobile-nav-item ion-icon {

                    font-size: 19px;

                }

            }

        `;

        document.head.appendChild(style);


        /* =====================================================
           ELEMENTOS ORIGINALES
           ===================================================== */

        const home =
            document.getElementById(
                "nav-link-home"
            );

        const movies =
            document.querySelector(
                '#nav-item-movies .filter-tab'
            );

        const series =
            document.querySelector(
                '#nav-item-series .filter-tab'
            );

        const anime =
            document.querySelector(
                '#nav-item-anime .filter-tab'
            );

        const favorites =
            document.getElementById(
                "nav-link-favoritos"
            );


        /*
         * Cambia visualmente el botón activo.
         */

        function activar(tipo) {

            document
                .querySelectorAll(
                    ".mz-mobile-nav-item"
                )
                .forEach(function (item) {

                    item.classList.remove(
                        "active"
                    );

                });

            const seleccionado =
                document.querySelector(
                    '.mz-mobile-nav-item[data-target="' +
                    tipo +
                    '"]'
                );

            if (seleccionado) {

                seleccionado.classList.add(
                    "active"
                );

            }

        }


        /*
         * Ejecutar navegación ORIGINAL
         */

        function navegar(elemento, tipo) {

            if (!elemento) {

                console.warn(
                    "MovieZone móvil: elemento no encontrado:",
                    tipo
                );

                return;

            }

            activar(tipo);

            /*
             * Aquí sí hacemos click sobre el <a>
             * que app.js ya controla.
             */

            elemento.click();

        }


        /* =====================================================
           BOTONES
           ===================================================== */

        nav
            .querySelector(
                '[data-target="home"]'
            )
            .addEventListener(
                "click",
                function () {

                    navegar(
                        home,
                        "home"
                    );

                }
            );


        nav
            .querySelector(
                '[data-target="movies"]'
            )
            .addEventListener(
                "click",
                function () {

                    navegar(
                        movies,
                        "movies"
                    );

                }
            );


        nav
            .querySelector(
                '[data-target="series"]'
            )
            .addEventListener(
                "click",
                function () {

                    navegar(
                        series,
                        "series"
                    );

                }
            );


        nav
            .querySelector(
                '[data-target="anime"]'
            )
            .addEventListener(
                "click",
                function () {

                    navegar(
                        anime,
                        "anime"
                    );

                }
            );


        nav
            .querySelector(
                '[data-target="favorites"]'
            )
            .addEventListener(
                "click",
                function () {

                    navegar(
                        favorites,
                        "favorites"
                    );

                }
            );


        /* =====================================================
           BUSCADOR MÓVIL
           ===================================================== */

        const mobileSearchForm =
            document.getElementById(
                "mz-mobile-search-form"
            );

        const mobileSearchInput =
            document.getElementById(
                "mz-mobile-search-input"
            );

        mobileSearchForm.addEventListener(
            "submit",
            function (event) {

                event.preventDefault();

                const texto =
                    mobileSearchInput.value.trim();

                if (!texto) {

                    mobileSearchInput.focus();

                    return;

                }

                /*
                 * Usamos el formulario original.
                 * De esta forma app.js sigue haciendo
                 * exactamente la misma búsqueda.
                 */

                const originalInput =
                    document.getElementById(
                        "search-input"
                    );

                const originalForm =
                    document.getElementById(
                        "search-form"
                    );

                if (
                    originalInput &&
                    originalForm
                ) {

                    originalInput.value =
                        texto;

                    originalForm.dispatchEvent(
                        new Event(
                            "submit",
                            {
                                bubbles: true,
                                cancelable: true
                            }
                        )
                    );

                }

                activar("home");

                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });

            }
        );


        /*
         * Enter también funciona.
         */

        mobileSearchInput.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key === "Enter"
                ) {

                    event.preventDefault();

                    mobileSearchForm.requestSubmit();

                }

            }
        );


        /*
         * Detectar navegación desde otras partes
         * y mantener el botón visualmente correcto.
         */

        document.addEventListener(
            "click",
            function (event) {

                const target =
                    event.target.closest(
                        ".filter-tab, " +
                        "#nav-link-home, " +
                        "#nav-link-favoritos"
                    );

                if (!target) return;


                if (
                    target.id ===
                    "nav-link-home"
                ) {

                    activar("home");

                } else if (
                    target.id ===
                    "nav-link-favoritos"
                ) {

                    activar("favorites");

                } else {

                    const tipo =
                        target.dataset.type;

                    if (tipo) {

                        activar(tipo);

                    }

                }

            }
        );


        console.log(
            "MovieZone: navegación móvil inferior cargada."
        );

    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            initMovieZoneMobile
        );

    } else {

        initMovieZoneMobile();

    }

})();
