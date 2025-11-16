const express = require('express');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const session = require('express-session');

const app = express();

// === MODIFICACIÓN 1: El Puerto (para Render) ===
// Render te da un puerto aleatorio. process.env.PORT lo captura.
const port = process.env.PORT || 3000;

// ¡Asegúrate de que esta sea tu contraseña!
const MI_CONTRASENA_SECRETA = "tu-contraseña-secreta-aqui"; 

// === MODIFICACIÓN 2: Rutas Persistentes (para Render) ===
// Render nos da un disco en '/var/data'
// Si esa ruta no existe (en tu PC), usa el directorio local '.'
const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || '.';
const DB_FILE = path.join(DATA_DIR, 'nuestra_historia.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Asegurarnos que la carpeta de subidas exista
if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
// === Fin de MODIFICACIÓN 2 ===


// === Configuración de Middlewares (Sesión y Formularios) ===
app.use(session({
  secret: 'un-secreto-muy-largo-y-dificil-de-adivinar', // Clave para firmar la cookie
  resave: false, // No volver a guardar si no hay cambios
  saveUninitialized: false, // No guardar sesiones vacías
  cookie: {
    secure: false, // Poner en 'true' si usas HTTPS
    maxAge: 1000 * 60 * 60 * 24 // Duración de la cookie: 1 día
  }
}));

app.use(express.json()); // Para leer JSON (API)
app.use(express.urlencoded({ extended: true })); // Para leer formularios (Login)

// === Configuración de la Base de Datos (Usa la nueva ruta) ===
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) { console.error(err.message); }
  console.log(`Conectado a la base de datos en: ${DB_FILE}`);
});
db.run(`CREATE TABLE IF NOT EXISTS recuerdos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  rutaFoto TEXT NOT NULL
)`);
// === Fin Configuración de la Base de Datos ===

// === Configuración de Multer (Usa la nueva ruta) ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR); // ¡Modificado!
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

app.post('/login', (req, res) => {
  if (req.body.password === MI_CONTRASENA_SECRETA) {
    req.session.user = { loggedIn: true };
    res.redirect('/app');
  } else {
    console.warn('Intento de login fallido');
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
// ¡NUEVO! Servimos la carpeta de subidas desde el disco persistente
app.use('/uploads', express.static(UPLOADS_DIR));


// === Rutas de la API (¡PROTEGIDAS!) ===
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
  const rutaFoto = '/uploads/' + req.file.filename; // Esta ruta es correcta
  const sql = `INSERT INTO recuerdos (fecha, descripcion, rutaFoto) VALUES (?, ?, ?)`;
  db.run(sql, [fecha, descripcion, rutaFoto], function(err) {
    if (err) { res.json({ success: false, message: err.message }); return; }
    res.json({ success: true, datos: { id: this.lastID, fecha, descripcion, rutaFoto } });
  });
});

// RUTA: BORRAR UN RECUERDO (DELETE /api/recuerdos/:id)
app.delete('/api/recuerdos/:id', (req, res) => {
  const id = req.params.id;
  const sqlSelect = "SELECT rutaFoto FROM recuerdos WHERE id = ?";
  db.get(sqlSelect, [id], (err, row) => {
    if (err) { res.json({ success: false, message: err.message }); return; }
    const sqlDelete = "DELETE FROM recuerdos WHERE id = ?";
    db.run(sqlDelete, [id], function(deleteErr) {
      if (deleteErr) { res.json({ success: false, message: deleteErr.message }); return; }
      if (row && row.rutaFoto) {
        // Usamos UPLOADS_DIR y el nombre del archivo para borrarlo
        const nombreArchivo = path.basename(row.rutaFoto);
        const rutaFotoCompleta = path.join(UPLOADS_DIR, nombreArchivo);
        
        fs.unlink(rutaFotoCompleta, (unlinkErr) => {
            if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                 console.error("Error al borrar archivo de foto:", unlinkErr);
            }
        });
      }
      res.json({ success: true, message: 'Recuerdo eliminado' });
    });
  });
});

// RUTA: ACTUALIZAR UN RECUERDO (PUT /api/recuerdos/:id)
app.put('/api/recuerdos/:id', (req, res) => {
  const id = req.params.id;
  const { fecha, descripcion } = req.body;
  if (!fecha || !descripcion) {
    return res.json({ success: false, message: 'La fecha y la descripción no pueden estar vacías.' });
  }
  const sql = `UPDATE recuerdos SET fecha = ?, descripcion = ? WHERE id = ?`;
  db.run(sql, [fecha, descripcion, id], function(err) {
    if (err) { res.json({ success: false, message: err.message }); return; }
    res.json({ success: true, message: 'Recuerdo actualizado con éxito.' });
  });
});
// === Fin Rutas de la API ===

// Iniciar el servidor (Usa la variable 'port' de Render)
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});