const express = require('express');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt'); // <-- AÑADIDO EN PASO 1

const app = express();

// === Puerto (para Render) ===
const port = process.env.PORT || 3000;

// === Variables de Entorno (¡LEÍDAS DESDE RENDER!) ===
const MI_CONTRASENA_SECRETA = process.env.MI_CONTRASENA_SECRETA;
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

// =========================================================
// === PASO 2: Configuración de la Base de Datos (MULTI-USUARIO) ===
// =========================================================
const DB_FILE = path.join(DATA_DIR, 'nuestra_historia_v2.db'); // v2 para la nueva DB
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) { console.error(err.message); }
  console.log(`Conectado a la base de datos en: ${DB_FILE}`);
});

// Habilitamos las Foreign Keys para SQLite
db.run('PRAGMA foreign_keys = ON;');

// 2. Creamos la NUEVA tabla de usuarios
db.run(`CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
)`);

// 3. Modificamos la tabla recuerdos para AÑADIR el 'user_id'
db.run(`CREATE TABLE IF NOT EXISTS recuerdos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  rutaFoto TEXT NOT NULL,
  user_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE
)`);
// === Fin Configuración de la Base de Datos ===


// === Configuración de Multer (Usa la nueva ruta) ===
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
  // AHORA revisamos req.session.userId (que lo crearemos al loguear)
  // (Este guardia sigue funcionando conceptualmente)
  if (req.session.user) { // <-- Mantendremos 'user' por ahora
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

// ¡¡¡ESTA RUTA AHORA ESTÁ OBSOLETA!!! (La arreglaremos después)
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
// === Fin Rutas de Login/Logout ===


// === Servir archivos estáticos ===
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_DIR));


// === Rutas de la API (¡PROTEGIDAS!) ===
// ¡¡¡ESTAS RUTAS ESTÁN OBSOLETAS!!! (Las arreglaremos después)
app.use('/api', checkAuth);

// RUTA: LEER TODOS LOS RECUERDOS (GET /api/recuerdos)
app.get('/api/recuerdos', (req, res) => {
  // Esta ruta ahora está MAL, porque muestra los recuerdos de TODOS.
  // La arreglaremos para que solo muestre los del user_id de la sesión.
  const sql = `SELECT * FROM recuerdos ORDER BY fecha DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) { res.json({ success: false, message: err.message }); return; }
    res.json({ success: true, recuerdos: rows });
  });
});

// RUTA: AÑADIR UN NUEVO RECUERDO (POST /api/upload)
app.post('/api/upload', upload.single('foto'), (req, res) => {
  // Esta ruta está MAL, no guarda el user_id.
  const fecha = req.body.fecha;
  const descripcion = req.body.descripcion;
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

// Iniciar el servidor (Usa la variable 'port' de Render)
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});