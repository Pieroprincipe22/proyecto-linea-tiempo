const express = require('express');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt'); // Importamos bcrypt

const app = express();

// === Puerto (para Render) ===
const port = process.env.PORT || 3000;

// === Variables de Entorno (¡LEÍDAS DESDE RENDER!) ===
const MI_CONTRASENA_SECRETA = process.env.MI_CONTRASENA_SECRETA; // (Esta ya casi no se usa)
const SESSION_SECRET = process.env.SESSION_SECRET;

// === Rutas Persistentes (para Render) ===
const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || '.';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Asegurarnos que la carpeta de subidas exista
if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// === Configuración de Middlewares (Sesión y Formularios) ===
app.use(session({
  secret: SESSION_SECRET, // Leído desde variables de entorno
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Poner en 'true' si usas HTTPS
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// === Configuración de la Base de Datos (MULTI-USUARIO) ===
const DB_FILE = path.join(DATA_DIR, 'nuestra_historia_v2.db');
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) { console.error(err.message); }
  console.log(`Conectado a la base de datos en: ${DB_FILE}`);
});

db.run('PRAGMA foreign_keys = ON;');

db.run(`CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS recuerdos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  rutaFoto TEXT NOT NULL,
  user_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE
)`);
// === Fin Configuración de la Base de Datos ===


// === Configuración de Multer (Sin cambios) ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR); 
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });
// === Fin Configuración de Multer ===


// === Middleware "Guardia" de Autenticación ===
function checkAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/');
  }
}
// === Fin Middleware "Guardia" ===

// === Rutas de Login/Logout ===
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/app');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

app.get('/app', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// ¡ESTA RUTA AHORA ESTÁ OBSOLETA! (La arreglaremos en el Paso 5)
app.post('/login', (req, res) => {
  if (req.body.password === MI_CONTRASENA_SECRETA) {
    req.session.user = { loggedIn: true }; // <-- Esto lo cambiaremos
    res.redirect('/app');
  } else {
    console.warn('Intento de login fallido (Ruta antigua)');
    res.redirect('/');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// === ¡NUEVO! RUTA DE REGISTRO (POST /register) - PASO 4 ===
app.post('/register', async (req, res) => {
  // 1. Obtenemos el email y la contraseña del formulario
  const email = req.body.email;
  const password = req.body.password;

  if (!email || !password) {
    return res.status(400).send("Email y contraseña son requeridos.");
  }

  try {
    // 2. Revisamos si el email ya existe
    const sqlSelect = "SELECT * FROM usuarios WHERE email = ?";
    db.get(sqlSelect, [email], async (err, row) => {
      if (err) {
        console.error("Error al buscar usuario:", err);
        return res.status(500).send("Error del servidor al registrar.");
      }
      
      if (row) {
        // ¡Usuario ya existe!
        console.warn(`Intento de registro fallido: ${email} ya existe.`);
        return res.redirect('/'); 
      }

      // 3. ¡Email disponible! Encriptamos la contraseña
      const passwordHash = await bcrypt.hash(password, 10);

      // 4. Guardamos el nuevo usuario en la base de datos
      const sqlInsert = "INSERT INTO usuarios (email, password_hash) VALUES (?, ?)";
      db.run(sqlInsert, [email, passwordHash], function(err) {
        if (err) {
          console.error("Error al guardar usuario:", err);
          return res.status(500).send("Error del servidor al guardar.");
        }
        
        const newUserId = this.lastID;
        console.log(`Nuevo usuario creado con ID: ${newUserId} y email: ${email}`);

        // 5. ¡Registro exitoso! Iniciamos su sesión
        //    Guardamos su ID y email en la sesión
        req.session.user = { id: newUserId, email: email };
        
        // 6. Lo redirigimos a la aplicación
        res.redirect('/app');
      });
    });

  } catch (error) {
    console.error("Error en el registro:", error);
    res.status(500).send("Error interno del servidor.");
  }
});
// === Fin de la ruta de Registro ===

// === Fin Rutas de Login/Logout ===


// === Servir archivos estáticos ===
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_DIR));


// === Rutas de la API (¡PROTEGIDAS!) ===
// ¡¡¡ESTAS RUTAS AÚN NO ESTÁN LISTAS PARA MULTI-USUARIO!!!
app.use('/api', checkAuth);

// RUTA: LEER TODOS LOS RECUERDOS (GET /api/recuerdos)
app.get('/api/recuerdos', (req, res) => {
  const sql = `SELECT * FROM recuerdos ORDER BY fecha DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) { res.json({ success: false, message: err.message }); return; }
    res.json({ success: true, recuerdos: rows });
  });
});

// RUTA: AÑADIR UN NUEVO RECUERDO (POST /api/upload)
app.post('/api/upload', upload.single('foto'), (req, res) => {
  const fecha = req.body.fecha;
  const descripcion = req.body.descripcion;
  
  // === ¡LÍNEA CORREGIDA! ===
  const rutaFoto = '/uploads/' + req.file.filename;
  
  const sql = `INSERT INTO recuerdos (fecha, descripcion, rutaFoto) VALUES (?, ?, ?)`;
  db.run(sql, [fecha, descripcion, rutaFoto], function(err) {
    if (err) { res.json({ success: false, message: err.message }); return; }
    res.json({ success: true, datos: { id: this.lastID, fecha, descripcion, rutaFoto } });
  });
});

// RUTA: BORRAR UN RECUERDO (DELETE /api/recuerdos/:id)
app.delete('/api/recuerdos/:id', (req, res) => {
  // Esta ruta es INSEGURA, cualquiera puede borrar el recuerdo de otro.
  const id = req.params.id;
  const sqlSelect = "SELECT rutaFoto FROM recuerdos WHERE id = ?";
  db.get(sqlSelect, [id], (err, row) => { /* ... */ });
});

// RUTA: ACTUALIZAR UN RECUERDO (PUT /api/recuerdos/:id)
app.put('/api/recuerdos/:id', (req, res) => {
  // Esta ruta es INSEGURA.
  const id = req.params.id;
  const { fecha, descripcion } = req.body;
  const sql = `UPDATE recuerdos SET fecha = ?, descripcion = ? WHERE id = ?`;
  db.run(sql, [fecha, descripcion, id], function(err) { /* ... */ });
});
// === Fin Rutas de la API ===

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});