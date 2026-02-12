// Código para iniciar y detener la cámara trasera en el elemento <video id="webcam">.
// Nota: getUserMedia requiere un contexto seguro (https) o localhost en la mayoría de navegadores.

let currentStream = null;
let model = null;
let predictInterval = null;
const PREDICTION_INTERVAL = 500; // ms

const videoEl = document.getElementById('webcam');
const resultsEl = document.getElementById('results');
const predictionsList = document.getElementById('predictions');


async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('getUserMedia no está disponible en este navegador. Usa un navegador moderno.');
    return;
  }

  try {
    // Intento preferente: pedir la cámara trasera usando facingMode ideal
    const constraints = { video: { facingMode: { ideal: 'environment' } }, audio: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    attachStream(stream);
    return;
  } catch (err) {
    console.warn('No se pudo abrir con facingMode, intentando fallback por deviceId:', err);
  }

  // Fallback: enumerar dispositivos y tratar de seleccionar uno que parezca trasero
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    if (videoDevices.length === 0) {
      throw new Error('No se encontraron dispositivos de vídeo.');
    }

    // Buscar palabras clave en la etiqueta del dispositivo para identificar la trasera
    const backRegex = /back|rear|environment|trasera|posterior/i;
    let chosen = videoDevices.find(d => backRegex.test(d.label));

    // Si no hay labels (sin permiso) o no se encontró, tomar el último dispositivo como heurística
    if (!chosen) {
      chosen = videoDevices[videoDevices.length - 1];
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: chosen.deviceId } },
      audio: false,
    });

    attachStream(stream);
  } catch (err) {
    console.error('No se pudo acceder a la cámara:', err);
    alert('Error al acceder a la cámara: ' + (err && err.message ? err.message : err));
  }
}

function attachStream(stream) {
  // Detener stream anterior si existía
  if (currentStream) stopCamera();

  currentStream = stream;
  // Mostrar el stream en el elemento video
  try {
    videoEl.srcObject = stream;
    // Asegurar que el vídeo está silenciado para permitir autoplay en móviles
    videoEl.muted = true;
    // Algunos navegadores requieren play() explícito
    videoEl.play().catch(e => {
      // Ignorar si play falla por políticas de autoplay; el usuario puede interactuar
      console.warn('video.play() rechazado:', e);
    });
    // Cargar modelo si no está cargado y comenzar predicciones
    startPredictions();
  } catch (err) {
    console.error('Error al asignar srcObject:', err);
  }
}

function stopCamera() {
  if (!currentStream) return;

  // Detener todas las pistas
  currentStream.getTracks().forEach(track => track.stop());
  currentStream = null;
  videoEl.pause();
  try {
    videoEl.srcObject = null;
  } catch (e) {
    // fallback: asignar empty src
    videoEl.removeAttribute('src');
  }
  // Detener predicciones si están corriendo
  stopPredictions();
}

// Eventos de los botones
// Nota: los botones han sido retirados; la cámara se inicia automáticamente.

// Si la pestaña se oculta, opcionalmente detener la cámara para ahorrar batería
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // no detener automáticamente si se desea mantener la sesión; aquí lo hacemos
    if (currentStream) stopCamera();
  }
});

// Iniciar la cámara automáticamente al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  const h3 = resultsEl.querySelector('h3');
  if (h3) h3.textContent = 'Inicializando cámara y modelo...';
  startCamera();
});

// Exportar para otros módulos (si se desea usar desde consola)
window.startCamera = startCamera;
window.stopCamera = stopCamera;

// ----- MobileNet / TensorFlow.js integration -----
async function loadModel() {
  if (model) return model;
  try {
    resultsEl.querySelector('h3').textContent = 'Cargando modelo...';
    // mobilenet está disponible por el script incluido en HTML: window.mobilenet
    model = await window.mobilenet.load();
    resultsEl.querySelector('h3').textContent = 'Modelo cargado';
    return model;
  } catch (err) {
    console.error('Error cargando MobileNet:', err);
    resultsEl.querySelector('h3').textContent = 'Error cargando modelo';
    throw err;
  }
}

function updatePredictions(preds) {
  // Limpiar lista
  while (predictionsList.firstChild) predictionsList.removeChild(predictionsList.firstChild);
  if (!preds || preds.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No hay predicciones';
    predictionsList.appendChild(li);
    return;
  }

  preds.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${p.className} — ${(p.probability * 100).toFixed(2)}%`;
    predictionsList.appendChild(li);
  });
}

async function startPredictions() {
  if (!currentStream) return;
  // Cargar modelo si no está
  try {
    await loadModel();
  } catch (err) {
    console.error('No se puede iniciar predicciones sin el modelo');
    return;
  }

  // Evitar múltiples intervalos
  if (predictInterval) return;

  // Ejecutar una predicción inmediata y luego en intervalo
  const runOnce = async () => {
    try {
      const preds = await model.classify(videoEl);
      updatePredictions(preds);
    } catch (err) {
      console.error('Error en clasificación:', err);
    }
  };

  await runOnce();
  predictInterval = setInterval(runOnce, PREDICTION_INTERVAL);
}

function stopPredictions() {
  if (predictInterval) {
    clearInterval(predictInterval);
    predictInterval = null;
  }
  // Limpiar predicciones
  updatePredictions([]);
}
