require('dotenv').config(); // Cargar variables del .env

const express = require('express');
const http = require('http');
const mqtt = require('mqtt');
const socketIO = require('socket.io');
const sql = require('mssql');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Configuración de conexión a SQL Server usando variables del .env
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '1433'),
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: false,
        enableArithAbort: true,
        trustServerCertificate: true
    },
    requestTimeout: 60000,
    connectionTimeout: 60000
};

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();

pool.on('error', err => {
    console.error('❌ Error en el pool de conexiones SQL:', err);
});

// Conexión al broker MQTT desde variable de entorno
const client = mqtt.connect(process.env.MQTT_BROKER);

// Cola para evitar pérdida de datos
let insertQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (insertQueue.length > 0) {
        const { topic, message } = insertQueue.shift();
        await insertData(topic, message);
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    isProcessingQueue = false;
}

async function insertData(topic, message) {
    try {
        await poolConnect;
        const insertQuery = `
            INSERT INTO datos (topic, message, fecha_hora)
            VALUES (@topic, @message, SYSDATETIMEOFFSET());
        `;
        await pool.request()
            .input('topic', sql.NVarChar, topic)
            .input('message', sql.NVarChar, message)
            .query(insertQuery);

        console.log('✅ Dato insertado correctamente:', topic, message);
    } catch (err) {
        console.error(`❌ Error al insertar datos (${topic}):`, err);
    }
}

// Conexión al broker MQTT
client.on('connect', () => {
    client.subscribe('devices/ESP32_001/sensors/#', err => {
        if (err) console.error('❌ Error al suscribirse al tópico:', err);
        else console.log('📡 Suscripción exitosa: devices/ESP32_001/sensors/#');
    });
});

client.on('message', (topic, message) => {
    const timestamp = Date.now();
    const data = { topic, message: message.toString(), timestamp };

    console.log(`📩 Mensaje recibido: ${topic} - ${message.toString()} - ${timestamp}`);
    io.emit('sensorData', data);
    insertQueue.push(data);
    processQueue();
});

client.on('error', err => {
    console.error('❌ Error MQTT:', err);
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rutas HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/historial.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'historial.html'));
});

// API: historial completo
app.get('/api/historial', async (req, res) => {
    try {
        await poolConnect;
        const result = await pool.request().query(`
            SELECT topic AS topico, message AS mensaje, fecha_hora AS fecha
            FROM datos
            ORDER BY fecha_hora DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('❌ Error al obtener historial:', err);
        res.status(500).send('Error al obtener historial');
    }
});

// API: historial por fecha
app.get('/api/historial/fecha', async (req, res) => {
    const fecha = req.query.fecha;
    if (!fecha) return res.status(400).send('Falta la fecha');

    const fechaInicio = new Date(`${fecha}T00:00:00.000`);
    const fechaFin = new Date(`${fecha}T23:59:59.999`);
    if (isNaN(fechaInicio) || isNaN(fechaFin)) {
        return res.status(400).send('Fecha inválida');
    }

    try {
        await poolConnect;
        const result = await pool.request()
            .input('fechaInicio', sql.DateTime, fechaInicio)
            .input('fechaFin', sql.DateTime, fechaFin)
            .query(`
                SELECT topic AS topico, message AS mensaje, fecha_hora AS fecha
                FROM datos
                WHERE fecha_hora BETWEEN @fechaInicio AND @fechaFin
                ORDER BY fecha_hora DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('❌ Error al filtrar historial:', err);
        res.status(500).send('Error al filtrar historial');
    }
});

// API: último dato por sensor
app.get('/api/ultimos-datos', async (req, res) => {
    try {
        await poolConnect;
        const result = await pool.request().query(`
            SELECT topic, message, fecha_hora
            FROM (
                SELECT topic, message, fecha_hora,
                    ROW_NUMBER() OVER (PARTITION BY topic ORDER BY fecha_hora DESC) AS rn
                FROM datos
            ) AS sub
            WHERE rn = 1
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("❌ Error últimos datos:", err);
        res.status(500).send('Error al obtener últimos datos');
    }
});

// API: última medición global
app.get('/api/ultima-medicion', async (req, res) => {
    try {
        await poolConnect;
        const result = await pool.request().query(`
            SELECT TOP 1 topic, message, fecha_hora
            FROM datos
            ORDER BY fecha_hora DESC
        `);

        res.json(result.recordset.length > 0 ? result.recordset[0] : { mensaje: "No se encontraron mediciones." });
    } catch (err) {
        console.error("❌ Error última medición:", err);
        res.status(500).send('Error al obtener la última medición');
    }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Servidor corriendo en http://localhost:${PORT}`);
});
