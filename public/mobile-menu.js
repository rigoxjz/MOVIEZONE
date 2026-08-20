/* =========================================================
   MovieZone - Menú móvil
   No modifica server.js ni las APIs.
   Reutiliza los botones existentes de index.html.
   ========================================================= */

(function () {
    "use strict";

    function iniciarMenuMovil() {

        // Evitar que se cree dos veces
        if (document.getElementById("mz-mobile-menu")) {
            return;
        }

        // Navegación existente
        const nav = document.querySelector(".nav-links");

        if (!nav) {
            console.warn("MovieZone: .nav-links no encontrado.");
            return;
        }

        // Buscar header
        let header = nav.closest("header");

        if (!header) {
            header = nav.parentElement;
        }

        if (!header) {
            header = document.body;
        }

        /* =====================================================
           ESTILOS DEL MENÚ MÓVIL
           ===================================================== */

        const style = document.createElement("style");

        style.id = "mz-mobile-menu-style";

        style.textContent = `

            /* Barra superior móvil */

            .mz-mobile-bar {
                display: none;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                box-sizing: border-box;
                padding: 10px 14px;
                background: #0b0b0b;
                position: relative;
                z-index: 9998;
            }

            .mz-mobile-logo {
                font-size: 22px;
                font-weight: 800;
                color: #ffffff;
                white-space: nowrap;
            }

            .mz-mobile-logo span {
                color: #e50914;
            }

            .mz-mobile-actions {
                display: flex;
                align-items: center;
                gap: 5px;
            }

            .mz-mobile-btn {
                width: 44px;
                height: 44px;
                border: none;
                border-radius: 8px;
                background: transparent;
                color: #ffffff;
                font-size: 25px;
                cursor: pointer;

                display: flex;
                align-items: center;
                justify-content: center;
            }

            .mz-mobile-btn:hover,
            .mz-mobile-btn:focus {
                background: #222222;
                outline: none;
            }

            /* =================================================
               CONTENEDOR DEL MENÚ
               ================================================= */

            #mz-mobile-menu {
                position: fixed;
                inset: 0;

                z-index: 99999;

                visibility: hidden;
                pointer-events: none;
            }

            #mz-mobile-menu.open {
                visibility: visible;
                pointer-events: auto;
            }

            /* Fondo oscuro */

            .mz-mobile-backdrop {
                position: absolute;
                inset: 0;

                background: rgba(0, 0, 0, 0.72);

                opacity: 0;

                transition: opacity 0.2s ease;
            }

            #mz-mobile-menu.open .mz-mobile-backdrop {
                opacity: 1;
            }

            /* =================================================
               PANEL LATERAL
               ================================================= */

            .mz-mobile-drawer {
                position: absolute;

                top: 0;
                right: 0;

                width: min(85vw, 340px);
                height: 100%;

                box-sizing: border-box;

                padding: 20px 16px;

                background: #111111;

                box-shadow: -10px 0 35px rgba(0, 0, 0, 0.5);

                overflow-y: auto;

                transform: translateX(100%);

                transition: transform 0.22s ease;
            }

            #mz-mobile-menu.open .mz-mobile-drawer {
                transform: translateX(0);
            }

            /* Cabecera */

            .mz-mobile-drawer-head {
                display: flex;
                align-items: center;
                justify-content: space-between;

                padding-bottom: 18px;
                margin-bottom: 12px;

                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }

            .mz-mobile-title {
                font-size: 24px;
                font-weight: 800;
                color: #ffffff;
            }

            .mz-mobile-title span {
                color: #e50914;
            }

            /* =================================================
               BOTONES DEL MENÚ
               ================================================= */

            .mz-mobile-item {
                width: 100%;

                min-height: 54px;

                display: flex;
                align-items: center;

                gap: 14px;

                padding: 12px 15px;
                margin: 5px 0;

                border: none;
                border-radius: 9px;

                background: transparent;

                color: #eeeeee;

                font-size: 16px;
                font-weight: 600;

                text-align: left;

                cursor: pointer;
            }

            .mz-mobile-item:hover,
            .mz-mobile-item:focus {
                background: #242424;
                color: #ffffff;
                outline: none;
            }

            .mz-mobile-item:active {
                transform: scale(0.98);
            }

            .mz-mobile-item .mz-icon {
                width: 25px;

                text-align: center;

                font-size: 19px;
            }

            /* =================================================
               SOLO TELÉFONOS / TABLETS
               ================================================= */

            @media (max-width: 992px) {

                .mz-mobile-bar {
                    display: flex;
                }

                #mz-mobile-menu {
                    display: block;
                }

            }

            /* =================================================
               ESCRITORIO
               ================================================= */

            @media (min-width: 993px) {

                .mz-mobile-bar,
                #mz-mobile-menu {
                    display: none !important;
                }

            }

        `;

        document.head.appendChild(style);


        /* =====================================================
           CREAR BARRA SUPERIOR
           ===================================================== */

        const mobileBar = document.createElement("div");

        mobileBar.className = "mz-mobile-bar";

        mobileBar.innerHTML = `

            <div class="mz-mobile-logo">
                Movie<span>Zone</span>
            </div>

            <div class="mz-mobile-actions">

                <button
                    type="button"
                    class="mz-mobile-btn"
                    id="mz-mobile-search"
                    aria-label="Buscar"
                >
                    🔍
                </button>

                <button
                    type="button"
                    class="mz-mobile-btn"
                    id="mz-mobile-open"
                    aria-label="Abrir menú"
                >
                    ☰
                </button>

            </div>

        `;

        header.insertBefore(mobileBar, header.firstChild);


        /* =====================================================
           CREAR MENÚ LATERAL
           ===================================================== */

        const menu = document.createElement("div");

        menu.id = "mz-mobile-menu";

        menu.innerHTML = `

            <div class="mz-mobile-backdrop"></div>

            <aside
                class="mz-mobile-drawer"
                role="dialog"
                aria-label="Menú MovieZone"
            >

                <div class="mz-mobile-drawer-head">

                    <div class="mz-mobile-title">
                        Movie<span>Zone</span>
                    </div>

                    <button
                        type="button"
                        class="mz-mobile-btn"
                        id="mz-mobile-close"
                        aria-label="Cerrar menú"
                    >
                        ✕
                    </button>

                </div>


                <button
                    type="button"
                    class="mz-mobile-item"
                    data-target="#nav-item-home"
                >
                    <span class="mz-icon">🏠</span>
                    <span>Inicio</span>
                </button>


                <button
                    type="button"
                    class="mz-mobile-item"
                    data-target="#nav-item-movies"
                >
                    <span class="mz-icon">🎬</span>
                    <span>Películas</span>
                </button>


                <button
                    type="button"
                    class="mz-mobile-item"
                    data-target="#nav-item-series"
                >
                    <span class="mz-icon">📺</span>
                    <span>Series</span>
                </button>


                <button
                    type="button"
                    class="mz-mobile-item"
                    data-target="#nav-item-anime"
                >
                    <span class="mz-icon">✦</span>
                    <span>Anime</span>
                </button>


                <button
                    type="button"
                    class="mz-mobile-item"
                    data-target="#nav-item-favoritos"
                >
                    <span class="mz-icon">❤️</span>
                    <span>Favoritos</span>
                </button>


                <button
                    type="button"
                    class="mz-mobile-item"
                    id="mz-mobile-search-item"
                >
                    <span class="mz-icon">🔍</span>
                    <span>Buscar</span>
                </button>

            </aside>

        `;

        document.body.appendChild(menu);


        /* =====================================================
           FUNCIONES
           ===================================================== */

        function abrirMenu() {

            menu.classList.add("open");

            document.body.style.overflow = "hidden";
        }


        function cerrarMenu() {

            menu.classList.remove("open");

            document.body.style.overflow = "";
        }


        function ejecutarNavegacion(selector) {

            const elemento = document.querySelector(selector);

            if (!elemento) {

                console.warn(
                    "MovieZone: no se encontró:",
                    selector
                );

                return false;
            }

            elemento.click();

            return true;
        }


        /* =====================================================
           BUSCADOR
           ===================================================== */

        function abrirBuscador() {

            cerrarMenu();

            const input = document.querySelector(
                "#search-input, " +
                "input[name='search'], " +
                ".search-form input, " +
                ".search-input"
            );


            if (input) {

                input.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

                setTimeout(function () {

                    input.focus();

                }, 250);

                return;
            }


            const form = document.querySelector(
                "#search-form, " +
                ".search-form, " +
                "form.search-form"
            );


            if (form) {

                form.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

            }

        }


        /* =====================================================
           EVENTOS
           ===================================================== */

        const openButton =
            document.getElementById("mz-mobile-open");

        const closeButton =
            document.getElementById("mz-mobile-close");

        const searchButton =
            document.getElementById("mz-mobile-search");

        const searchMenuButton =
            document.getElementById("mz-mobile-search-item");

        const backdrop =
            menu.querySelector(".mz-mobile-backdrop");


        if (openButton) {

            openButton.addEventListener(
                "click",
                abrirMenu
            );

        }


        if (closeButton) {

            closeButton.addEventListener(
                "click",
                cerrarMenu
            );

        }


        if (backdrop) {

            backdrop.addEventListener(
                "click",
                cerrarMenu
            );

        }


        if (searchButton) {

            searchButton.addEventListener(
                "click",
                abrirBuscador
            );

        }


        if (searchMenuButton) {

            searchMenuButton.addEventListener(
                "click",
                abrirBuscador
            );

        }


        /* =====================================================
           NAVEGACIÓN DEL MENÚ
           ===================================================== */

        const menuItems =
            menu.querySelectorAll(
                ".mz-mobile-item[data-target]"
            );


        menuItems.forEach(function (button) {

            button.addEventListener(
                "click",
                function () {

                    const target =
                        button.getAttribute(
                            "data-target"
                        );


                    if (
                        ejecutarNavegacion(
                            target
                        )
                    ) {

                        cerrarMenu();

                    }

                }
            );

        });


        /* =====================================================
           ESCAPE
           ===================================================== */

        document.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key === "Escape" &&
                    menu.classList.contains("open")
                ) {

                    cerrarMenu();

                }

            }
        );


        /* =====================================================
           BOTÓN ATRÁS EN MÓVIL
           ===================================================== */

        window.addEventListener(
            "popstate",
            function () {

                cerrarMenu();

            }
        );


        console.log(
            "MovieZone: menú móvil cargado correctamente."
        );

    }


    /* =========================================================
       INICIAR
       ========================================================= */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            iniciarMenuMovil
        );

    } else {

        iniciarMenuMovil();

    }

})();
