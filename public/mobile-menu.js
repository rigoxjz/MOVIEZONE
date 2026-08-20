(function () {
    "use strict";

    function initMovieZoneMobile() {

        if (document.getElementById("mz-mobile-bottom-nav")) {
            return;
        }

        const nav = document.createElement("div");

        nav.id = "mz-mobile-bottom-nav";

        nav.innerHTML = `
            <button type="button" class="mz-mobile-nav-item active" data-target="home">
                <ion-icon name="home-outline"></ion-icon>
                <span>Inicio</span>
            </button>

            <button type="button" class="mz-mobile-nav-item" data-target="movie">
                <ion-icon name="film-outline"></ion-icon>
                <span>Películas</span>
            </button>

            <button type="button" class="mz-mobile-nav-item" data-target="series">
                <ion-icon name="tv-outline"></ion-icon>
                <span>Series</span>
            </button>

            <button type="button" class="mz-mobile-nav-item" data-target="anime">
                <ion-icon name="sparkles-outline"></ion-icon>
                <span>Anime</span>
            </button>

            <button type="button" class="mz-mobile-nav-item" data-target="favorites">
                <ion-icon name="heart-outline"></ion-icon>
                <span>Favoritos</span>
            </button>
        `;

        document.body.appendChild(nav);

        const style = document.createElement("style");

        style.textContent = `
            #mz-mobile-bottom-nav {
                display: none;
            }

            @media (max-width: 768px) {

                #mz-mobile-bottom-nav {
                    position: fixed;
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);

                    left: 0;
                    right: 0;
                    bottom: 0;

                    height: 64px;

                    padding-bottom: env(safe-area-inset-bottom);

                    background: rgba(8, 6, 12, .97);

                    backdrop-filter: blur(18px);
                    -webkit-backdrop-filter: blur(18px);

                    border-top: 1px solid rgba(255,255,255,.08);

                    box-shadow: 0 -8px 30px rgba(0,0,0,.4);

                    z-index: 99999;
                }

                .mz-mobile-nav-item {
                    border: 0;
                    background: transparent;

                    color: rgba(255,255,255,.55);

                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;

                    gap: 3px;

                    font-family: inherit;
                    font-size: 10px;
                    font-weight: 600;

                    cursor: pointer;
                }

                .mz-mobile-nav-item ion-icon {
                    font-size: 21px;
                }

                .mz-mobile-nav-item.active {
                    color: #fff;
                }

                .mz-mobile-nav-item.active ion-icon {
                    color: #e50914;
                }

                body {
                    padding-bottom: 74px !important;
                }

                /*
                 * Mantener buscador y Online originales
                 */

                .netflix-navbar .search-container {
                    display: flex !important;
                }

                .api-status-badge {
                    display: flex !important;
                    padding: 5px 8px;
                    font-size: 10px;
                    gap: 4px;
                }

                .search-box-wrapper input {
                    width: 110px !important;
                }

                .search-box-wrapper input:focus {
                    width: 150px !important;
                }

                .nav-links {
                    display: none !important;
                }
            }

            @media (max-width: 430px) {

                .api-status-badge .status-text {
                    display: none;
                }

                .api-status-badge {
                    width: 22px;
                    height: 22px;
                    padding: 0;
                    justify-content: center;
                    border-radius: 50%;
                }

                .status-dot {
                    width: 7px;
                    height: 7px;
                }

                .search-box-wrapper input {
                    width: 90px !important;
                    font-size: 12px;
                }

                .search-box-wrapper input:focus {
                    width: 120px !important;
                }
            }
        `;

        document.head.appendChild(style);


        const home =
            document.getElementById("nav-link-home");

        const movie =
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


        function activar(tipo) {

            nav.querySelectorAll(
                ".mz-mobile-nav-item"
            ).forEach(btn => {

                btn.classList.toggle(
                    "active",
                    btn.dataset.target === tipo
                );

            });

        }


        function navegar(elemento, tipo) {

            if (!elemento) {
                console.warn(
                    "MovieZone: navegación no encontrada:",
                    tipo
                );
                return;
            }

            activar(tipo);

            elemento.click();

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }


        nav.querySelector(
            '[data-target="home"]'
        ).addEventListener(
            "click",
            () => navegar(home, "home")
        );


        nav.querySelector(
            '[data-target="movie"]'
        ).addEventListener(
            "click",
            () => navegar(movie, "movie")
        );


        nav.querySelector(
            '[data-target="series"]'
        ).addEventListener(
            "click",
            () => navegar(series, "series")
        );


        nav.querySelector(
            '[data-target="anime"]'
        ).addEventListener(
            "click",
            () => navegar(anime, "anime")
        );


        nav.querySelector(
            '[data-target="favorites"]'
        ).addEventListener(
            "click",
            () => navegar(favorites, "favorites")
        );


        console.log(
            "MovieZone: menú inferior móvil activo."
        );
    }


    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            initMovieZoneMobile
        );

    } else {

        initMovieZoneMobile();

    }

})();
