# python.exe -m venv .venv
# cd .venv/Scripts
# activate.bat
# py -m ensurepip --upgrade
# pip install -r requirements.txt

from functools import wraps
from flask import Flask, render_template, request, jsonify, make_response, session

from flask_cors import CORS, cross_origin

import datetime
import os
import traceback

import mysql.connector
import mysql.connector.pooling
import pusher
import pytz
from werkzeug.utils import secure_filename

app            = Flask(__name__)
app.secret_key = "Test12345"
CORS(app)


def _create_connection():
    return mysql.connector.connect(
        host="185.232.14.52",
        database="u760464709_23005256_bd",
        user="u760464709_23005256_usr",
        password="~6ru!MMJZzX",
    )


try:
    con = _create_connection()
except mysql.connector.Error:
    # La app sigue funcionando aunque la base de datos no esté disponible
    con = None
"""
con_pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_name="my_pool",
    pool_size=5,
    host="localhost",
    database="practicas",
    user="root",
    password="Test12345"
)
"""

def pusherRecetas():
    import pusher
    
    pusher_client = pusher.Pusher(
    app_id="2046017",
    key="b51b00ad61c8006b2e6f",
    secret="d2ec35aa5498a18af7bf",
    cluster="us2",
    ssl=True
    )
    
    pusher_client.trigger("canalRecetas", "eventoRecetas", {"message": "Hola Mundo!"})
    return make_response(jsonify({}))

def login(fun):
    @wraps(fun)
    def decorador(*args, **kwargs):
        if not session.get("login"):
            return jsonify({
                "estado": "error",
                "respuesta": "No has iniciado sesión"
            }), 401
        return fun(*args, **kwargs)
    return decorador

# preferencias admin
def admin(fun):
    @wraps(fun)
    def decorador(*args, **kwargs):
        if not session.get("login"):
            return jsonify({
                "estado": "error",
                "respuesta": "No has iniciado sesión"
            }), 401

        # 1 = admin, 2 = usuario normal
        if session.get("login-tipo") != 1:
            return jsonify({
                "estado": "error",
                "respuesta": "No tienes permisos para esta acción"
            }), 403

        # si pasó las validaciones, deja pasar a la vista original
        return fun(*args, **kwargs)

    return decorador

def get_connection():
    """Garantiza una conexión activa a la base de datos.

    Si la conexión global no existe o se ha cerrado, se intenta crear una
    nueva. Cualquier error se propaga para que lo capture el manejador
    global y devuelva un 500 controlado.
    """
    global con

    if con is None or not con.is_connected():
        con = _create_connection()

    return con


@app.errorhandler(Exception)
def handle_exception(e):
    print("❌ ERROR DETECTADO EN FLASK ❌")
    traceback.print_exc()
    return make_response(jsonify({"error": str(e)}), 500)

@app.route("/")
def index():
    # Fuerza la inicialización de la conexión para detectar problemas temprano,
    # pero no la cerramos para evitar que el resto de rutas se queden sin BD.
    try:
        get_connection()
    except mysql.connector.Error:
        pass

    return render_template("index.html")

# @app.route("/")
# def landingPage():
    
#     return render_template("landing-page.html")

# @app.route("/dashboard")
# def dashboard():
    
#     return render_template("dashboard.html")

@app.route("/login")
def appLogin():
    
    return render_template("login.html")
    # return "<h5>Hola, soy la view app</h5>"

@app.route("/fechaHora")
def fechaHora():
    tz    = pytz.timezone("America/Matamoros")
    ahora = datetime.datetime.now(tz)
    return ahora.strftime("%Y-%m-%d %H:%M:%S")

@app.route("/iniciarSesion", methods=["POST"])
# Usar cuando solo se quiera usar CORS en rutas específicas
# @cross_origin()
def iniciarSesion():
    try:
        con = get_connection()
    except mysql.connector.Error as error:
        return make_response(jsonify({
            "estado": "error",
            "respuesta": f"Error al conectar a la base de datos: {error}",
        }), 500)
    usuario    = request.form["usuario"]
    contrasena = request.form["contrasena"]

    cursor = con.cursor(dictionary=True)
    sql    = """
    SELECT Id_Usuario, Nombre_Usuario, Tipo_Usuario
    FROM usuarios
    WHERE Nombre_Usuario = %s
    AND Contrasena = %s
    """
    val    = (usuario, contrasena)

    cursor.execute(sql, val)
    registros = cursor.fetchall()
    if cursor:
        cursor.close()
    if con and con.is_connected():
        con.close()

    session["login"]      = False
    session["login-usr"]  = None
    session["login-tipo"] = 0
    if registros:
        usuario = registros[0]
        session["login"]      = True
        session["login-usr"]  = usuario["Nombre_Usuario"]
        session["login-tipo"] = usuario["Tipo_Usuario"]
        session["login-id"]   = usuario["Id_Usuario"]

    return make_response(jsonify(registros))

@app.route("/cerrarSesion", methods=["POST"])
@login
def cerrarSesion():
    session["login"]      = False
    session["login-usr"]  = None
    session["login-tipo"] = 0
    return make_response(jsonify({}))

@app.route("/preferencias")
@login
def preferencias():
    return make_response(jsonify({
        "usr": session.get("login-usr"),
        "tipo": session.get("login-tipo", 2)
    }))

@app.route("/log", methods=["GET"])
def logRecetas():
    args         = request.args
    actividad    = args.get("actividad")
    descripcion  = args.get("descripcion")
    tz           = pytz.timezone("America/Matamoros")
    ahora        = datetime.datetime.now(tz)
    fechaHoraStr = ahora.strftime("%Y-%m-%d %H:%M:%S")

    if actividad and descripcion:
        with open("log-busquedas.txt", "a", encoding="utf-8") as f:
            f.write(f"{actividad}\t{descripcion}\t{fechaHoraStr}\n")
    try:
        with open("log-busquedas.txt", encoding="utf-8") as f:
            log = f.read()
    except FileNotFoundError:
        log = ""

    return log


@app.route("/recetas")
@login
def recetas():
    return render_template("Recetas.html")

@app.route("/recetas/guardar", methods=["POST"])
@login
def guardarReceta():
    try:
        con = get_connection()
    except mysql.connector.Error as error:
        return make_response(jsonify({
            "estado": "error",
            "respuesta": f"Error al conectar a la base de datos: {error}",
        }), 500)

    IdReceta      = request.form.get("IdReceta")
    Nombre        = request.form.get("Nombre")
    Descripcion   = request.form.get("Descripcion")
    Ingredientes  = request.form.get("Ingredientes")
    Utensilios    = request.form.get("Utensilios")
    Instrucciones = request.form.get("Instrucciones")
    Nutrientes    = request.form.get("Nutrientes")
    Categorias    = request.form.get("Categorias")

    # Texto opcional (por si luego usas un input de texto Imagen)
    Imagen_form = request.form.get("Imagen")

    # Archivo subido desde el input type="file" name="fileImagen"
    file = request.files.get("fileImagen")

    # Valor por defecto de Imagen
    Imagen = Imagen_form  # puede ser None si no envías nada

    # Si viene archivo, lo guardamos y usamos esa ruta
    if file and file.filename:
        filename = secure_filename(file.filename)

        uploads_dir = os.path.join(app.root_path, "static", "uploads")
        os.makedirs(uploads_dir, exist_ok=True)

        file_path = os.path.join(uploads_dir, filename)
        file.save(file_path)

        # Ruta que se guardará en la BD (para usar directo en <img src="...">)
        Imagen = f"static/uploads/{filename}"
    
    cursor = con.cursor()

    try:
        if IdReceta:
            sql = """
            UPDATE Recetas
            SET Nombre        = %s,
                Descripcion   = %s,
                Ingredientes  = %s,
                Utensilios    = %s,
                Instrucciones = %s,
                Nutrientes    = %s,
                Categorias    = %s,
                Imagen        = %s
            WHERE IdReceta = %s
            """
            val = (
                Nombre,
                Descripcion,
                Ingredientes,
                Utensilios,
                Instrucciones,
                Nutrientes,
                Categorias,
                Imagen,
                IdReceta
            )
        else:
            sql = """
            INSERT INTO Recetas (
                IdReceta,
                Nombre,
                Descripcion,
                Ingredientes,
                Utensilios,
                Instrucciones,
                Nutrientes,
                Categorias,
                Imagen
            ) VALUES (
                %s,%s,%s,%s,%s,%s,%s,%s,%s
            )
            """
            val = (
                IdReceta,
                Nombre,
                Descripcion,
                Ingredientes,
                Utensilios,
                Instrucciones,
                Nutrientes,
                Categorias,
                Imagen
            )

        cursor.execute(sql, val)
        con.commit()
    finally:
        cursor.close()
        if con and con.is_connected():
            con.close()

    pusherRecetas()
    
    return make_response(jsonify({}))


# @app.route("/recetas", methods=["GET", "POST"])
# @login
# def recetas():
#     # Si es GET, solo devolver la vista HTML (para Angular)
#     if request.method == "GET":
#         return render_template("Recetas.html")

#     # Si es POST, guardar/actualizar la receta
#     if not con.is_connected():
#         con.reconnect()

#     IdReceta      = request.form.get("IdReceta")
#     Nombre        = request.form.get("Nombre")
#     Descripcion   = request.form.get("Descripcion")
#     Ingredientes  = request.form.get("Ingredientes")
#     Utensilios    = request.form.get("Utensilios")
#     Instrucciones = request.form.get("Instrucciones")
#     Nutrientes    = request.form.get("Nutrientes")
#     Categorias    = request.form.get("Categorias")

#     # Texto opcional (por si algún día usas un input de texto Imagen)
#     Imagen_form = request.form.get("Imagen")

#     # Archivo subido desde el input type="file" name="fileImagen"
#     file = request.files.get("fileImagen")

#     # Valor por defecto de Imagen
#     Imagen = Imagen_form  # puede ser None si no envías nada

#     # Si viene archivo, lo guardamos y usamos esa ruta
#     if file and file.filename:
#         filename = secure_filename(file.filename)

#         uploads_dir = os.path.join(app.root_path, "static", "uploads")
#         os.makedirs(uploads_dir, exist_ok=True)

#         file_path = os.path.join(uploads_dir, filename)
#         file.save(file_path)

#         # Ruta que se guardará en la BD (para usar directo en <img src="...">)
#         Imagen = f"static/uploads/{filename}"
    
#     cursor = con.cursor()

#     if IdReceta:
#         sql = """
#         UPDATE Recetas
#         SET Nombre        = %s,
#             Descripcion   = %s,
#             Ingredientes  = %s,
#             Utensilios    = %s,
#             Instrucciones = %s,
#             Nutrientes    = %s,
#             Categorias    = %s,
#             Imagen        = %s
#         WHERE IdReceta = %s
#         """
#         val = (
#             Nombre,
#             Descripcion,
#             Ingredientes,
#             Utensilios,
#             Instrucciones,
#             Nutrientes,
#             Categorias,
#             Imagen,
#             IdReceta
#         )
#     else:
#         sql = """
#         INSERT INTO Recetas (
#             IdReceta,
#             Nombre,
#             Descripcion,
#             Ingredientes,
#             Utensilios,
#             Instrucciones,
#             Nutrientes,
#             Categorias,
#             Imagen
#         ) VALUES (
#             %s,%s,%s,%s,%s,%s,%s,%s,%s
#         )
#         """
#         val = (
#             IdReceta,
#             Nombre,
#             Descripcion,
#             Ingredientes,
#             Utensilios,
#             Instrucciones,
#             Nutrientes,
#             Categorias,
#             Imagen
#         )
    
#     cursor.execute(sql, val)
#     con.commit()
#     con.close()

#     pusherRecetas()
    
#     return make_response(jsonify({}))


@app.route("/recetasTbody")
@login
def recetasTbody():
    try:
        con = get_connection()
    except mysql.connector.Error as error:
        return make_response(jsonify({
            "estado": "error",
            "respuesta": f"Error al conectar a la base de datos: {error}",
        }), 500)

    cursor = con.cursor(dictionary=True)
    try:
        sql = """
        SELECT
            IdReceta,
            Nombre,
            Descripcion,
            Ingredientes,
            Utensilios,
            Instrucciones,
            Nutrientes,
            Categorias,
            Imagen

        FROM Recetas

        ORDER BY IdReceta DESC

        LIMIT 10 OFFSET 0
        """

        cursor.execute(sql)
        registros = cursor.fetchall()
    finally:
        cursor.close()

    return render_template("RecetasTbody.html", recetas=registros)

# GUARDAR
# @app.route("/recetas", methods=["GET", "POST"])
# @login
# def guardarReceta():
#     if not con.is_connected():
#         con.reconnect()

#     IdReceta         = request.form.get("IdReceta")
#     Nombre           = request.form.get("Nombre")
#     Descripcion      = request.form.get("Descripcion")
#     Ingredientes     = request.form.get("Ingredientes")
#     Utensilios       = request.form.get("Utensilios")
#     Instrucciones    = request.form.get("Instrucciones")
#     Nutrientes       = request.form.get("Nutrientes")
#     Categorias       = request.form.get("Categorias")
#     file             = request.files.get("fileImagen")
#     Imagen_form = request.form.get("Imagen")

#     file = request.files.get("fileImagen")

#     Imagen = Imagen_form
#     if file and file.filename:
#         filename = secure_filename(file.filename)

#         uploads_dir = os.path.join(app.root_path, "static", "uploads")
#         os.makedirs(uploads_dir, exist_ok=True)

#         file_path = os.path.join(uploads_dir, filename)
#         file.save(file_path)

#         Imagen = f"static/uploads/{filename}"
    
#     cursor = con.cursor()

#     if IdReceta:
#         sql = """
#         UPDATE Recetas

#         SET Nombre          = %s,
#         Descripcion         = %s,
#         Ingredientes        = %s,
#         Utensilios          = %s,
#         Instrucciones       = %s,
#         Nutrientes          = %s,
#         Categorias          = %s,
#         Imagen              = %s
        

#         WHERE IdReceta = %s
#         """
#         val = (Nombre, Descripcion, Ingredientes, Utensilios, Instrucciones, Nutrientes, Categorias, Imagen, IdReceta)
#     else:
#         sql = """
#         INSERT INTO Recetas (IdReceta, Nombre, Descripcion, Ingredientes, Utensilios, Instrucciones, Nutrientes, Categorias, Imagen)
#                     VALUES (   %s,       %s,        %s,          %s,          %s,           %s,          %s,         %s,       %s)
#         """
#         val =               (IdReceta, Nombre, Descripcion, Ingredientes, Utensilios, Instrucciones, Nutrientes, Categorias, Imagen)
    
#     cursor.execute(sql, val)
#     con.commit()
#     con.close()

#     pusherRecetas()
    
#     return make_response(jsonify({}))


# ELIMINAR
@app.route("/recetas/eliminar", methods=["POST"])
@login
@admin
def eliminarReceta():
    try:
        con = get_connection()
    except mysql.connector.Error as error:
        return make_response(jsonify({
            "estado": "error",
            "respuesta": f"Error al conectar a la base de datos: {error}",
        }), 500)

    id = request.form["id"]

    cursor = con.cursor(dictionary=True)
    try:
        sql    = """
        DELETE FROM Recetas
        WHERE IdReceta = %s
        """
        val    = (id,)

        cursor.execute(sql, val)
        con.commit()
    finally:
        cursor.close()
        if con and con.is_connected():
            con.close()

    pusherRecetas()
    
    return make_response(jsonify({}))


# # EDITAR
# @app.route("/recetas/<int:id>")
# @login
# def editarReceta(id):
#     if not con.is_connected():
#         con.reconnect()

#     cursor = con.cursor(dictionary=True)
#     sql    = """
#     SELECT IdReceta, Nombre, Descripcion, Ingredientes, Utensilios, Instrucciones, Nutrientes, Categorias, Imagen

#     FROM Recetas

#     WHERE IdRecetas = %s
#     """
#     val    = (id,)

#     cursor.execute(sql, val)
#     registros = cursor.fetchall()
#     con.close()

#     return make_response(jsonify(registros))


# BUSQUEDA
@app.route("/recetas/buscar", methods=["GET"])
@login
def buscarReceta():
    try:
        con = get_connection()
    except mysql.connector.Error as error:
        return make_response(jsonify({
            "estado": "error",
            "respuesta": f"Error al conectar a la base de datos: {error}",
        }), 500)

    args     = request.args
    busqueda = args["busqueda"]
    busqueda = f"%{busqueda}%"
    
# EN WHERE BUSQUEDA PUSE SOLO TRES POR EL "VAL" NO SE SI SE LIMITE (si se limita)
    cursor = con.cursor(dictionary=True)
    sql    = """
    SELECT  IdReceta,
            Nombre,
            Descripcion,
            Ingredientes,
            Utensilios,
            Instrucciones,
            Nutrientes,
            Categorias
           
    FROM Recetas
    
    WHERE Nombre LIKE %s
       OR Ingredientes LIKE %s
       OR Nutrientes LIKE %s
       OR Categorias LIKE %s

    ORDER BY IdReceta DESC
    LIMIT 10 OFFSET 0
    """
    val    = (busqueda, busqueda, busqueda, busqueda)

    try:
        cursor.execute(sql, val)
        registros = cursor.fetchall()


    except mysql.connector.errors.ProgrammingError as error:
        print(f"Ocurrió un error de programación en MySQL: {error}")
        registros = []

    finally:
        cursor.close()
        con.close()

    return make_response(jsonify(registros))


@app.route("/recetas/categorias", methods=["GET"])
@login
def buscarCategorias():
    try:
        con = get_connection()
    except mysql.connector.Error as error:
        return make_response(jsonify({
            "estado": "error",
            "respuesta": f"Error al conectar a la base de datos: {error}",
        }), 500)

    args     = request.args
    categoria = args["categoria"]
    
# EN WHERE BUSQUEDA PUSE SOLO TRES POR EL "VAL" NO SE SI SE LIMITE (si se limita)
    cursor = con.cursor(dictionary=True)
    sql    = """
    SELECT  Nombre
           
    FROM Recetas
    
    WHERE Categorias = %s

    ORDER BY Nombre ASC
    LIMIT 10 OFFSET 0
    """
    val    = (categoria,)

    try:
        cursor.execute(sql, val)
        registros = cursor.fetchall()
    except mysql.connector.errors.ProgrammingError as error:
        print(f"Ocurrió un error de programación en MySQL: {error}")
        registros = []
    finally:
        cursor.close()
        if con and con.is_connected():
            con.close()

    return make_response(jsonify(registros))

@app.route("/recetas/<int:Id_Usuario>", methods=["GET"])
@login
def obtener_recetas_favoritos(Id_Usuario):
    try:
        con = get_connection()
    except mysql.connector.Error as error:
        return make_response(jsonify({
            "estado": "error",
            "respuesta": f"Error al conectar a la base de datos: {error}",
        }), 500)

    cursor = con.cursor(dictionary=True)

    try:
        sql = """
        SELECT r.IdReceta, r.Nombre, r.Descripcion, r.Ingredientes, r.Utensilios,
               r.Instrucciones, r.Nutrientes, r.Categorias, r.Imagen,
               f.IdFavorito, f.Comentario, f.Calificacion, f.Fecha
        FROM Recetas r
        LEFT JOIN Favoritos f
        ON r.IdReceta = f.IdReceta AND f.Id_Usuario = %s
        ORDER BY r.Nombre ASC
        """
        val = (Id_Usuario,)
        cursor.execute(sql, val)
        registros = cursor.fetchall()
    finally:
        if cursor:
            cursor.close()
        # opcional: no cerrar la conexión global si la vas a reutilizar
        # con.close()

    return make_response(jsonify(registros))






