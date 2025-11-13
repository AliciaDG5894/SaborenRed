function activeMenuOption(href) {
    $("#appMenu .nav-link")
    .removeClass("active")
    .removeAttr('aria-current')

    $(`[href="${(href ? href : "#/")}"]`)
    .addClass("active")
    .attr("aria-current", "page")
}

function disableAll() {
    const elements = document.querySelectorAll(".while-waiting")
    elements.forEach(function (el, index) {
        el.setAttribute("disabled", "true")
        el.classList.add("disabled")
    })
}

function enableAll() {
    const elements = document.querySelectorAll(".while-waiting")
    elements.forEach(function (el, index) {
        el.removeAttribute("disabled")
        el.classList.remove("disabled")
    })
}

function debounce(fun, delay) {
    let timer
    return function (...args) {
        clearTimeout(timer)
        timer = setTimeout(function () {
            fun.apply(this, args)
        }, delay)
    }
}

const configFechaHora = {
    locale: "es",
    weekNumbers: true,
    // enableTime: true,
    minuteIncrement: 15,
    altInput: true,
    altFormat: "d/F/Y",
    dateFormat: "Y-m-d",
    // time_24hr: false
}

const DateTime = luxon.DateTime
let lxFechaHora
let diffMs = 0

const app = angular.module("angularjsApp", ["ngRoute"])
app.config(function ($routeProvider, $locationProvider) {
    $locationProvider.hashPrefix("")

    $routeProvider
    .when("/", {
        templateUrl: "/login",
        controller: "loginCtrl"
    })
    .when("/recetas", {
        templateUrl: "/recetas",
        controller: "recetasCtrl"
    })
    .otherwise({
        redirectTo: "/"
    })
})

app.service("SessionService", function() {
    this.tipo = null
    this.usr  = null     // nombre de usuario
    this.id   = null     // Id_Usuario numérico

    this.setTipo = function (tipo) { this.tipo = tipo }
    this.getTipo = function () { return this.tipo }

    this.setUsr = function (usr) { this.usr = usr }     // nombre
    this.getUsr = function () { return this.usr }

    this.setId = function (id) { this.id = id }        // ID numérico
    this.getId = function () { return this.id }

    console.log("SessionService cargado")
})

app.factory("CategoriaFactory", function () {
    function Categoria(titulo, recetas){
        this.titulo  = titulo
        this.recetas  = recetas
    }
    Categoria.prototype.getInfo = function () {
        return {
            titulo: this.titulo,
            recetas: this.recetas
        }
    }
    return {
        create: function (titulo, recetas) {
            return new Categoria(titulo, recetas)
        }
    }
})

app.service("MensajesService", function() {
    this.modal = modal
})

app.service("RecetaAPI", function($q) {
    this.obtenerRecetasConFavoritos = function(idUsuario) {
        var deferred = $q.defer()
        $.get(`/recetas/${idUsuario}`)
        .done(function(data){
            deferred.resolve(data)
        })
        .fail(function(error){
            deferred.reject(error)
        })
        return deferred.promise
    }
})

app.factory("RecetaFacade", function(RecetaAPI, $q) {
    return {
        obtenerRecetasUsuario: function(idUsuario) {
            return RecetaAPI.obtenerRecetasConFavoritos(idUsuario)
        }
    }
})

// RecetaBuilder.js
app.service("RecetaBuilder", function() {
    let receta = {};

    this.reset = function() {
        receta = {};
        return this;
    };
    
    this.setNombre = function(nombre) {
        receta.Nombre = nombre;
        return this;
    };

    this.setDescripcion = function(descripcion) {
        receta.Descripcion = descripcion;
        return this;
    };

    this.setIngredientes = function(ingredientes) {
        receta.Ingredientes = ingredientes;
        return this;
    };

    this.setUtensilios = function(utensilios) {
        receta.Utensilio = utensilios;
        return this;
    };

    this.setInstrucciones = function(instrucciones) {
        receta.Instrucciones = instrucciones;
        return this;
    };

    this.setNutrientes = function(nutrientes) {
        receta.Nutrientes  = nutrientes ;
        return this;
    };

    this.setCategorias = function(categorias) {
        receta.Categorias = categorias;
        return this;
    };

    this.build = function() {
        return angular.copy(receta); // devuelve un clon del objeto receta final
    };
});


app.run(["$rootScope", "$location", "$timeout", "SessionService", function($rootScope, $location, $timeout, SessionService) {
    $rootScope.slide             = ""
    $rootScope.spinnerGrow       = false
    $rootScope.sendingRequest    = false
    $rootScope.incompleteRequest = false
    $rootScope.completeRequest   = false
    $rootScope.login             = localStorage.getItem("login")
    const defaultRouteAuth       = "#recetas"
    let timesChangesSuccessRoute = 0


    function actualizarFechaHora() {
        lxFechaHora = DateTime.now().plus({
            milliseconds: diffMs
        })

        $rootScope.angularjsHora = lxFechaHora.setLocale("es").toFormat("hh:mm:ss a")
        $timeout(actualizarFechaHora, 500)
    }
    actualizarFechaHora()


    let preferencias = localStorage.getItem("preferencias")
    try {
        preferencias = (preferencias ? JSON.parse(preferencias) :  {})
    }
    catch (error) {
        preferencias = {}
    }
    $rootScope.preferencias = preferencias
    
    if (preferencias.tipo)  SessionService.setTipo(preferencias.tipo)
    if (preferencias.usr)   SessionService.setUsr(preferencias.usr)

    const storedId = localStorage.getItem("Id_Usuario")
    if (storedId) {
        SessionService.setId(storedId)
        console.log("SessionService Id cargado desde localStorage:", storedId)
    }
    


    $rootScope.$on("$routeChangeSuccess", function (event, current, previous) {
        $rootScope.spinnerGrow = false
        const path             = current.$$route.originalPath


        // AJAX Setup
        $.ajaxSetup({
            beforeSend: function (xhr) {
                // $rootScope.sendingRequest = true
            },
            headers: {
                Authorization: `Bearer ${localStorage.getItem("JWT")}`
            },
            error: function (error) {
                $rootScope.sendingRequest    = false
                $rootScope.incompleteRequest = false
                $rootScope.completeRequest   = true

                const status = error.status
                enableAll()

                if (status) {
                    const respuesta = error.responseText
                    console.log("error", respuesta)

                    if (status == 401) {
                        cerrarSesion()
                        return
                    }

                    modal(respuesta, "Error", [
                        {html: "Aceptar", class: "btn btn-lg btn-secondary", defaultButton: true, dismiss: true}
                    ])
                }
                else {
                    toast("Error en la petici&oacute;n.")
                    $rootScope.sendingRequest    = false
                    $rootScope.incompleteRequest = true
                    $rootScope.completeRequest   = false
                }
            },
            statusCode: {
                200: function (respuesta) {
                    $rootScope.sendingRequest    = false
                    $rootScope.incompleteRequest = false
                    $rootScope.completeRequest   = true
                },
                401: function (respuesta) {
                    cerrarSesion()
                },
            }
        })

        // solo hacer si se carga una ruta existente que no sea el splash
        if (path.indexOf("splash") == -1) {
            // validar login
            function validarRedireccionamiento() {
                const login = localStorage.getItem("login")

                if (login) {
                    if (path == "/") {
                        window.location = defaultRouteAuth
                        return
                    }

                    $(".btn-cerrar-sesion").click(function (event) {
                        $.post("cerrarSesion")
                        $timeout(function () {
                            cerrarSesion()
                        }, 500)
                    })
                }
                else if ((path != "/")
                    &&  (path.indexOf("emailToken") == -1)
                    &&  (path.indexOf("resetPassToken") == -1)) {
                    window.location = "#/"
                }
            }
            function cerrarSesion() {
                localStorage.removeItem("JWT")
                localStorage.removeItem("login")
                localStorage.removeItem("preferencias")

                const login      = localStorage.getItem("login")
                let preferencias = localStorage.getItem("preferencias")

                try {
                    preferencias = (preferencias ? JSON.parse(preferencias) :  {})
                }
                catch (error) {
                    preferencias = {}
                }

                $rootScope.redireccionar(login, preferencias)
            }
            $rootScope.redireccionar = function (login, preferencias) {
                $rootScope.login        = login
                $rootScope.preferencias = preferencias

                validarRedireccionamiento()
            }
            validarRedireccionamiento()


            // animate.css
            const active = $("#appMenu .nav-link.active").parent().index()
            const click  = $(`[href^="#${path}"]`).parent().index()

            if ((active <= 0)
            ||  (click  <= 0)
            ||  (active == click)) {
                $rootScope.slide = "animate__animated animate__faster animate__bounceIn"
            }
            else if (active != click) {
                $rootScope.slide  = "animate__animated animate__faster animate__slideIn"
                $rootScope.slide += ((active > click) ? "Left" : "Right")
            }


            // swipe
            if (path.indexOf("recetas") != -1) {
                $rootScope.leftView      = ""
                $rootScope.rightView     = "recetas"
                $rootScope.leftViewLink  = ""
                $rootScope.rightViewLink = "#/recetas"
            }
            // else if (path.indexOf("clientes") != -1) {
            //     $rootScope.leftView      = "rentas"
            //     $rootScope.rightView     = "trajes"
            //     $rootScope.leftViewLink  = "#/rentas"
            //     $rootScope.rightViewLink = "#/trajes"
            // }
            // else if (path.indexOf("ventas") != -1) {
            //     $rootScope.leftView      = "clientes"
            //     $rootScope.rightView     = ""
            //     $rootScope.leftViewLink  = "#/clientes"
            //     $rootScope.rightViewLink = ""
            // }
            else {
                $rootScope.leftView      = ""
                $rootScope.rightView     = ""
                $rootScope.leftViewLink  = ""
                $rootScope.rightViewLink = ""
            }

            let offsetX
            let threshold
            let startX = 0
            let startY = 0
            let currentX = 0
            let isDragging = false
            let isScrolling = false
            let moved = false
            let minDrag = 5

            function resetDrag() {
                offsetX = -window.innerWidth
                threshold = window.innerWidth / 4
                $("#appSwipeWrapper").get(0).style.transition = "transform 0s ease"
                $("#appSwipeWrapper").get(0).style.transform = `translateX(${offsetX}px)`
            }
            function startDrag(event) {
                if (isScrolling && isPartiallyVisible($("#appContent").get(0))) {
                    resetDrag()
                }

                isDragging  = true
                moved       = false
                isScrolling = false

                startX = getX(event)
                startY = getY(event)

                $("#appSwipeWrapper").get(0).style.transition = "none"
                document.body.style.userSelect = "none"
            }
            function onDrag(event) {
                if (!isDragging
                ||  $(event.target).parents("table").length
                ||  $(event.target).parents("button").length
                ||  $(event.target).parents("span").length
                ||   (event.target.nodeName == "BUTTON")
                ||   (event.target.nodeName == "SPAN")
                || $(event.target).parents(".plotly-grafica").length
                || $(event.target).hasClass("plotly-grafica")) {
                    return
                }

                let x = getX(event)
                let y = getY(event)

                let deltaX = x - startX
                let deltaY = y - startY
                
                if (isScrolling) {
                    if (isPartiallyVisible($("#appContent").get(0))) {
                        resetDrag()
                    }
                    return
                }

                if (!moved) {
                    if (Math.abs(deltaY) > Math.abs(deltaX)) {
                        isScrolling = true
                        return
                    }
                }

                if (Math.abs(deltaX) > minDrag) {
                    moved = true
                }

                currentX = offsetX + deltaX
                $("#appSwipeWrapper").get(0).style.transform = `translateX(${currentX}px)`
                $("#appSwipeWrapper").get(0).style.cursor = "grabbing"

                event.preventDefault()
            }
            function isVisible(element) {
                const rect = element.getBoundingClientRect()
                return rect.left >= 0 && rect.right <= window.innerWidth
            }
            function isPartiallyVisible(element) {
                const rect = element.getBoundingClientRect()
                return rect.right > 0 && rect.left < window.innerWidth
            }
            function endDrag() {
                if (!isDragging) {
                    return
                }
                $("#appSwipeWrapper").get(0).style.cursor = "grab"
                isDragging = false
                document.body.style.userSelect = ""
                if (isScrolling) {
                    if (isPartiallyVisible($("#appContent").get(0))) {
                        resetDrag()
                    }
                    return
                }

                if (!moved) {
                    $("#appSwipeWrapper").get(0).style.transition = "transform 0.3s ease"
                    $("#appSwipeWrapper").get(0).style.transform = `translateX(${offsetX}px)`
                    return
                }

                let delta = currentX - offsetX
                let finalX = offsetX

                let href, visible

                if (delta > threshold && offsetX < 0) {
                    finalX = offsetX + window.innerWidth
                    $("#appContentLeft").css("visibility", "visible")
                    $("#appContentRight").css("visibility", "hidden")
                    href = $("#appContentLeft").children("div").eq(0).attr("data-href")
                    visible = isPartiallyVisible($("#appContentLeft").get(0))
                } else if (delta < -threshold && offsetX > -2 * window.innerWidth) {
                    finalX = offsetX - window.innerWidth
                    $("#appContentLeft").css("visibility", "hidden")
                    $("#appContentRight").css("visibility", "visible")
                    href = $("#appContentRight").children("div").eq(0).attr("data-href")
                    visible = isPartiallyVisible($("#appContentRight").get(0))
                }

                if (href && visible) {
                    resetDrag()
                    $timeout(function () {
                        window.location = href
                    }, 100)
                } else if (!href) {
                    resetDrag()
                    return
                }

                $("#appSwipeWrapper").get(0).style.transition = "transform 0.3s ease"
                $("#appSwipeWrapper").get(0).style.transform = `translateX(${finalX}px)`
                offsetX = finalX
            }
            function getX(event) {
                return event.touches ? event.touches[0].clientX : event.clientX
            }
            function getY(event) {
                return event.touches ? event.touches[0].clientY : event.clientY
            }
            function completeScreen() {
                $(".div-to-complete-screen").css("height", 0)
                const altoHtml    = document.documentElement.getBoundingClientRect().height
                const altoVisible = document.documentElement.clientHeight
                $(".div-to-complete-screen").css("height", ((altoHtml < altoVisible)
                ? (altoVisible - altoHtml)
                : 0) + (16 * 4))
            }

            $(document).off("mousedown touchstart mousemove touchmove click", "#appSwipeWrapper")

            $(document).on("mousedown",  "#appSwipeWrapper", startDrag)
            $(document).on("touchstart", "#appSwipeWrapper", startDrag)
            $(document).on("mousemove",  "#appSwipeWrapper", onDrag)
            // $(document).on("touchmove",  "#appSwipeWrapper", onDrag)
            document.querySelector("#appSwipeWrapper").addEventListener("touchmove", onDrag, {
                passive: false
            })
            $(document).on("mouseup",    "#appSwipeWrapper", endDrag)
            $(document).on("mouseleave", "#appSwipeWrapper", endDrag)
            $(document).on("touchend",   "#appSwipeWrapper", endDrag)
            $(document).on("click",      "#appSwipeWrapper", function (event) {
                if (moved) {
                    event.stopImmediatePropagation()
                    event.preventDefault()
                    return false
                }
            })
            $(window).on("resize", function (event) {
                resetDrag()
                completeScreen()
            })

            resetDrag()


            // solo hacer una vez cargada la animación
            $timeout(function () {
                // animate.css
                $rootScope.slide = ""


                // swipe
                completeScreen()


                // solo hacer al cargar la página por primera vez
                if (timesChangesSuccessRoute == 0) {
                    timesChangesSuccessRoute++
                    

                    // JQuery Validate
                    $.extend($.validator.messages, {
                        required: "Llena este campo",
                        number: "Solo números",
                        digits: "Solo números enteros",
                        min: $.validator.format("No valores menores a {0}"),
                        max: $.validator.format("No valores mayores a {0}"),
                        minlength: $.validator.format("Mínimo {0} caracteres"),
                        maxlength: $.validator.format("Máximo {0} caracteres"),
                        rangelength: $.validator.format("Solo {0} caracteres"),
                        equalTo: "El texto de este campo no coincide con el anterior",
                        date: "Ingresa fechas validas",
                        email: "Ingresa un correo electrónico valido"
                    })


                    // gets
                    const startTimeRequest = Date.now()
                    $.get("fechaHora", function (fechaHora) {
                        const endTimeRequest = Date.now()
                        const rtt            = endTimeRequest - startTimeRequest
                        const delay          = rtt / 2

                        const lxFechaHoraServidor = DateTime.fromFormat(fechaHora, "yyyy-MM-dd hh:mm:ss")
                        // const fecha = lxFechaHoraServidor.toFormat("dd/MM/yyyy hh:mm:ss")
                        const lxLocal = luxon.DateTime.fromMillis(endTimeRequest - delay)

                        diffMs = lxFechaHoraServidor.toMillis() - lxLocal.toMillis()
                    })

                    $.get("preferencias", {
                        token: localStorage.getItem("fbt")
                    }, function (respuesta) {
                        if (typeof respuesta != "object") {
                            return
                        }

                        console.log("✅ Respuesta recibida:", respuesta)

                        const login      = "1"
                        let preferencias = respuesta

                        localStorage.setItem("login", login)
                        localStorage.setItem("preferencias", JSON.stringify(preferencias))
                        $rootScope.redireccionar(login, preferencias)
                    })


                    // events
                    $(document).on("click", ".toggle-password", function (event) {
                        const prev = $(this).parent().find("input")

                        if (prev.prop("disabled")) {
                            return
                        }

                        prev.focus()

                        if ("selectionStart" in prev.get(0)){
                            $timeout(function () {
                                prev.get(0).selectionStart = prev.val().length
                                prev.get(0).selectionEnd   = prev.val().length
                            }, 0)
                        }

                        if (prev.attr("type") == "password") {
                            $(this).children().first()
                            .removeClass("bi-eye")
                            .addClass("bi-eye-slash")
                            prev.attr({
                                "type": "text",
                                "autocomplete": "off",
                                "data-autocomplete": prev.attr("autocomplete")
                            })
                            return
                        }

                        $(this).children().first()
                        .addClass("bi-eye")
                        .removeClass("bi-eye-slash")
                        prev.attr({
                            "type": "password",
                            "autocomplete": prev.attr("data-autocomplete")
                        })
                    })
                }
            }, 500)

            activeMenuOption(`#${path}`)
        }
    })
}])

app.controller("loginCtrl", function ($scope, $http, $rootScope, SessionService) {
    $("#frmInicioSesion").submit(function (event) {
        event.preventDefault()

        pop(".div-inicio-sesion", 'ℹ️Iniciando sesi&oacute;n, espere un momento...', "primary")

        $.post("iniciarSesion", $(this).serialize(), function (respuesta) {
            enableAll()

        if (respuesta.length) {
            localStorage.setItem("login", "1")
            localStorage.setItem("preferencias", JSON.stringify(respuesta[0]))
            localStorage.setItem("Id_Usuario", respuesta[0].Id_Usuario) 
            
        
            // guardar nombre para las funciones que lo usan
            SessionService.setUsr(respuesta[0].Nombre_Usuario || "Desconocido")
            SessionService.setTipo(respuesta[0].Tipo_Usuario || "Sin tipo")
            SessionService.setId(respuesta[0].Id_Usuario)
        
            $("#frmInicioSesion").get(0).reset()
            location.reload()
            return
        }

            pop(".div-inicio-sesion", "Usuario y/o contrase&ntilde;a incorrecto(s)", "danger")
        })

        disableAll()
    })
})

app.config(function ($routeProvider, $locationProvider, $provide) {
    $provide.decorator("MensajesService", function ($delegate, $log) {
        const originalModal = $delegate.modal

        $delegate.modal = function (msg) { 
            originalModal(msg, "Mensaje", [
                {"html": "Aceptar", "class": "btn btn-lg btn-secondary", default: true, dismiss: true}
            ])
        }
        return $delegate
    })
})

app.controller("recetasCtrl", function ($scope, $http, SessionService, CategoriaFactory, MensajesService, RecetaFacade, RecetaBuilder) {
    function buscarRecetas() {
        $.get("/recetasTbody", function (trsHTML) {
            $("#recetasTbody").html(trsHTML)
        })
    }
    
    buscarRecetas();

    $scope.$watch("busqueda", function(newVal, oldVal) {
        if (newVal != oldVal) {
            $.get("log", {
                actividad: "Busqueda de recetas 🔍",
                descripcion: `Se realizo la busqueda de una receta "${newVal}"`
            })
        }
    })
    
    $scope.SessionService = SessionService
    $scope.nuevaReceta = null;
    
    $scope.mostrarUsuario = function () {
        console.log("Usuario actual:", SessionService.getUsr())
    }

    const Id_Usuario = SessionService.getId() || localStorage.getItem("Id_Usuario");

    RecetaFacade.obtenerRecetasUsuario(Id_Usuario).then(function(recetas) { 
        const tbody = $("#recetasTbody"); 
        tbody.empty(); 
    
        recetas.forEach(receta => { 
            const fila = `
                <tr> 
                    <td>${receta.IdReceta}</td> 
                    <td>${receta.Nombre}</td> 
                    <td>${receta.Descripcion}</td> 
                    <td>${receta.Ingredientes}</td> 
                    <td>${receta.Utensilios}</td> 
                    <td>${receta.Instrucciones}</td> 
                    <td>${receta.Nutrientes}</td> 
                    <td>${receta.Categorias}</td> 
                    <td> 
                        <button class="btn btn-sm btn-info btn-facade" data-id="${receta.IdReceta}">Ver Facade</button> 
                        <button class="btn btn-sm btn-danger btn-eliminar" data-id="{{ receta.IdReceta}}">Eliminar</button> 
                    </td> 
                </tr>
            `; 
            tbody.append(fila); 
        }); 
    
        $(".btn-facade").click(function() { 
            const recetaId = $(this).data("id"); 
            RecetaFacade.obtenerRecetasUsuario(Id_Usuario).then(function(recetas) { 
                const receta = recetas.find(r => r.IdReceta == recetaId); 
                if (receta) { 
                    alert(`Receta: ${receta.Nombre}\nIngredientes: ${receta.Ingredientes}\nComentario: ${receta.Comentario || "Sin comentarios"}\nCalificación: ${receta.Calificacion || "Sin calificación"}`); 
                } 
            }); 
        }); 
    });

    // factory
    $.get("recetas/categorias", {
        categoria: "Rapida"
    }, function (rapida) {
        const categoriaRapida = CategoriaFactory.create("Rapida", rapida)
        console.log("Comida rapida FACTORY", categoriaRapida.getInfo())
        $scope.categoriaRapida = categoriaRapida

    })

    $.get("recetas/categorias", {
        categoria: "Desayunos"
    }, function (desayunos) {
        const categoriaDesayunos = CategoriaFactory.create("Desayunos", desayunos)
        console.log("Comida desayunos FACTORY", categoriaDesayunos.getInfo())
        $scope.categoriaDesayunos = categoriaDesayunos

    })
    
    $scope.crearReceta = function() {
        $scope.nuevaReceta = RecetaBuilder.reset()
            .setNombre($scope.nombre)
            .setDescripcion($scope.descripcion)
            .setIngredientes($scope.ingredientes)
            .setUtensilios($scope.utensilios)
            .setInstrucciones($scope.instrucciones)
            .setNutrientes($scope.nutrientes)
            .setCategorias($scope.categorias)
            .build();
    
        console.log("Receta construida con Builder:", $scope.nuevaReceta);
    
        // Aquí sigue tu post al backend si quieres
        $.post("/recetas", {
            IdReceta: $("#idReceta").val(),
            Nombre: $("#txtNombre").val(),
            Descripcion: $("#txtDescripcion").val(),
            Ingredientes: $("#txtIngredientes").val(),
            Utensilios: $("#txtUtensilios").val(),
            Instrucciones: $("#txtInstrucciones").val(),
            Nutrientes: $("#txtNutrientes").val(),
            Categorias: $("#txtCategoria").val()
        }, function(response){
            MensajesService.modal("Haz guardado una receta.")
            $("#frmRecetas")[0].reset();
            $("#idReceta").val("");
            buscarRecetas(); 
        }).fail(function(xhr){
            console.error("Error al guardar/actualizar receta:", xhr.responseText);
        });
    };

    
    // Pusher
    Pusher.logToConsole = true;
    var pusher = new Pusher('b51b00ad61c8006b2e6f', {
      cluster: 'us2'
    });
    var channel = pusher.subscribe("canalRecetas")
    channel.bind("eventoRecetas", function(data) {
        buscarRecetas()
    });

    $(document).on("click", "#btnBuscarReceta", function() {
        const busqueda = $("#txtBuscarReceta").val().trim();

        if(busqueda === "") {
            buscarRecetas();
            return;
        }

        $.get("/recetas/buscar", { busqueda: busqueda }, function(registros) {
            let trsHTML = "";
            registros.forEach(receta => {
                trsHTML += `
                    <tr>
                        <td>${receta.IdReceta}</td>
                        <td>${receta.Nombre}</td>
                        <td>${receta.Descripcion}</td>
                        <td>${receta.Ingredientes}</td>
                        <td>${receta.Utensilios}</td>
                        <td>${receta.Instrucciones}</td>
                        <td>${receta.Nutrientes}</td>
                        <td>${receta.Categorias}</td>
                        <td>
                            <button class="btn btn-sm btn-danger btn-eliminar" data-id="{{ receta.IdReceta}}">Eliminar</button>
                        </td>
                    </tr>
                    
                `;
            });
            $("#recetasTbody").html(trsHTML);
        }).fail(function(xhr){
            console.error("Error al buscar recetas:", xhr.responseText);
        });
    });

    // Permitir Enter en input
    $("#txtBuscarReceta").on("keypress", function(e) {
        if(e.which === 13) {
            $("#btnBuscarReceta").click();
        }
    });

    $(document).on("submit", "#frmRecetas", function (event) {
        event.preventDefault();

        const idRenta = $("#IdReceta").val(); 

        $.post("/recetas", {
            IdReceta: $("#idReceta").val(),
            Nombre: $("#txtNombre").val(),
            Descripcion: $("#txtDescripcion").val(),
            Ingredientes: $("#txtIngredientes").val(),
            Utensilios: $("#txtUtensilios").val(),
            Instrucciones: $("#txtInstrucciones").val(),
            Nutrientes: $("#txtNutrientes").val(),
            Categorias: $("#txtCategoria").val()

        }, function(response){
            MensajesService.modal("Haz guardado una receta.")
            
            console.log("Receta guardada o actualizada correctamente");
            $("#frmRecetas")[0].reset();
            $("#idReceta").val("");
            buscarRecetas(); 
        }).fail(function(xhr){
            console.error("Error al guardar/actualizar receta:", xhr.responseText);
        });

    });

    $(document).on("click", "#recetasTbody .btn-eliminar", function(){
        const id = $(this).data("id");
        if(confirm("¿Deseas eliminar esta receta?")) {
            $.post("/recetas/eliminar", {id: id}, function(response){
                console.log("Receta eliminado correctamente");
                buscarRecetas(); 
            }).fail(function(xhr){
                console.error("Error al eliminar receta:", xhr.responseText);
            });
        }
    });
        
    // $(document).on("click", "#recetasTbody .btn-editar", function() {
    //     const id = $(this).data("id");
    //     const clienteId = $(this).data("clienteId");
    //     const trajeId = $(this).data("trajeId");
    //     const descripcion = $(this).data("descripcion");
    //     const fechaHoraInicio = $(this).data("fechahorainicio");
    //     const fechaHoraFin = $(this).data("fechahorafin");

    //     $("#idRenta").val(id);
    //     $("#txtIdCliente").val(clienteId); 
    //     $("#txtIdTraje").val(trajeId); 
    //     $("#txtDescripcion").val(descripcion);
    //     $("#txtFechaInicio").val(fechaHoraInicio);
    //     $("#txttxtFechaFin").val(fechaHoraFin);

    //     const btnGuardar = $("#btnGuardar");
    //     btnGuardar.text("Actualizar");
    //     btnGuardar.removeClass("btn-primary").addClass("btn-success");
    // });

    
});

document.addEventListener("DOMContentLoaded", function (event) {
    activeMenuOption(location.hash)
})
