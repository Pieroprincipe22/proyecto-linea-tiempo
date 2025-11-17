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

// === Configuración de la Base de Datos (v3) ===
// (Esto ya debería estar bien por el paso anterior)
const DB_FILE = path.join(DATA_DIR, 'nuestra_historia_v3.db');
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) { console.error(err.message); }
  console.log(`Conectado a la base de datos en: ${DB_FILE}`);
});

db.run('PRAGMA foreign_keys = ON;');

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

// === ¡RUTA DE LOGIN ARREGLADA! ===
app.post('/login', (req, res) => {
  // 1. Obtenemos email y contraseña del formulario
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send("Email y contraseña son requeridos.");
  }

  try {
    // 2. Buscamos al usuario por su email
    const sqlSelect = "SELECT * FROM usuarios WHERE email = ?";
    db.get(sqlSelect, [email], async (err, row) => {
      if (err) {
        console.error("Error al buscar usuario:", err);
        return res.status(500).send("Error del servidor.");
      }
      
      if (!row) {
        // Usuario no encontrado
        console.warn(`Intento de login fallido: Email ${email} no encontrado.`);
        return res.redirect('/');
      }

      // 3. ¡Usuario encontrado! Comparamos la contraseña
      const isMatch = await bcrypt.compare(password, row.password_hash);

      if (isMatch) {
        // ¡Contraseña correcta!
        console.log(`Inicio de sesión exitoso para: ${row.email}`);
        
        // 4. Creamos la sesión
        req.session.user = { 
          id: row.id, 
          email: row.email, 
          nombre: row.nombre 
        };
        
        // 5. Lo redirigimos a la aplicación
        res.redirect('/app');
      } else {
        // Contraseña incorrecta
        console.warn(`Intento de login fallido: Contraseña incorrecta para ${email}.`);
        return res.redirect('/');
      }
    });

  } catch (error) {
    console.error("Error en el login:", error);
    res.status(500).send("Error interno del servidor.");
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// === ¡RUTA DE REGISTRO CON FLUJO CORREGIDO! ===
app.post('/register', async (req, res) => {
  const { nombre, apellido, email, password, repetirContraseña } = req.body;

  if (!nombre || !apellido || !email || !password || !repetirContraseña) {
    return res.status(400).send("Todos los campos son requeridos.");
  }
  if (password !== repetirContraseña) {
    return res.redirect('/register.html'); 
  }

  try {
    const sqlSelect = "SELECT * FROM usuarios WHERE email = ?";
    db.get(sqlSelect, [email], async (err, row) => {
      if (err) { return res.status(500).send("Error del servidor."); }
      if (row) { return res.redirect('/register.html'); }

      const passwordHash = await bcrypt.hash(password, 10);
      const sqlInsert = `INSERT INTO usuarios (nombre, apellido, email, password_hash) 
                         VALUES (?, ?, ?, ?)`;
      db.run(sqlInsert, [nombre, apellido, email, passwordHash], function(err) {
        if (err) { return res.status(500).send("Error del servidor."); }
        
        console.log(`Nuevo usuario creado: ${nombre} ${apellido}`);

        // ¡¡CAMBIO!! Redirigimos al Login, como pediste.
        res.redirect('/');
      });
    });
  } catch (error) {
    res.status(500).send("Error interno del servidor.");
  }
});
// === Fin de la ruta de Registro ===

// === Servir archivos estáticos (¡CORREGIDO!) ===
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_DIR));


// ===================================
// === ¡RUTAS DE LA API ARREGLADAS! ===
// ===================================
app.use('/api', checkAuth); // El guardia protege toda la API

// RUTA: LEER TODOS LOS RECUERDOS (¡ARREGLADA!)
app.get('/api/recuerdos', (req, res) => {
  // Obtenemos el ID del usuario de la sesión
  const userId = req.session.user.id;

  // Seleccionamos SOLO los recuerdos que pertenecen a ese usuario
  const sql = `SELECT * FROM recuerdos WHERE user_id = ? ORDER BY fecha DESC`;
  
  db.all(sql, [userId], (err, rows) => {
    if (err) { res.json({ success: false, message: err.message }); return; }
    res.json({ success: true, recuerdos: rows });
  });
});

// RUTA: AÑADIR UN NUEVO RECUERDO (¡ARREGLADA!)
app.post('/api/upload', upload.single('foto'), (req, res) => {
  // Obtenemos el ID del usuario de la sesión
  const userId = req.session.user.id;
  const { fecha, descripcion } = req.body;
  const rutaFoto = '/uploads/' + req.file.filename;
  
  // Insertamos el recuerdo CON el user_id
  const sql = `INSERT INTO recuerdos (fecha, descripcion, rutaFoto, user_id) 
               VALUES (?, ?, ?, ?)`;
               
  db.run(sql, [fecha, descripcion, rutaFoto, userId], function(err) {
    if (err) {
        console.error("Error al guardar recuerdo:", err); 
        res.json({ success: false, message: err.message }); 
        return; 
    }
    res.json({ 
        success: true, 
        datos: { id: this.lastID, fecha, descripcion, rutaFoto } 
    });
  });
});

// RUTA: BORRAR UN RECUERDO (¡ARREGLADA Y SEGURA!)
app.delete('/api/recuerdos/:id', (req, res) => {
  const idRecuerdo = req.params.id;
  const userId = req.session.user.id;

  // Primero, buscamos la foto para borrar el archivo
  const sqlSelect = "SELECT rutaFoto FROM recuerdos WHERE id = ? AND user_id = ?";
  db.get(sqlSelect, [idRecuerdo, userId], (err, row) => {
    if (err) { res.json({ success: false, message: err.message }); return; }
    if (!row) { return res.json({ success: false, message: "No autorizado." }); }

    // Borramos el registro (SOLO si el user_id coincide)
    const sqlDelete = "DELETE FROM recuerdos WHERE id = ? AND user_id = ?";
    db.run(sqlDelete, [idRecuerdo, userId], function(deleteErr) {
      if (deleteErr) { res.json({ success: false, message: deleteErr.message }); return; }

      // Borramos el archivo
      const nombreArchivo = path.basename(row.rutaFoto);
      const rutaFotoCompleta = path.join(UPLOADS_DIR, nombreArchivo);
      fs.unlink(rutaFotoCompleta, (unlinkErr) => { /* ... (manejo de error) ... */ });
      
      res.json({ success: true, message: 'Recuerdo eliminado' });
    });
  });
});

// RUTA: ACTUALIZAR UN RECUERDO (¡ARREGLADA Y SEGURA!)
app.put('/api/recuerdos/:id', (req, res) => {
  const idRecuerdo = req.params.id;
  const userId = req.session.user.id;
  const { fecha, descripcion } = req.body;

  // Actualizamos el recuerdo (SOLO si el user_id coincide)
  const sql = `UPDATE recuerdos SET fecha = ?, descripcion = ? 
               WHERE id = ? AND user_id = ?`;
               
  db.run(sql, [fecha, descripcion, idRecuerdo, userId], function(err) {
    if (err) { res.json({ success: false, message: err.message }); return; }
    
    // this.changes te dirá si algo se actualizó.
    if (this.changes === 0) {
        return res.json({ success: false, message: "No autorizado o no encontrado." });
    }
    res.json({ success: true, message: 'Recuerdo actualizado con éxito.' });
  });
});
// === Fin Rutas de la API ===

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});