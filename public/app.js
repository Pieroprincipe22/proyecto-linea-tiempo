document.addEventListener('DOMContentLoaded', () => {
    
    // Elementos del DOM (sin cambios)
    const form = document.getElementById('upload-form');
    const fechaInput = document.getElementById('evento-fecha');
    const descripcionInput = document.getElementById('evento-descripcion');
    const fotoInput = document.getElementById('evento-foto');
    const timelineContainer = document.getElementById('timeline');

    // Función 'dibujarRecuerdo' (sin cambios)
    function dibujarRecuerdo(recuerdo) {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('timeline-item');
        itemDiv.dataset.id = recuerdo.id; 

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('timeline-content');

        const btnDelete = document.createElement('button');
        btnDelete.classList.add('btn-delete');
        btnDelete.textContent = 'X';
        btnDelete.title = 'Eliminar este recuerdo';
        contentDiv.appendChild(btnDelete);

        const btnEdit = document.createElement('button');
        btnEdit.classList.add('btn-edit');
        btnEdit.innerHTML = '&#9998;'; // Icono de lápiz
        btnEdit.title = 'Editar este recuerdo';
        contentDiv.appendChild(btnEdit);

        const fechaAmigable = new Date(recuerdo.fecha + 'T00:00:00').toLocaleDateString('es-ES', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        const h3 = document.createElement('h3');
        h3.textContent = fechaAmigable;
        h3.dataset.valorOriginal = recuerdo.fecha;
        h3.classList.add('timeline-fecha');

        const p = document.createElement('p');
        p.textContent = recuerdo.descripcion;
        p.classList.add('timeline-descripcion');

        const img = document.createElement('img');
        img.src = recuerdo.rutaFoto;
        img.alt = recuerdo.descripcion;
        img.style.maxWidth = '100%';
        img.style.borderRadius = '5px';
        img.style.marginTop = '10px';

        contentDiv.appendChild(h3);
        contentDiv.appendChild(p);
        contentDiv.appendChild(img);
        itemDiv.appendChild(contentDiv);

        timelineContainer.prepend(itemDiv);
    }

    // Función 'cargarRecuerdos' (sin cambios)
    async function cargarRecuerdos() {
        try {
            const response = await fetch('/api/recuerdos');
            const data = await response.json();
            if (data.success) {
                timelineContainer.innerHTML = ''; 
                for (const recuerdo of data.recuerdos) {
                    dibujarRecuerdo(recuerdo);
                }
            } else {
                alert('Error al cargar los recuerdos.');
            }
        } catch (error) {
            console.error('Error de red al cargar recuerdos:', error);
        }
    }

    // Evento 'submit' del formulario (sin cambios)
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData();
        formData.append('fecha', fechaInput.value);
        formData.append('descripcion', descripcionInput.value);
        formData.append('foto', fotoInput.files[0]);
        try {
            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await response.json();
            if (data.success) {
                dibujarRecuerdo(data.datos); 
                form.reset();
            } else {
                alert('Error al subir el recuerdo.');
            }
        } catch (error) {
            console.error('Error de red:', error);
            alert('Error de conexión. Inténtalo de nuevo.');
        }
    });

    // === CORREGIDO: Evento principal para Borrar y Editar ===
    timelineContainer.addEventListener('click', async (event) => {
        
        const timelineItem = event.target.closest('.timeline-item');
        if (!timelineItem) return;

        const id = timelineItem.dataset.id;

        // --- Lógica de Borrado (sin cambios) ---
        if (event.target.classList.contains('btn-delete')) {
            if (!confirm('¿Estás seguro de que quieres eliminar este recuerdo?')) {
                return;
            }
            try {
                const response = await fetch(`/api/recuerdos/${id}`, { method: 'DELETE' });
                const data = await response.json();
                if (data.success) {
                    timelineItem.remove();
                } else {
                    alert(`Error al eliminar: ${data.message}`);
                }
            } catch (error) {
                console.error('Error de red al borrar:', error);
                alert('Error de conexión.');
            }
            return;
        }

        // --- Lógica de Edición (CORREGIDA) ---
        if (event.target.classList.contains('btn-edit')) {
            
            const estaEditando = timelineItem.classList.contains('editing');
            const btnEdit = event.target;

            if (estaEditando) {
                // --- MODO GUARDAR ---
                // 1. Encontrar los inputs actuales
                const inputFecha = timelineItem.querySelector('input[type="date"]');
                const inputDesc = timelineItem.querySelector('textarea');
                
                const nuevosDatos = {
                    fecha: inputFecha.value,
                    descripcion: inputDesc.value
                };

                try {
                    const response = await fetch(`/api/recuerdos/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(nuevosDatos)
                    });
                    const data = await response.json();

                    if (data.success) {
                        // 2. ¡CORRECCIÓN! Creamos los nuevos elementos h3 y p
                        const fechaAmigable = new Date(nuevosDatos.fecha + 'T00:00:00').toLocaleDateString('es-ES', {
                            year: 'numeric', month: 'long', day: 'numeric'
                        });
                        const newH3 = document.createElement('h3');
                        newH3.textContent = fechaAmigable;
                        newH3.dataset.valorOriginal = nuevosDatos.fecha;
                        newH3.classList.add('timeline-fecha');

                        const newP = document.createElement('p');
                        newP.textContent = nuevosDatos.descripcion;
                        newP.classList.add('timeline-descripcion');

                        // 3. Reemplazamos los inputs con los nuevos h3 y p
                        inputFecha.replaceWith(newH3);
                        inputDesc.replaceWith(newP);

                        // 4. Cambiamos el estado
                        btnEdit.innerHTML = '&#9998;'; // Lápiz
                        timelineItem.classList.remove('editing');
                    } else {
                        alert(`Error al guardar: ${data.message}`);
                    }

                } catch (error) {
                    // ¡Mejora! Mostramos el error real en la consola.
                    console.error('Error al guardar la edición:', error);
                    alert('Error al guardar. Revisa la consola (F12) para más detalles.');
                }

            } else {
                // --- MODO EDITAR ---
                // 1. ¡CORRECCIÓN! Buscamos los h3 y p aquí
                const fechaEl = timelineItem.querySelector('.timeline-fecha');
                const descEl = timelineItem.querySelector('.timeline-descripcion');

                // 2. Obtener valores actuales
                const fechaOriginal = fechaEl.dataset.valorOriginal;
                const descOriginal = descEl.textContent;

                // 3. Crear input de fecha
                const inputFecha = document.createElement('input');
                inputFecha.type = 'date';
                inputFecha.value = fechaOriginal;
                fechaEl.replaceWith(inputFecha); // Reemplazar h3 con input

                // 4. Crear textarea de descripción
                const inputDesc = document.createElement('textarea');
                inputDesc.value = descOriginal;
                inputDesc.rows = 3;
                inputDesc.style.width = '100%';
                inputDesc.style.marginTop = '5px';
                descEl.replaceWith(inputDesc); // Reemplazar p con textarea

                // 5. Cambiar el botón a "Guardar" y marcar estado
                btnEdit.innerHTML = '&#128190;'; // Icono de disquete (Guardar)
                timelineItem.classList.add('editing');
            }
        }
    });

    // Cargamos los recuerdos al iniciar (sin cambios)
    cargarRecuerdos();
});

/* ... (todo tu código anterior de la app) ... */

// === ¡NUEVO! Registramos el Service Worker ===

// Verificamos si el navegador soporta Service Workers
if ('serviceWorker' in navigator) {
  // Esperamos a que la página cargue completamente
  window.addEventListener('load', () => {
    // Registramos nuestro archivo
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('Service Worker registrado con éxito:', registration.scope);
      })
      .catch((error) => {
        console.error('Error al registrar el Service Worker:', error);
      });
  });
}