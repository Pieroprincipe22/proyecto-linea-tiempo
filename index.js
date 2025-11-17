const express = require('express');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt'); 

const app = express();
const port = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;

const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || '.';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(session({
  secret: SESSION_SECRET, 
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// === Configuración de la Base de Datos (¡MODIFICADA!) ===
const DB_FILE = path.join(DATA_DIR, 'nuestra_historia_v2.db');
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) { console.error(err.message); }
  console.log(`Conectado a la base de datos en: ${DB_FILE}`);
});

db.run('PRAGMA foreign_keys = ON;');

// ¡¡ACTUALIZADO!! Añadimos nombre y apellido
db.run(`CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
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
  destination: (req, file, cb) => { cb(null, UPLOADS_DIR); },
  filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });
// === Fin Configuración de Multer ===


// === Middleware "Guardia" de Autenticación (Sin cambios) ===
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

// ¡ESTA RUTA AÚN ESTÁ OBSOLETA! (La arreglaremos después)
app.post('/login', (req, res) => {
  console.warn('Intento de login fallido (Ruta antigua)');
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// === ¡RUTA DE REGISTRO ACTUALIZADA! ===
app.post('/register', async (req, res) => {
  // 1. Obtenemos TODOS los campos del formulario
  const { nombre, apellido, email, password, repetirContraseña } = req.body;

  // 2. Validación
  if (!nombre || !apellido || !email || !password || !repetirContraseña) {
    return res.status(400).send("Todos los campos son requeridos.");
  }

  if (password !== repetirContraseña) {
    console.warn('Intento de registro fallido: Las contraseñas no coinciden.');
    return res.redirect('/register.html'); 
  }

  try {
    // 3. Revisamos si el email ya existe
    const sqlSelect = "SELECT * FROM usuarios WHERE email = ?";
    db.get(sqlSelect, [email], async (err, row) => {
      if (err) {
        console.error("Error al buscar usuario:", err);
        return res.status(500).send("Error del servidor.");
      }
      
      if (row) {
        console.warn(`Intento de registro fallido: ${email} ya existe.`);
        return res.redirect('/register.html'); // Devolver a registro
      }

      // 4. Encriptamos la contraseña
      const passwordHash = await bcrypt.hash(password, 10);

      // 5. Guardamos el nuevo usuario
      const sqlInsert = `INSERT INTO usuarios (nombre, apellido, email, password_hash) 
                         VALUES (?, ?, ?, ?)`;
      db.run(sqlInsert, [nombre, apellido, email, passwordHash], function(err) {
        if (err) {
          console.error("Error al guardar usuario:", err);
          return res.status(500).send("Error del servidor.");
        }
        
        const newUserId = this.lastID;
        console.log(`Nuevo usuario creado: ${nombre} ${apellido} (ID: ${newUserId})`);

        // 6. Iniciamos su sesión
        req.session.user = { id: newUserId, email: email, nombre: nombre };
        
        // 7. Lo redirigimos a la aplicación
        res.redirect('/app');
      });
    });

  } catch (error) {
    console.error("Error en el registro:", error);
    res.status(500).send("Error interno del servidor.");
  }
});
// === Fin de la ruta de Registro ===

// === Servir archivos estáticos ===
// ¡¡¡AQUÍ ESTÁ LA LÍNEA QUE FALTABA!!!
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_DIR));


// === Rutas de la API (AÚN OBSOLETAS) ===
app.use('/api', checkAuth);
// ... (El resto de las rutas GET, POST, DELETE, PUT
//     siguen aquí, pero aún no funcionan para multi-usuario) ...
app.get('/api/recuerdos', (req, res) => { /* ... */ });
app.post('/api/upload', upload.single('foto'), (req, res) => { /* ... */ });
app.delete('/api/recuerdos/:id', (req, res) => { /* ... */ });
app.put('/api/recuerdos/:id', (req, res) => { /* ... */ });
// === Fin Rutas de la API ===

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});